# Landing Motion & Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shallow landing effects with a system of purposeful, distinct motion across all four public pages.

**Architecture:** Pages stay server components. Each effect is a small `"use client"` island that wraps existing markup or mounts a lazy R3F canvas. A thin `src/lib/motion/` layer provides gsap/ScrollTrigger setup, reduced-motion + device-tier detection, and an R3F `<Canvas>` wrapper with theme-driven shader uniforms.

**Tech Stack:** Next 15 (app router, React 19), three@0.169, @react-three/fiber@9, @react-three/drei@10, gsap@3.15 (+ ScrollTrigger), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-landing-motion-effects-design.md`

## Global Constraints

- Strict monochrome + faint platinum light touch only. Emerald (`--color-ok`) reserved for the status page only.
- Every effect honors `prefers-reduced-motion` (static frame / no transition), is theme-aware (reads `--color-*` at runtime), and RTL-aware (directional motion mirrors under `dir="rtl"`).
- Decorative layers are `aria-hidden` + `pointer-events-none`; content readable without JS; no CLS.
- WebGL canvases lazy, `ssr:false`, pause offscreen/hidden-tab, dispose on unmount, fall back on `lite` tier or WebGL failure.
- Verification: `npm run typecheck` and `npm run build` must pass. Pure helpers get a tsx unit script.

---

## Task 1: Add dependencies

**Files:** Modify `apps/panel/package.json`.

- [ ] Install `@react-three/fiber@^9` and `@react-three/drei@^10` in the panel workspace.
- [ ] Verify `npm run typecheck` still passes.

## Task 2: Motion primitives (`src/lib/motion/`)

**Files:** Create `use-reduced-motion.ts`, `use-device-tier.ts`, `gsap.ts`, `css-color.ts`, `count.ts`.

- [ ] `css-color.ts`: `cssVarToRgb(name, el?) → [r,g,b] in 0..1`. Parses hex/rgb from computed styles. Pure.
- [ ] `count.ts`: `easeOutCubic(t)` + `countValue(from,to,progress)`. Pure.
- [ ] `use-reduced-motion.ts`: reactive `useReducedMotion(): boolean`.
- [ ] `use-device-tier.ts`: `useDeviceTier(): "full" | "lite"` from pointer/cores/dpr/width + WebGL probe; SSR-safe (`lite` until mounted).
- [ ] `gsap.ts`: registers ScrollTrigger once; `useGsap(setup, deps)` runs inside `gsap.context()` scoped to a ref, reverts on unmount, no-ops under reduced motion; returns the ref.
- [ ] Unit script `scripts/motion-test.ts` covering `css-color` + `count`; run with tsx.

## Task 3: R3F stage wrapper (`src/lib/motion/stage-canvas.tsx`)

**Files:** Create `stage-canvas.tsx`, `theme-uniforms.tsx`.

- [ ] `StageCanvas`: `dynamic(ssr:false)` R3F `<Canvas>`, `frameloop="demand"`, `dpr={[1,2]}`, alpha, high-performance; IntersectionObserver invalidate while visible; pause on hidden tab; renders `fallback` when tier is `lite`.
- [ ] `ThemeUniforms` context: reads `--color-ink`/`--color-canvas` via `cssVarToRgb`, re-reads on `data-theme` mutation (MutationObserver on `<html>`).

## Task 4: Hero field (`(public)/hero-field.tsx`)

- [ ] R3F instanced point/line network of nodes; GLSL vertex drift + fragment glow; platinum packets travel edges; pointer parallax + radius brighten. Lite fallback: CSS gradient.
- [ ] Replace `<HeroCanvas/>` usage in `page.tsx` with `<HeroField/>`; delete `hero-canvas.tsx`.

## Task 5: Reveal upgrade (`src/components/ui/reveal.tsx`)

- [ ] Add `direction?: "up"|"left"|"right"|"scale"` and `stagger?` while keeping current API/defaults. CSS additions in `globals.css`.

## Task 6: Steps flow (`(public)/steps-flow.tsx`)

- [ ] Client wrapper around the 3 step cards: SVG beam drawn via scrubbed `strokeDashoffset`, packet dot rides it, cards activate 1→2→3. RTL mirrored.

## Task 7: Tilt cards — game features (`(public)/tilt-card.tsx`)

- [ ] Pointer perspective tilt + platinum specular sheen; disabled on coarse pointer / reduced motion. Applied to game-features grid.

## Task 8: Wipe cards + count-up — web hosting (`(public)/wipe-card.tsx`, `count-up.tsx`)

- [ ] `clip-path` staggered wipe-in on scroll; `count-up.tsx` animates numerics into view using `count.ts`.

## Task 9: Spotlight cards — pricing (`(public)/spotlight-card.tsx`)

- [ ] Cursor-follow radial highlight; applied to home pricing teaser + `pricing/page.tsx` plan cards; prices count up.

## Task 10: Magnetic CTA (`src/components/ui/magnetic.tsx`)

- [ ] Wraps a child; gentle pull toward pointer within radius; disabled coarse/reduced. Applied to CTA + hero primary buttons.

## Task 11: Status page motion (`status/uptime-bars.tsx`, `status-banner.tsx`)

- [ ] Uptime bars draw in staggered on scroll; operational banner "breathing" pulse (emerald allowed here).

## Task 12: Docs progress (`docs/docs-progress.tsx`)

- [ ] Reading-progress bar bound to scroll + scroll-spy active anchor highlight; smooth anchor scroll.

## Task 13: Verify

- [ ] `npm run typecheck`, `npm run build`, run `scripts/motion-test.ts`. Fix all errors.
