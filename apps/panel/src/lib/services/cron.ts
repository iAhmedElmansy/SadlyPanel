/**
 * Dependency-free cron helper for the Schedules feature.
 *
 * SPanel stores the five standard cron fields (minute, hour, day-of-month,
 * month, day-of-week) as separate String columns on `Schedule`. This module
 * parses those fields, validates them, renders a human-readable summary and
 * computes the next run time in UTC — with no npm dependency.
 *
 * Supported syntax per field: star, step ("star slash n"), single values "a",
 * lists "a,b,c", ranges "a-b", stepped ranges "a-b/n" and "n/step", and any
 * comma combination. Day-of-week accepts 0-7 (0 and 7 are both Sunday).
 */

export interface CronFields {
  minute: string;
  hour: string;
  dayMonth: string;
  month: string;
  dayWeek: string;
}

interface ParsedField {
  /** Sorted, de-duplicated allowed values. */
  values: number[];
  /** True when the raw field was a bare `*`. */
  wildcard: boolean;
}

interface FieldSpec {
  key: keyof CronFields;
  label: string;
  min: number;
  max: number;
}

/** Field definitions, in cron column order. */
const FIELD_SPECS: FieldSpec[] = [
  { key: "minute", label: "minute", min: 0, max: 59 },
  { key: "hour", label: "hour", min: 0, max: 23 },
  { key: "dayMonth", label: "day-of-month", min: 1, max: 31 },
  { key: "month", label: "month", min: 1, max: 12 },
  // Day-of-week accepts 7 (Sunday) which is normalised to 0.
  { key: "dayWeek", label: "day-of-week", min: 0, max: 7 },
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Parses one cron field into its allowed values, or throws a descriptive error. */
export function parseField(raw: string, min: number, max: number, label = "field"): ParsedField {
  const field = (raw ?? "").trim();
  if (field === "") throw new Error(`The ${label} field is empty.`);
  const wildcard = field === "*";
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const piece = part.trim();
    if (!piece) throw new Error(`The ${label} field has an empty entry.`);

    const slash = piece.split("/");
    if (slash.length > 2) throw new Error(`"${piece}" is not a valid ${label} value.`);

    let step = 1;
    if (slash.length === 2) {
      const parsedStep = Number(slash[1]);
      if (!Number.isInteger(parsedStep) || parsedStep < 1) {
        throw new Error(`"${piece}" has an invalid step in the ${label} field.`);
      }
      step = parsedStep;
    }

    const rangePart = slash[0]!.trim();
    let lo: number;
    let hi: number;

    if (rangePart === "*") {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-");
      if (bounds.length !== 2) throw new Error(`"${piece}" is not a valid ${label} range.`);
      lo = Number(bounds[0]);
      hi = Number(bounds[1]);
    } else {
      lo = Number(rangePart);
      // "n/step" means "from n up to the maximum, stepping".
      hi = slash.length === 2 ? max : lo;
    }

    if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
      throw new Error(`"${piece}" is not a whole number in the ${label} field.`);
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`"${piece}" is out of range for the ${label} field (${min}-${max}).`);
    }

    for (let value = lo; value <= hi; value += step) values.add(value);
  }

  // Day-of-week: normalise 7 to 0 (both mean Sunday).
  if (max === 7 && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  return { values: [...values].sort((a, b) => a - b), wildcard };
}

interface ParsedCron {
  minute: ParsedField;
  hour: ParsedField;
  dayMonth: ParsedField;
  month: ParsedField;
  dayWeek: ParsedField;
}

/** Parses all five fields, throwing on the first invalid one. */
export function parseCron(fields: CronFields): ParsedCron {
  const parsed = {} as Record<keyof CronFields, ParsedField>;
  for (const spec of FIELD_SPECS) {
    parsed[spec.key] = parseField(fields[spec.key], spec.min, spec.max, spec.label);
  }
  return parsed as unknown as ParsedCron;
}

/** Non-throwing validation for form/action use. */
export function validateCron(fields: CronFields): { ok: true } | { ok: false; error: string } {
  try {
    parseCron(fields);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid cron expression." };
  }
}

/**
 * Whether a given UTC date matches the day fields. Follows the standard cron
 * rule: when BOTH day-of-month and day-of-week are restricted the date matches
 * if EITHER matches; otherwise the restricted field (if any) applies.
 */
