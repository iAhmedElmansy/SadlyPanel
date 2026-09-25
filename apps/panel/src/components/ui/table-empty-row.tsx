"use client";

import { useT } from "@/lib/i18n/preferences";

/** Default "no rows" cell text for DataTable. Client-only so it can translate. */
export function TableEmptyRow({ colSpan }: { colSpan: number }) {
  const t = useT();
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-ink-dim">
        {t("common.noRecords")}
      </td>
    </tr>
  );
}
