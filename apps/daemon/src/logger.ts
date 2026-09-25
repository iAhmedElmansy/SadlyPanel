export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLOURS: Record<LogLevel, string> = {
  debug: "\x1b[38;5;244m",
  info: "\x1b[38;5;39m",
  warn: "\x1b[38;5;214m",
  error: "\x1b[38;5;203m",
};

let minimum: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minimum = level;
}

function emit(level: LogLevel, scope: string, message: string, extra?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimum]) return;
  const stamp = new Date().toISOString();
  const prefix = `${COLOURS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${stamp} \x1b[38;5;61m[${scope}]\x1b[0m`;
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${prefix} ${message}\n`);
  if (extra !== undefined) {
    const rendered = extra instanceof Error ? (extra.stack ?? extra.message) : JSON.stringify(extra, null, 2);
    stream.write(`${rendered}\n`);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => emit("debug", scope, message, extra),
    info: (message: string, extra?: unknown) => emit("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => emit("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => emit("error", scope, message, extra),
    child: (suffix: string) => createLogger(`${scope}:${suffix}`),
  };
}

export type Logger = ReturnType<typeof createLogger>;
