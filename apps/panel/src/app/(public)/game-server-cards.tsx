"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Boxes, Gauge, Terminal } from "lucide-react";
import { gsap, isRtl, useGsap } from "@/lib/motion/gsap";

/**
 * Game-servers feature showcase — a 3D cover-flow deck. The three features
 * (Live console, One-click eggs, Resource limits) ride a shared-perspective
 * carousel: the front card stands upright and readable while its neighbours
 * angle back into depth, and the deck auto-rotates through them. A deliberately
 * different motion vocabulary from the other sections — not the old pinned
 * staircase, and no pointer-follow — while every card keeps its own always-on
 * micro-visual mirroring what the feature does.
 *
 * Progressive enhancement: the deck renders as a plain, fully readable
 * responsive grid from markup alone. Only once JS mounts AND motion is allowed
 * (and the viewport is wide enough) does it upgrade to the live cover-flow
 * (`.is-live`); under reduced motion or with no JS it stays a static grid.
 */
type Kind = "console" | "eggs" | "limits";
export type GameCard = { kind: Kind; title: string; body: string };

const ICONS: Record<Kind, typeof Terminal> = {
  console: Terminal,
  eggs: Boxes,
  limits: Gauge,
};

/** Layout effect that quietly degrades to a plain effect during SSR. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ROTATE_MS = 3800;

export function GameServerCards({ cards }: { cards: GameCard[] }) {
  const rtl = isRtl();
  const [live, setLive] = useState(false);
  const [active, setActive] = useState(0);
  const paused = useRef(false);

  // Per-feature micro-visual loops (console log stream, egg picker, resource
  // meters). Kept from the original design; they no-op under reduced motion.
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const logs = gsap.utils.toArray<HTMLElement>("[data-log]", root);
    if (logs.length) {
      gsap.set(logs, { opacity: 0.28 });
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
      logs.forEach((l) =>
        tl
          .to(l, { opacity: 1, duration: 0.22, ease: "power2.out" })
          .to(l, { opacity: 0.28, duration: 0.3 }, "+=0.35"),
      );
    }

    const eggs = gsap.utils.toArray<HTMLElement>("[data-eggfill]", root);
    if (eggs.length) {
      gsap.set(eggs, { opacity: 0, scale: 0.55 });
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      eggs.forEach((e) =>
        tl
          .to(e, { opacity: 1, scale: 1, duration: 0.28, ease: "back.out(2.2)" })
          .to(e, { opacity: 0, scale: 0.55, duration: 0.22, ease: "power1.in" }, "+=0.34"),
      );
    }

    const meters = gsap.utils.toArray<HTMLElement>("[data-meterfill]", root);
    meters.forEach((m, i) => {
      const from = [40, 30, 18][i % 3];
      const to = [72, 54, 38][i % 3];
      gsap.fromTo(
        m,
        { width: `${from}%` },
        { width: `${to}%`, duration: 1.6 + i * 0.25, ease: "sine.inOut", repeat: -1, yoyo: true },
      );
    });

    // One-time entrance: lift the whole deck in as it scrolls into view.
    const deck = root.querySelector(".gs-deck");
    if (deck) {
      gsap.from(deck, {
        autoAlpha: 0,
        y: 40,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: deck, start: "top 82%" },
      });
    }
  }, []);

  // Upgrade to the live cover-flow only when motion is allowed and the screen
  // is wide enough, then auto-rotate through the cards.
  useIsoLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    setLive(true);
    const id = window.setInterval(() => {
      if (!paused.current) setActive((a) => (a + 1) % cards.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [cards.length]);

  // Cover-flow placement for card i relative to the active one. Applied only
  // once live; in grid mode the cards flow normally with no inline transform.
  const slideStyle = (i: number): CSSProperties | undefined => {
    if (!live) return undefined;
    const n = cards.length;
    const rel = (i - active + n) % n; // 0 = front, 1 = right, n-1 = left
    const dir = rtl ? -1 : 1;
    let off = 0;
    let tz = 0;
    let ry = 0;
    let scale = 1;
    let opacity = 1;
    let z = 3;
    let blur = 0;
    if (rel === 1) {
      off = 62 * dir;
      tz = -260;
      ry = -40 * dir;
      scale = 0.82;
      opacity = 0.5;
      z = 2;
      blur = 2;
    } else if (rel === n - 1) {
      off = -62 * dir;
      tz = -260;
      ry = 40 * dir;
      scale = 0.82;
      opacity = 0.5;
      z = 2;
      blur = 2;
    } else if (rel !== 0) {
      tz = -520;
      scale = 0.6;
      opacity = 0;
      z = 1;
    }
    return {
      transform: `translate(-50%, 0) translateX(${off}%) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`,
      opacity,
      zIndex: z,
      filter: blur ? `blur(${blur}px)` : undefined,
      pointerEvents: rel === 0 ? undefined : "none",
      boxShadow:
        rel === 0
          ? "0 34px 70px -32px color-mix(in srgb, var(--color-brand) 45%, transparent)"
          : undefined,
    };
  };

  return (
    <div ref={ref} className="mt-8">
      <div
        className={`gs-deck${live ? " is-live" : ""}`}
        onPointerEnter={() => {
          paused.current = true;
        }}
        onPointerLeave={() => {
          paused.current = false;
        }}
      >
        {cards.map((card, i) => {
          const Icon = ICONS[card.kind];
          return (
            <article
              key={card.title}
              className="gs-slide panel-card flex h-full flex-col p-5"
              style={slideStyle(i)}
            >
              <span className="grid size-9 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-brand-soft">
                <Icon className="size-4" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink">{card.title}</h3>
              <p className="mt-1.5 text-sm text-ink-muted">{card.body}</p>
              <div className="flex-1" />
              <div className="mt-5">
                <Visual kind={card.kind} />
              </div>
            </article>
          );
        })}
      </div>

      {live ? (
        <div className="mt-6 flex items-center justify-center gap-2.5">
          {cards.map((card, i) => (
            <button
              key={card.title}
              type="button"
              onClick={() => setActive(i)}
              className={`gs-dot${i === active ? " is-on" : ""}`}
              aria-label={card.title}
              aria-current={i === active}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

}

/** The per-feature animated strip. Rendered aria-hidden — purely illustrative. */
function Visual({ kind }: { kind: Kind }) {
  if (kind === "console") {
    return (
      <div aria-hidden className="console-shell space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-ok animate-pulse-soft" />
          <span className="font-mono text-[0.625rem] uppercase tracking-wide text-ink-dim">running</span>
        </div>
        {["w-11/12", "w-3/4", "w-9/12", "w-2/3"].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-mono text-xs text-brand-soft">›</span>
            <div data-log className={`h-1.5 rounded-full bg-surface-3 ${w}`} />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "eggs") {
    return (
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="relative grid aspect-square place-items-center rounded-lg border border-line bg-surface-2"
          >
            <span className="size-3 rounded-md bg-surface-3" />
            <span
              data-eggfill
              className="pointer-events-none absolute inset-0 rounded-lg border border-brand/60 bg-brand/12 opacity-0"
            />
          </div>
        ))}
      </div>
    );
  }
  // limits — enforced resource meters with a hard-cap marker.
  const meters = [
    { label: "CPU", cap: "85%" },
    { label: "RAM", cap: "70%" },
    { label: "DISK", cap: "55%" },
  ];
  return (
    <div aria-hidden className="space-y-2.5">
      {meters.map((m) => (
        <div key={m.label} className="space-y-1">
          <span className="font-mono text-[0.625rem] uppercase tracking-wide text-ink-dim">{m.label}</span>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              data-meterfill
              className="h-full rounded-full"
              style={{ width: "40%", background: "linear-gradient(90deg, var(--color-brand-dim), var(--color-brand))" }}
            />
            {/* hard cap the server can never exceed */}
            <span className="absolute inset-y-0 w-px bg-brand-soft/70" style={{ left: m.cap }} />
          </div>
        </div>
      ))}
    </div>
  );
}
