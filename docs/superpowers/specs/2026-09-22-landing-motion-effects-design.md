# Landing Motion & Effects — Design

Date: 2026-09-22
Status: Approved (design), pending implementation plan
Scope: All public pages (`src/app/(public)/**`) — home, pricing, docs, status

## Goal

Replace the current shallow landing effects (a single three.js constellation,
generic `Reveal` fades, CSS `.lift`) with a system of **purposeful** motion
where every effect communicates something about the product, and every section
feels distinct. Professional, restrained, worthy of the product's value.

## Confirmed decisions

1. **3D stack:** React Three Fiber + `@react-three/drei` (added deps; R3F v9 for
   React 19). `three@0.169` already installed.
2. **Visual tone:** Strict monochrome + a *faint light touch only*
   (subtle platinum bloom / specular sheen / depth), no chromatic accent in
   the hero or any home section. The existing semantic `--color-ok` (emerald)
   is reserved for the **status page only**, where it already carries a
   functional health meaning (it is not introduced anywhere new). No blue.
   Everything else stays platinum/obsidian in both themes.
3. **Performance:** Smart mobile/low-power degradation — full WebGL/GLSL on
   capable desktops, lightweight CSS/2D-canvas fallbacks otherwise.

## Non-negotiable constraints (apply to every effect)

- **Reduced motion:** `prefers-reduced-motion: reduce` → render a single static
  frame / skip transitions. Never animate through it.
- **Theme-aware:** read CSS custom properties (`--color-*`) at runtime so light
  and dark both work; re-read on theme change.
- **RTL-aware:** directional motion (path draw, wipes, magnetic pull) mirrors
  under `dir="rtl"`.
- **Lifecycle:** pause on `visibilitychange` (hidden tab) and when offscreen;
  dispose all GPU resources on unmount (matches current `hero-canvas.tsx`).
- **Accessibility:** all decorative layers `aria-hidden`, `pointer-events-none`
  where appropriate; content remains readable without JS.
- **No CLS / no blocking:** WebGL canvases are lazy and never shift layout;
  effects layer on top of already-correct static markup.

## Shared infrastructure — `src/lib/motion/`

Small, isolated, independently testable units.

### `gsap.ts`
Registers `gsap` + `ScrollTrigger` exactly once (client-only). Exports a
`useGsap(callback, deps)` hook that runs the callback inside a `gsap.context()`
scoped to a ref, auto-reverts on unmount, and no-ops under reduced motion.
Configures `ScrollTrigger` for RTL where needed.

- Input: a setup callback receiving the scoped root element.
- Output: a ref to attach to the container.
- Depends on: `gsap`, `useReducedMotion`.

### `use-reduced-motion.ts`
Reactive hook wrapping the media query (updates if the user changes the OS
setting mid-session). Single source of truth used by every effect.

### `use-device-tier.ts`
Returns `"full" | "lite"` from: coarse pointer, `navigator.hardwareConcurrency`,
`devicePixelRatio`, viewport width, and a WebGL-availability probe. Effects pick
their variant from this. SSR-safe (defaults to `"lite"` until mounted, so the
server render is the cheap one).

### `stage-canvas.tsx`
R3F `<Canvas>` wrapper, `dynamic(() => ..., { ssr: false })` and lazy. Provides:
- `frameloop="demand"` + an IntersectionObserver that only invalidates while
  visible; pauses on hidden tab.
- `dpr={[1, 2]}` clamp, `gl={{ antialias, alpha: true, powerPreference: "high-performance" }}`.
- A `<ThemeUniforms>` context that feeds current `--color-*` values (parsed to
  vec3) to shaders and updates on theme change.
- Renders a provided fallback (static image/CSS) when tier is `"lite"` or WebGL
  is unavailable.