function dayMatches(date: Date, parsed: ParsedCron): boolean {
  const domOk = parsed.dayMonth.values.includes(date.getUTCDate());
  const dowOk = parsed.dayWeek.values.includes(date.getUTCDay());
  if (!parsed.dayMonth.wildcard && !parsed.dayWeek.wildcard) return domOk || dowOk;
  if (!parsed.dayMonth.wildcard) return domOk;
  if (!parsed.dayWeek.wildcard) return dowOk;
  return true;
}

/**
 * Computes the next run strictly after `from` (UTC). Returns null if no match
 * is found within a five-year horizon (e.g. an impossible date like Feb 30).
 */
export function nextRun(fields: CronFields, from: Date = new Date()): Date | null {
  const parsed = parseCron(fields);

  // Start at the next whole minute after `from`.
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Cap the scan so an unsatisfiable expression terminates. Five years of
  // minutes is well beyond any realistic schedule.
  const maxIterations = 5 * 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i += 1) {
    if (!parsed.month.values.includes(cursor.getUTCMonth() + 1)) {
      // Jump to the first day of the next month at 00:00.
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(cursor, parsed)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!parsed.hour.values.includes(cursor.getUTCHours())) {
      cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!parsed.minute.values.includes(cursor.getUTCMinutes())) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return new Date(cursor.getTime());
  }

  return null;
}

function two(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Describes a list of values compactly, e.g. [0,15,30,45] within a wildcard step. */
function describeList(field: ParsedField, formatter: (value: number) => string): string {
  return field.values.map(formatter).join(", ");
}

/**
 * Renders a human-readable summary of the schedule, e.g.
 *  - "*\/5 * * * *"  -> "Every 5 minutes"
 *  - "0 3 * * *"     -> "At 03:00, every day"
 *  - "0 0 * * 0"     -> "At 00:00, on Sunday"
 */
export function describe(fields: CronFields): string {
  const validation = validateCron(fields);
  if (!validation.ok) return "Invalid schedule";

  const parsed = parseCron(fields);
  const minute = fields.minute.trim();
  const hour = fields.hour.trim();

  // --- Time-of-day component ------------------------------------------------
  let time: string;
  const minuteStep = minute.match(/^\*\/(\d+)$/);
  const hourStep = hour.match(/^\*\/(\d+)$/);

  if (minute === "*" && hour === "*") {
    time = "Every minute";
  } else if (minuteStep && hour === "*") {
    time = `Every ${minuteStep[1]} minutes`;
  } else if (parsed.minute.values.length === 1 && hour === "*") {
    time = `At ${parsed.minute.values[0]} minutes past every hour`;
  } else if (hourStep && parsed.minute.values.length === 1) {
    time = `At ${two(parsed.minute.values[0]!)} minutes past every ${hourStep[1]} hours`;
  } else if (parsed.minute.values.length === 1 && parsed.hour.values.length === 1) {
    time = `At ${two(parsed.hour.values[0]!)}:${two(parsed.minute.values[0]!)}`;
  } else if (minute === "*") {
    time = `Every minute during hour ${describeList(parsed.hour, (h) => two(h))}`;
  } else {
    const minutes = describeList(parsed.minute, (m) => two(m));
    const hours = hour === "*" ? "every hour" : describeList(parsed.hour, (h) => two(h));
    time = `At minute ${minutes} of ${hours}`;
  }

  // --- Day / month component ------------------------------------------------
  const dayParts: string[] = [];
  if (!parsed.dayWeek.wildcard) {
    dayParts.push(`on ${describeList(parsed.dayWeek, (d) => WEEKDAY_NAMES[d] ?? String(d))}`);
  }
  if (!parsed.dayMonth.wildcard) {
    dayParts.push(`on day ${describeList(parsed.dayMonth, (d) => String(d))} of the month`);
  }
  if (!parsed.month.wildcard) {
    dayParts.push(`in ${describeList(parsed.month, (m) => MONTH_NAMES[m - 1] ?? String(m))}`);
  }

  const when = dayParts.length > 0 ? dayParts.join(", ") : "every day";

  // "Every minute" / "Every N minutes" already read as full sentences; only
  // append the day clause when it narrows the schedule.
  if ((time.startsWith("Every") && when === "every day")) return time;
  return `${time}, ${when}`;
}

/** The raw five-field cron string, for logging/tooltips. */
export function cronExpression(fields: CronFields): string {
  return [fields.minute, fields.hour, fields.dayMonth, fields.month, fields.dayWeek]
    .map((f) => f.trim())
    .join(" ");
}
