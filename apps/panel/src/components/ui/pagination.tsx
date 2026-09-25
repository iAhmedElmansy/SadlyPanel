"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

const DOTS = "dots" as const;

/** Builds the list of page numbers with `…` gaps around the current page. */
function range(page: number, pageCount: number, siblingCount: number): (number | typeof DOTS)[] {
  const totalNumbers = siblingCount * 2 + 5;
  if (pageCount <= totalNumbers) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const left = Math.max(page - siblingCount, 1);
  const right = Math.min(page + siblingCount, pageCount);
  const showLeftDots = left > 2;
  const showRightDots = right < pageCount - 1;

  const items: (number | typeof DOTS)[] = [1];
  if (showLeftDots) items.push(DOTS);
  for (let i = left; i <= right; i += 1) {
    if (i !== 1 && i !== pageCount) items.push(i);
  }
  if (showRightDots) items.push(DOTS);
  items.push(pageCount);
  return items;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  className?: string;
}) {
  const t = useT();
  const pages = useMemo(() => range(page, pageCount, siblingCount), [page, pageCount, siblingCount]);
  if (pageCount <= 1) return null;

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    if (clamped !== page) onPageChange(clamped);
  };

  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label={t("common.pagination")}>
      <button
        type="button"
        className="btn btn-ghost px-2 py-1.5"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label={t("common.previousPage")}
      >
        <ChevronLeft className="size-4" />
      </button>

      {pages.map((item, index) =>
        item === DOTS ? (
          <span key={`dots-${index}`} className="px-2 text-sm text-ink-dim" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => go(item)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "min-w-9 rounded-sm px-2.5 py-1.5 text-sm font-medium transition-colors",
              item === page
                ? "bg-brand/18 text-brand-soft"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className="btn btn-ghost px-2 py-1.5"
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
        aria-label={t("common.nextPage")}
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/** Client-side paging helper for local arrays. */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );
  return { page: current, setPage, pageCount, pageItems };
}
