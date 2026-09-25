"use client";

import { useEffect } from "react";
import { gsap } from "@/lib/motion/gsap";

/**
 * A studiors-style custom cursor: a small solid dot that tracks the pointer
 * 1:1, and a larger ring that trails it with easing. The ring swells and can
 * show a contextual label over interactive targets. Elements opt into the
 * label via `data-cursor-label="…"`; any <a>/<button> gets the swell for free.
 *
 * Progressive enhancement: only activates on fine pointers (real mouse) and
 * when reduced motion is off. Renders nothing otherwise, leaving the native
 * cursor untouched — so touch, keyboard and JS-off users are unaffected.
 */
export function CustomCursor() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduce.matches) return;

    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    const label = document.createElement("span");
    label.className = "cursor-ring__label";
    ring.appendChild(label);
    document.body.append(dot, ring);
    document.documentElement.classList.add("has-cursor");

    // Centre both elements on the pointer; gsap composes xPercent/yPercent with
    // the animated x/y into one transform (so CSS needn't translate(-50%)).
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });

    // The ring trails the pointer with a short ease so it feels natural but
    // stays right under the hand (tightened from 0.24s — the old trail lagged).
    const xTo = gsap.quickTo(ring, "x", { duration: 0.15, ease: "power3" });
    const yTo = gsap.quickTo(ring, "y", { duration: 0.15, ease: "power3" });
    const dxTo = gsap.quickTo(dot, "x", { duration: 0.03, ease: "power2" });
    const dyTo = gsap.quickTo(dot, "y", { duration: 0.03, ease: "power2" });

    let shown = false;
    const move = (e: PointerEvent) => {
      if (!shown) {
        shown = true;
        gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
      }
      xTo(e.clientX);
      yTo(e.clientY);
      dxTo(e.clientX);
      dyTo(e.clientY);
    };

    const INTERACTIVE = 'a, button, [data-cursor-label], input, textarea, select, [role="button"]';
    const over = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest?.(INTERACTIVE) as HTMLElement | null;
      if (!el) return;
      const text = el.getAttribute("data-cursor-label");
      ring.classList.add("is-active");
      if (text) {
        label.textContent = text;
        ring.classList.add("has-label");
      }
    };
    const out = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest?.(INTERACTIVE);
      if (!el) return;
      ring.classList.remove("is-active", "has-label");
      label.textContent = "";
    };
    // Reset `shown` so the cursor reliably fades back in on re-entry — without
    // this it could stay invisible after the pointer left and returned.
    const leave = () => {
      shown = false;
      gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    document.addEventListener("pointerleave", leave);

    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerleave", leave);
      document.documentElement.classList.remove("has-cursor");
      dot.remove();
      ring.remove();
    };
  }, []);

  return null;
}
