"use client";

import { type ReactNode } from "react";
import { Lock } from "lucide-react";
import { gsap, isRtl, useGsap } from "@/lib/motion/gsap";

/**
 * Web-hosting section — a **layered-parallax 3D device**. The browser mockup no
 * longer sits flat: it rides a shared preserve-3d stage where an ambient glow
 * plane sits behind it, the panel itself in the middle, and a floating "secure"
 * badge in front — three planes at different depths that shear past one another
 * as the whole device slowly TURNS in space (rotateY/rotateX) while the section
 * is scrubbed through. On top of that the panel still plays its live "deploy"
 * loop: it types a domain into the address bar, flips on the HTTPS lock, then
 * paints the page in. The feature rows fly in from the opposite depth to the
 * device, so the two halves meet in 3D. Distinct from every other section:
 * continuous, always-visible turning motion rather than pointer tilt, a scroll
 * staircase, a depth conveyor or a flip-up.
 *
 * Progressive enhancement: all markup is visible by default, the racked/rotated
 * states are set by JS only, and the effect no-ops under reduced motion (the
 * stage also collapses to a flat projection in CSS) — so the section always
 * reads correctly with no blank band.
 */
export function WebHostingShowcase({ children }: { children: ReactNode }) {
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const rtl = isRtl();

    // Feature rows fly in from the depth OPPOSITE the device's lean, so the two
    // sides of the section converge in 3D. immediateRender off keeps them
    // visible until the trigger fires (already-in-view / capture / failure).
    const rows = gsap.utils.toArray<HTMLElement>("[data-feat]", root);
    gsap.from(rows, {
      opacity: 0,
      x: rtl ? -30 : 30,
      z: -240,
      rotateY: rtl ? 30 : -30,
      transformOrigin: rtl ? "0% 50%" : "100% 50%",
      transformPerspective: 900,
      duration: 0.7,
      stagger: 0.12,
      ease: "power3.out",
      immediateRender: false,
      scrollTrigger: { trigger: root, start: "top 82%", once: true },
    });

    // The device: a one-time rise into view, then a continuous scrubbed TURN so
    // the three planes keep shearing past each other the whole time it's read.
    const device = root.querySelector<HTMLElement>("[data-device]");
    if (device) {
      gsap.from(device, {
        opacity: 0,
        y: 48,
        scale: 0.94,
        transformOrigin: "50% 100%",
        duration: 0.9,
        ease: "power3.out",
        immediateRender: false,
        scrollTrigger: { trigger: root, start: "top 82%", once: true },
      });
      gsap.fromTo(
        device,
        { rotateY: rtl ? -16 : 16, rotateX: 9 },
        {
          rotateY: rtl ? 7 : -7,
          rotateX: -5,
          ease: "none",
          scrollTrigger: { trigger: root, start: "top 85%", end: "bottom 38%", scrub: 0.8 },
        },
      );
    }

    // ── The live "deploy" loop (types the domain, secures it, paints the page).
    const urlWrap = root.querySelector<HTMLElement>("[data-urlwrap]");
    const urlText = root.querySelector<HTMLElement>("[data-url]");
    const caret = root.querySelector<HTMLElement>("[data-caret]");
    const lock = root.querySelector<HTMLElement>("[data-lock]");
    const blocks = gsap.utils.toArray<HTMLElement>("[data-block]", root);
    const status = root.querySelector<HTMLElement>("[data-status]");
    if (!urlWrap || !urlText) return;

    const target = urlText.scrollWidth; // measured full width of the domain text

    const tl = gsap.timeline({
      repeat: -1,
      repeatDelay: 1.6,
      defaults: { ease: "power2.out" },
      scrollTrigger: { trigger: root, start: "top 75%" },
    });
    tl.set(urlWrap, { width: 0 })
      .set(caret, { opacity: 1 })
      .set(lock, { opacity: 0, scale: 0.5 })
      .set(blocks, { opacity: 0, y: 12 })
      .set(status, { opacity: 0, y: 6 })
      // Type the domain (stepped width reveal + blinking caret).
      .to(caret, { opacity: 0.2, duration: 0.28, repeat: 5, yoyo: true }, 0)
      .to(urlWrap, { width: target, duration: 1.2, ease: "steps(16)" }, 0)
      .to(caret, { opacity: 0, duration: 0.2 })
      // Secure it.
      .to(lock, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, "-=0.05")
      // Paint the page in.
      .to(blocks, { opacity: 1, y: 0, duration: 0.5, stagger: 0.12 }, "+=0.1")
      .to(status, { opacity: 1, y: 0, duration: 0.4 }, "-=0.15");
  }, []);

  return (
    <div ref={ref} className="mt-8 grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
      {/* Feature list (server-rendered rows) */}
      <ul className="space-y-3">{children}</ul>

      {/* Turning multi-plane device — perspective on the stage, preserve-3d on
          the device, so its glow / panel / badge planes hold real depth. */}
      <div className="stage-3d">
        <div data-device className="d3 relative">
          {/* Plane 1 — ambient glow parked behind the panel. */}
          <div
            aria-hidden
            className="d3-layer pointer-events-none absolute -inset-6 rounded-[2rem]"
            style={{
              transform: "translateZ(-90px)",
              background:
                "radial-gradient(60% 60% at 50% 40%, color-mix(in srgb, var(--section-accent, var(--color-brand)) 26%, transparent), transparent 70%)",
            }}
          />

          {/* Plane 2 — the browser panel (token-only shapes, decorative). */}
          <div data-mock aria-hidden className="panel-card elevated-lg relative overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-3 border-b border-line-soft bg-surface-2/60 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-surface-3" />
                <span className="size-2.5 rounded-full bg-surface-3" />
                <span className="size-2.5 rounded-full bg-surface-3" />
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5">
                <span data-lock className="text-ok">
                  <Lock className="size-3.5" />
                </span>
                <span className="inline-flex items-center font-mono text-xs text-ink-muted">
                  <span data-urlwrap className="inline-block overflow-hidden whitespace-nowrap align-bottom">
                    <span data-url>app.yoursite.io</span>
                  </span>
                  <span data-caret className="ms-0.5 inline-block h-3.5 w-px bg-brand" />
                </span>
              </div>
            </div>

            {/* Page being painted in */}
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <span data-block className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-brand-dim to-brand" />
                <div className="space-y-1.5">
                  <div data-block className="h-2.5 w-32 rounded-full bg-surface-3" />
                  <div data-block className="h-2 w-20 rounded-full bg-surface-2" />
                </div>
              </div>
              <div data-block className="h-24 rounded-lg bg-gradient-to-br from-surface-3 to-surface-2" />
              <div className="grid grid-cols-3 gap-3">
                <div data-block className="h-14 rounded-lg bg-surface-2" />
                <div data-block className="h-14 rounded-lg bg-surface-2" />
                <div data-block className="h-14 rounded-lg bg-surface-2" />
              </div>
              <div className="flex items-center justify-between pt-1">
                <div data-block className="h-2 w-24 rounded-full bg-surface-2" />
                <span
                  data-status
                  className="inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/12 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ok"
                >
                  <span className="size-1.5 rounded-full bg-ok" />
                  Deployed
                </span>
              </div>
            </div>
          </div>

          {/* Plane 3 — a "secured" badge floating in front of the panel. */}
          <div
            aria-hidden
            className="d3-layer absolute -right-3 -top-3 flex items-center gap-1.5 rounded-full border border-brand/40 bg-surface px-2.5 py-1 shadow-lg"
            style={{ transform: "translateZ(64px)" }}
          >
            <Lock className="size-3 text-brand-soft" />
            <span className="h-1.5 w-8 rounded-full bg-brand/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
