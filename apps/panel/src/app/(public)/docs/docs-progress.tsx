"use client";

import { useEffect, useRef } from "react";

/**
 * Docs reading aid (navigational utility, not decoration): a slim top progress
 * bar tracks how far through the page you've read, and the side-nav anchor for
 * the section currently in view is highlighted (scroll-spy). Pure position
 * feedback — safe under reduced motion.
 */
export function DocsProgress({ ids }: { ids: string[] }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const links = new Map<string, HTMLAnchorElement>();
    ids.forEach((id) => {
      const a = document.querySelector<HTMLAnchorElement>(`nav a[href="#${id}"]`);
      if (a) links.set(id, a);
    });

    const ACTIVE = ["bg-surface-2", "text-ink"];
    const setActive = (id: string | null) => {
      links.forEach((a, key) => {
        const on = key === id;
        a.classList.toggle(ACTIVE[0], on);
        a.classList.toggle(ACTIVE[1], on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${p})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    sections.forEach((s) => io.observe(s));

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [ids]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-16 z-30 h-0.5">
      <div
        ref={barRef}
        className="h-full origin-left bg-brand"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
