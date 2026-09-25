import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { TableEmptyRow } from "./table-empty-row";

export interface Column<T> {
  /** Unique column key; also used to read a raw value when `render` is omitted. */
  key: string;
  header: ReactNode;
  /** Custom cell renderer. Falls back to `String(row[key])` when omitted. */
  render?: (row: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  /** Extra classes applied to both the header and body cells of this column. */
  className?: string;
}

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

/**
 * Thin, typed wrapper around the global `.table-base` styling. Purely
 * presentational — pass a `columns` schema and `rows`, and identify each row
 * with `keyField`. Renders an accessible empty state when there are no rows.
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField,
  empty,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  empty?: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty !== undefined) {
    return typeof empty === "string" ? <EmptyState title={empty} /> : <>{empty}</>;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="table-base">
        {caption ? <caption className="px-1 pb-3 text-start text-xs text-ink-dim">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(column.align ? ALIGN[column.align] : undefined, column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <TableEmptyRow colSpan={columns.length} />
          ) : (
            rows.map((row, index) => (
              <tr key={String(row[keyField])}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(column.align ? ALIGN[column.align] : undefined, column.className)}
                  >
                    {column.render ? column.render(row, index) : ((row[column.key] ?? "—") as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Right-aligned container for per-row action buttons inside a table cell. */
export function TableActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-end gap-1.5", className)}>{children}</div>;
}
