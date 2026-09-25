"use client";

import { createElement, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal wrapper. Children start lowered + faded (via .reveal) and rise
 * into place the first time they enter the viewport. Honours reduced-motion
 * (the CSS neutralises the transform) and reveals immediately if Intersection
 * Observer is unavailable. An optional delay staggers sibling reveals.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  direction,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  /** Direction the element travels from as it reveals. Defaults to "up". */
  direction?: "up" | "left" | "right" | "scale";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return createElement(
    Tag,
    {
      ref,
      className: cn(
        "reveal",
        direction === "left" && "reveal-left",
        direction === "right" && "reveal-right",
        direction === "scale" && "reveal-scale",
        visible && "is-visible",
        className,
      ),
      style: delay ? { transitionDelay: `${delay}ms` } : undefined,
    },
    children,
  );
}
