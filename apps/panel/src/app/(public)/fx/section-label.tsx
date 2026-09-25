"use client";

import type { CSSProperties } from "react";
import { Cpu, Globe, Package as PackageIcon, Zap } from "lucide-react";
import { gsap, isRtl, useGsap } from "@/lib/motion/gsap";

/**
 * Per-section identity label. Each section on the public page gets its OWN
 * accent hue and its OWN 3D entrance so every part visibly "expresses itself":
 *
 *   flip  — letters hinge up from their baseline (a page turning), 50% 100%
 *   swing — letters swing open on the Y axis like a door, from the leading edge
 *   drop  — letters hinge down from above, 50% 0%
 *   rise  — the whole pill pops up out of depth (used for badge-style labels)
 *
 * The accent (`--section-accent`) tints the icon, the label text and a thin
 * underline bar that draws itself in — a different colour per section over the
 * shared monochrome base, kept tasteful and professional.
 *
 * Progressive enhancement: the readable state is the plain markup; GSAP only
 * sets the hidden start-state and animates from there, and no-ops entirely
 * under reduced motion (via useGsap), so no-JS and reduced-motion stay correct.
 */
type Anim = "flip" | "swing" | "drop" | "rise";
type IconName = "zap" | "cpu" | "globe" | "package";

const ICONS = { zap: Zap, cpu: Cpu, globe: Globe, package: PackageIcon } as const;


const VARIANTS: Record<Anim, { from: Record<string, number | string>; ease: string; stagger: number }> = {
  flip: {
    from: { opacity: 0, rotateX: -92, y: 8, transformOrigin: "50% 100%", transformPerspective: 640 },
    ease: "back.out(1.6)",
    stagger: 0.032,
  },
  swing: {
    from: { opacity: 0, rotateY: 92, transformOrigin: "0% 50%", transformPerspective: 640 },
    ease: "power3.out",
    stagger: 0.03,
  },
  drop: {
    from: { opacity: 0, y: -24, rotateX: 92, transformOrigin: "50% 0%", transformPerspective: 640 },
    ease: "power3.out",
    stagger: 0.028,
  },
  rise: {
    from: { opacity: 0, y: 22, scale: 0.6, rotateX: -45, transformOrigin: "50% 100%", transformPerspective: 700 },
    ease: "back.out(1.8)",
    stagger: 0.08,
  },
};

export function SectionLabel({
  icon,
  label,
  anim,
  accent,
  badge = false,
}: {
  icon: IconName;
  label: string;
  anim: Anim;
  accent: string;
  badge?: boolean;
}) {
  const Icon = ICONS[icon];
  const ref = useGsap<HTMLDivElement>(({ root }) => {
    const v = VARIANTS[anim];
    // swing hinges from whichever edge text starts at, so it reads right in RTL.
    const from = { ...v.from };
    if (anim === "swing") from.transformOrigin = isRtl() ? "100% 50%" : "0% 50%";

    const icon = root.querySelector<HTMLElement>("[data-icon]");
    const chars = gsap.utils.toArray<HTMLElement>("[data-ch]", root);
    const bar = root.querySelector<HTMLElement>("[data-bar]");
    const targets = [icon, ...chars].filter(Boolean) as HTMLElement[];

    gsap.set(targets, from);
    if (bar) gsap.set(bar, { scaleX: 0, transformOrigin: isRtl() ? "100% 50%" : "0% 50%" });

    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: "top 88%", once: true } });
    tl.to(
      targets,
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        duration: 0.55,
        ease: v.ease,
        stagger: v.stagger,
      },
      0,
    );
    if (bar) tl.to(bar, { scaleX: 1, duration: 0.6, ease: "power2.out" }, 0.12);
  }, []);

  // Split the label into per-glyph spans so each letter can animate on its own.
  // Spaces become non-breaking so inline-block spans keep their width.
  const glyphs = [...label].map((ch, i) => (
    <span key={i} data-ch className="inline-block" style={{ whiteSpace: "pre" }}>
      {ch === " " ? " " : ch}
    </span>
  ));

  if (badge) {
    return (
      <span
        ref={ref}
        className="badge"
        style={{ ["--section-accent"]: accent, borderColor: accent, color: accent } as CSSProperties}
      >
        <Icon data-icon className="size-3" style={{ color: accent }} />
        {glyphs}
      </span>
    );
  }

  return (
    <div ref={ref} className="section-label" style={{ ["--section-accent"]: accent } as CSSProperties}>
      <div className="flex items-center gap-2" style={{ color: accent }}>
        <Icon data-icon className="size-4" style={{ color: accent }} />
        <span className="text-xs font-semibold uppercase tracking-wide">{glyphs}</span>
      </div>
      <span data-bar aria-hidden className="section-label-bar" />
    </div>
  );
}
