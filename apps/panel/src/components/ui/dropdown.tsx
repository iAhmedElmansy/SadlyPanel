"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

export interface DropdownItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

/**
 * Accessible menu: a trigger plus a floating panel. The panel is rendered in a
 * portal on `document.body` and positioned with `getBoundingClientRect()` so it
 * is never clipped by an `overflow` ancestor (e.g. a scrolling table wrapper).
 * Handles Esc, ArrowUp/Down roving focus, Enter/Space to select, outside-click
 * and blur to close, and repositions/closes on scroll and resize.
 */
export function Dropdown({
  trigger,
  items,
  align = "right",
  className,
  menuClassName,
  label,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
  menuClassName?: string;
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const enabledIndexes = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = menu?.offsetWidth ?? 176;
    const menuHeight = menu?.offsetHeight ?? 0;
    const gap = 4;

    let left = align === "right" ? rect.right - menuWidth : rect.left;
    // Keep the menu inside the viewport horizontally.
    left = Math.min(Math.max(8, left), window.innerWidth - menuWidth - 8);

    // Flip above the trigger when there is not enough room below.
    const below = rect.bottom + gap;
    const flip = below + menuHeight > window.innerHeight - 8 && rect.top - gap - menuHeight > 8;
    const top = flip ? rect.top - gap - menuHeight : below;

    setCoords({ top, left });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const first = enabledIndexes[0] ?? 0;
    setActive(first);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onReflow = () => reposition();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, close, reposition]);

  const move = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const current = enabledIndexes.indexOf(active);
    const next = enabledIndexes[(current + direction + enabledIndexes.length) % enabledIndexes.length];
    setActive(next);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(enabledIndexes[0] ?? 0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(enabledIndexes[enabledIndexes.length - 1] ?? 0);
    }
  };

  const select = (item: DropdownItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect();
  };

  const menuStyle: CSSProperties = {
    position: "fixed",
    top: coords?.top ?? 0,
    left: coords?.left ?? 0,
    visibility: coords ? "visible" : "hidden",
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-block", className)}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (rootRef.current?.contains(next) || menuRef.current?.contains(next)) return;
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={typeof trigger === "string" ? undefined : (label ?? t("common.openMenu"))}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>

      {open
        ? createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-orientation="vertical"
              onKeyDown={onMenuKeyDown}
              style={menuStyle}
              className={cn(
                "panel-card glass animate-in z-50 min-w-44 overflow-hidden p-1 shadow-2xl",
                menuClassName,
              )}
            >
              {items.map((item, index) => (
                <button
                  key={index}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={index === active ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => select(item)}
                  onMouseEnter={() => !item.disabled && setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    item.tone === "danger"
                      ? "text-bad hover:bg-bad/12 focus:bg-bad/12"
                      : "text-ink-muted hover:bg-surface-3 hover:text-ink focus:bg-surface-3 focus:text-ink",
                  )}
                >
                  {item.icon ? <span className="grid size-4 shrink-0 place-items-center">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
