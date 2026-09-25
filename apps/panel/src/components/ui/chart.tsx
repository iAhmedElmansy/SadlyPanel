"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { stroke: "var(--color-ink-dim)", fontSize: 10 } as const;
const GRID = "var(--color-line-soft)";

type Row = Record<string, unknown>;

function TrendTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2 text-[11px] shadow-lg">
      {label ? <p className="mb-1 text-ink-dim">{label}</p> : null}
      {payload.map((row) => (
        <p key={row.name} className="flex items-center gap-1.5 text-ink">
          <span className="size-1.5 rounded-full" style={{ background: row.color }} />
          {row.name}: {formatter && typeof row.value === "number" ? formatter(row.value) : row.value}
        </p>
      ))}
    </div>
  );
}

/**
 * Filled area trend backed by a ResponsiveContainer. `color` accepts any CSS
 * colour and defaults to the brand token; the fill is a matching gradient.
 */
export function AreaTrend({
  data,
  dataKey,
  xKey = "time",
  color = "var(--color-brand)",
  height = 208,
  name,
  valueFormatter,
  showGrid = true,
  showAxes = true,
  yDomain,
  yUnit,
}: {
  data: Row[];
  dataKey: string;
  xKey?: string;
  color?: string;
  height?: number;
  name?: string;
  valueFormatter?: (value: number) => string;
  showGrid?: boolean;
  showAxes?: boolean;
  yDomain?: [number | "auto", number | "auto"];
  yUnit?: string;
}) {
  const gradientId = `area-fill-${useId().replace(/[:]/g, "")}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: showAxes ? -18 : 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {showGrid ? <CartesianGrid stroke={GRID} vertical={false} /> : null}
          {showAxes ? (
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
          ) : null}
          {showAxes ? (
            <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={yDomain} unit={yUnit} width={44} />
          ) : null}
          <Tooltip content={<TrendTooltip formatter={valueFormatter} />} />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={name ?? dataKey}
            stroke={color}
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Compact, axis-less area chart for inline trends. Fills its container width;
 * set `height` (default 40px) for the row it sits in.
 */
export function Sparkline({
  data,
  dataKey,
  color = "var(--color-brand)",
  height = 40,
}: {
  data: Row[];
  dataKey: string;
  color?: string;
  height?: number;
}): ReactNode {
  const gradientId = `spark-fill-${useId().replace(/[:]/g, "")}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
