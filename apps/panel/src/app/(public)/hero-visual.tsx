"use client";

import { Boxes, Cpu, Database, HardDrive, MemoryStick, Terminal } from "lucide-react";
import { gsap, useGsap } from "@/lib/motion/gsap";

/**
 * Decorative hero visual — a stylised server panel, now a **floating 3D
 * console**. It rides a shared preserve-3d stage where its header, resource
 * meters and console strip each sit at their own depth, and the whole panel
 * banks toward the pointer (rotateX/rotateY follow the cursor) while breathing
 * up and down on an idle float — so it reads as a real object hovering in space
 * rather than a flat card. Purely presentational (aria-hidden), built entirely
 * from design tokens and non-text shapes so it needs no translation and stays
 * crisp in both themes.
 *
 * Progressive enhancement: the layer depths are plain CSS transforms that the
 * reduced-motion rules flatten (.d3 / .d3-layer → transform:none), and the
 * pointer/float animation no-ops under reduced motion (useGsap), so the panel
 * is always visible and readable with or without JS.
 */
export function HeroVisual() {
  const meters = [
    { icon: MemoryStick, w: "72%" },
    { icon: Cpu, w: "48%" },
    { icon: HardDrive, w: "60%" },
    { icon: Database, w: "34%" },
  ];

  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const panel = root.querySelector<HTMLElement>("[data-hero-panel]");
    if (!panel) return;

    // Bank toward the pointer — a persistent, always-on parallax lean.
    const rotY = gsap.quickTo(panel, "rotationY", { duration: 0.6, ease: "power3" });
    const rotX = gsap.quickTo(panel, "rotationX", { duration: 0.6, ease: "power3" });
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      rotY(nx * 16);
      rotX(-ny * 12);
    };
    window.addEventListener("pointermove", onMove);

    // Idle float so it hovers even before the pointer moves.
    const bob = gsap.to(panel, { y: -12, duration: 3.2, ease: "sine.inOut", repeat: -1, yoyo: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      bob.kill();
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="animate-in hidden lg:block">
      <div className="stage-3d">
        <div data-hero-panel className="panel-card elevated-lg d3 relative p-5">
          {/* Title row with a "running" status dot — nearest layer to the reader */}
          <div
            className="d3-layer flex items-center justify-between border-b border-line-soft pb-4"
            style={{ transform: "translateZ(30px)" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg border border-brand/30 bg-brand/12 text-brand-soft">
                <Boxes className="size-4" />
              </span>
              <div className="space-y-1.5">
                <div className="h-2.5 w-28 rounded-full bg-surface-3" />
                <div className="h-2 w-16 rounded-full bg-surface-2" />
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/12 px-2 py-1">
              <span className="size-1.5 rounded-full bg-ok animate-pulse-soft" />
              <span className="h-1.5 w-8 rounded-full bg-ok/40" />
            </span>
          </div>

          {/* Resource meters — mid depth */}
          <div className="d3-layer mt-4 space-y-3" style={{ transform: "translateZ(16px)" }}>
            {meters.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <m.icon className="size-4 shrink-0 text-ink-dim" />
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: m.w,
                      background: "linear-gradient(90deg, var(--color-brand-dim), var(--color-brand))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Console strip — floats highest, like a screen raised above the deck */}
          <div
            className="console-shell d3-layer mt-4 space-y-2 p-4"
            style={{ transform: "translateZ(46px)" }}
          >
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-brand-soft" />
              <div className="h-2 w-24 rounded-full bg-surface-3" />
            </div>
            <div className="h-1.5 w-11/12 rounded-full bg-surface-2" />
            <div className="h-1.5 w-3/4 rounded-full bg-surface-2" />
            <div className="h-1.5 w-9/12 rounded-full bg-surface-2" />
            <div className="flex items-center gap-2">
              <span className="text-brand-soft">›</span>
              <div className="h-1.5 w-1/3 rounded-full bg-brand/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