### `reveal.tsx` (upgrade in place)
Extend the existing component (keep its IntersectionObserver + reduced-motion
fallback API so current callers don't break) with:
- `direction?: "up" | "left" | "right" | "scale"` and `stagger?: number` for
  children.
- Optional ScrollTrigger-backed scrub for elements that should track scroll
  progress rather than fire once.
Existing usages (`page.tsx`, etc.) keep working with defaults unchanged.

## Per-section effects

### Home (`(public)/page.tsx`)

**1. Hero — "living infrastructure" field (R3F + GLSL).**
Replaces `hero-canvas.tsx`. A GPU point/line network of abstract server nodes;
bright platinum data packets travel along links (monochrome, no chromatic
accent); nodes brighten within a radius of the pointer (parallax retained).
Communicates: distributed, live hosting.
- Full: instanced points + custom GLSL (vertex displacement for drift, fragment
  glow). Lite: existing-style 2D canvas constellation or a static gradient.
- Component: `hero-field.tsx` (client). Old `hero-canvas.tsx` removed.

**2. How it works — connected path draw (ScrollTrigger).**
An SVG beam links the three step cards; `strokeDashoffset` is scrubbed by scroll
so the line draws 1→2→3, a packet dot rides it, each card gets an `is-active`
class in sequence. Communicates: the ordered flow of getting started. RTL:
path mirrored, packet travels right→left.
- Component: `steps-flow.tsx` wrapping the existing steps markup.

**3. Game servers — magnetic 3D-tilt cards + GLSL/CSS sheen.**
Cards apply perspective tilt toward the pointer; a specular platinum sheen
sweeps on hover; icon micro-animation. Pure CSS transforms + a lightweight
pointer handler (no WebGL needed here — keeps it cheap and distinct).
- Component: `tilt-card.tsx`, used by the game-features grid.

**4. Web hosting — clip-path wipe reveal + count-up.**
Distinct rhythm from §3: cards wipe in via `clip-path` on scroll (staggered),
any numeric spec counts up. GSAP timeline via `useGsap`.
- Component: `wipe-card.tsx` + `count-up.tsx`.

**5. Pricing teaser (home) + Pricing page cards.**
Cursor-follow spotlight (radial highlight tracking pointer over each card) +
prices count up when scrolled into view + subtle animated gradient mesh behind
the teaser. Communicates: value, "computed live".
- Components: `spotlight-card.tsx`, reuse `count-up.tsx`. Applied on both
  `(public)/page.tsx` teaser and `(public)/pricing/page.tsx` plan cards.

**6. CTA — magnetic button + ambient glow.**
Primary CTA gently pulls toward the pointer within a small radius; soft radial
glow behind it. Communicates: affordance at the decision point.
- Component: `magnetic.tsx` (wraps a child, disabled on coarse pointers).

### Status (`(public)/status/**`)
- Uptime bars draw in staggered on scroll (`uptime-bars.tsx`), overall banner
  gets a slow "breathing" pulse when operational. Communicates: live
  monitoring. Emerald accent is meaningful here (health).

### Docs (`(public)/docs/page.tsx`)
- Top reading-progress bar bound to scroll; scroll-spy highlights the active
  anchor in the side nav; smooth anchor scrolling. Navigational utility.
- Component: `docs-progress.tsx` (client island layered over existing SSR markup).

## Architecture / data flow

- Pages stay **server components**; each effect is a small `"use client"`
  island that either wraps existing markup (`Reveal`-style) or mounts a canvas.
  No page turns fully client.
- Effects never own content — markup/i18n/data stay in the server components;
  islands add behavior only. Removing an island degrades gracefully to static.
- Theme values flow one way: CSS vars → `ThemeUniforms`/JS readers → effects.

## Error handling / degradation

- WebGL context creation failure or `tier === "lite"` → fallback render, no
  throw.
- `ScrollTrigger`/GSAP guarded so SSR never touches `window`.
- IntersectionObserver / matchMedia absent → reveal immediately, static frame.
- Context-loss (`webglcontextlost`) handled by disposing and showing fallback.

## Testing

- Unit (existing integration test runner): `use-device-tier` classification,
  CSS-var → vec3 parser, count-up math, reduced-motion gating returns static.
- Manual/verification matrix: desktop dark, desktop light, mobile (lite path),
  RTL (Arabic) direction mirroring, `prefers-reduced-motion`, hidden-tab pause,
  and a Prisma-empty pricing/status page (no crash).
- `npm run typecheck` + `npm run build` must pass.

## Dependencies to add

- `@react-three/fiber@^9` (React 19 support), `@react-three/drei@^10`.
- GSAP is already installed (`gsap@^3.15`); `ScrollTrigger` ships with it.

## Out of scope

- Auth pages, dashboard, and any non-public route.
- Copy/i18n changes, palette redesign beyond the single emerald accent usage.
- New illustrations/3D asset pipelines (all effects are procedural).
