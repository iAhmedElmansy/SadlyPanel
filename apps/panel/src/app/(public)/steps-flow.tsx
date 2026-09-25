"use client";

import { gsap, isRtl, useGsap, ScrollTrigger } from "@/lib/motion/gsap";

type Step = { n: string; title: string; body: string };

/**
 * "How it works" flow — a genuine-3D **depth conveyor**. The three step cards
 * start racked far back in Z at staggered depths on a shared preserve-3d stage,
 * then dolly forward one-by-one toward the reader as the section is scrubbed
 * into view, each locking flat at z:0 as the next rises out of the depth behind
 * it. A connecting rail draws between them and a packet rides it in step with
 * the scroll. This is a different 3D vocabulary from every neighbour — the
 * game-servers staircase deals from above, the web-hosting device turns in
 * place, this one travels through depth toward you. Mirrors under RTL.
 *
 * Progressive enhancement: the initial racked-back state is set by JS only, so
 * no-JS keeps all three cards flat and readable, and the whole thing no-ops
 * under reduced motion (the stage also collapses to a flat projection in CSS).
 */
export function StepsFlow({ steps }: { steps: Step[] }) {
  const ref = useGsap<HTMLDivElement>(({ root, rtl }) => {
    const path = root.querySelector<SVGPathElement>("[data-beam]");
    const dot = root.querySelector<SVGCircleElement>("[data-dot]");
    const cards = gsap.utils.toArray<HTMLElement>("[data-step]", root);
    if (!cards.length) return;

    // ── The conveyor: cards recede into Z, then dolly forward one at a time ──
    // Each card sits deeper than the one before so they arrive front-to-back as
    // the scrub advances; the stagger inside a scrubbed timeline is what spaces
    // their arrivals out into a one-by-one travel rather than a single surge.
    gsap.set(cards, {
      autoAlpha: 0,
      z: (i: number) => -640 - i * 240,
      y: 40,
      rotateX: -18,
      rotateY: rtl ? -12 : 12,
      transformOrigin: "50% 50%",
    });

    gsap.to(cards, {
      autoAlpha: 1,
      z: 0,
      y: 0,
      rotateX: 0,
      rotateY: 0,
      ease: "power2.out",
      stagger: 0.55,
      scrollTrigger: { trigger: root, start: "top 85%", end: "top 32%", scrub: 0.6 },
    });

    // The connecting rail draws in step with the scroll (scrubbed progress).
    if (path) {
      const svg = path.ownerSVGElement;
      if (svg && rtl) svg.style.transform = "scaleX(-1)";
      const len = path.getTotalLength();
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });

      const st = { trigger: root, start: "top 80%", end: "top 34%", scrub: 0.6 } as const;
      gsap.to(path, { strokeDashoffset: 0, ease: "none", scrollTrigger: st });

      ScrollTrigger.create({
        ...st,
        onUpdate: (self) => {
          if (!dot) return;
          const pt = path.getPointAtLength(self.progress * len);
          dot.setAttribute("cx", String(pt.x));
          dot.setAttribute("cy", String(pt.y));
          dot.style.opacity = self.progress > 0.01 && self.progress < 0.99 ? "1" : "0";
        },
      });
    }
  }, []);

  return (
    <div ref={ref} className="mt-8">
      {/* Connecting rail (sm+ only, where the cards sit in a row) */}
      <svg
        aria-hidden
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        className="mb-3 hidden h-6 w-full sm:block"
      >
        <path d="M 60 20 L 940 20" stroke="var(--color-line)" strokeWidth="2" fill="none" />
        <path
          data-beam
          d="M 60 20 L 940 20"
          stroke="var(--color-brand)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <circle data-dot cx="60" cy="20" r="4" fill="var(--color-brand)" style={{ opacity: 0 }} />
      </svg>

      {/* Shared 3D stage — perspective here, preserve-3d on the grid, so each
          card keeps a real depth relative to its siblings as it travels. */}
      <div className="stage-3d-near">
        <div className="d3 grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.n} data-step className="panel-card lift h-full p-6">
              <span className="grid size-10 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-sm font-semibold text-brand-soft">
                {step.n}
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
