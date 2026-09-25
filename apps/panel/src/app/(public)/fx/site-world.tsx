"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Cloud, Clouds, Float, Sparkles, useTexture } from "@react-three/drei";
import { ScrollTrigger, ensureGsap, isRtl } from "@/lib/motion/gsap";
import { useThemeColors } from "@/lib/motion/theme-uniforms";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";
import { StageCanvas } from "@/lib/motion/stage-canvas";

/**
 * Site-wide immersive 3D world — a fixed, full-viewport WebGL scene behind every
 * public section. The camera descends as you scroll (GSAP ScrollTrigger over the
 * whole page) through a moonlit night: drifting real clouds, realistic textured
 * moons (NASA-derived surface map), a field of twinkling stars and depth fog.
 * Genuine perspective, parallax and light — not element animation.
 *
 * Performance: shared geometry, instanced clouds, one shared moon texture, pauses
 * off-screen / hidden tab, only renders on full-tier devices (SiteField gate).
 * Theme-aware via useThemeColors. RTL-aware (moons + clouds mirror).
 *
 * Assets (self-hosted in /public/textures — no runtime CDN dependency):
 *  - moon.jpg   Solar System Scope lunar albedo, CC BY 4.0 (NASA imagery).
 *  - cloud.png  pmndrs drei cloud sprite.
 */

const STAR_COUNT = 700;
const STAR_RADIUS = 7;
/** World Y for each section level the camera descends to. */
const SECTION_Y = [0, -10, -20, -30, -40, -50, -60];

/* ------------------------- Stars (GLSL points) ------------------------- */

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aTint;
  varying float vTwinkle;
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.15 + aSeed * 3.0) * 0.5;
    p.y += cos(uTime * 0.12 + aSeed * 2.0) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // Slow, per-star twinkle that never fully extinguishes — real stars don't blink off.
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 0.25) + aSeed * 7.0);
    vTint = aTint;
    // Only the largest stars earn a diffraction spike.
    vBright = smoothstep(1.6, 3.2, aSize);
    gl_PointSize = aSize * uPixelRatio * (8.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vTwinkle;
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    // Tight bright core + soft halo = a believable point of light.
    float core = pow(smoothstep(0.5, 0.0, d), 2.4);
    float halo = smoothstep(0.5, 0.0, d) * 0.3;
    // Faint 4-point diffraction cross, brightest stars only.
    float sx = max(0.0, 1.0 - abs(uv.x) * 14.0) * smoothstep(0.5, 0.0, abs(uv.y));
    float sy = max(0.0, 1.0 - abs(uv.y) * 14.0) * smoothstep(0.5, 0.0, abs(uv.x));
    float spike = (sx + sy) * vBright * 0.5;
    float a = clamp(core + halo + spike, 0.0, 1.0) * vTwinkle;
    gl_FragColor = vec4(uColor * vTint, a);
  }
`;

function Stars() {
  const colors = useThemeColors();
  const { positions, seeds, sizes, tints } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const seeds = new Float32Array(STAR_COUNT);
    const sizes = new Float32Array(STAR_COUNT);
    const tints = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * STAR_RADIUS;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 35 - 30;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * 4 - 2;
      seeds[i] = Math.random() * Math.PI * 2;
      // Power-law sizes: most stars are faint pinpricks, a rare few blaze.
      sizes[i] = 0.35 + Math.pow(Math.random(), 3) * 3;
      // Subtle stellar colour: mostly white, a sprinkle of cool blue and warm amber.
      const r = Math.random();
      if (r < 0.15) {
        tints[i * 3] = 0.75;
        tints[i * 3 + 1] = 0.83;
        tints[i * 3 + 2] = 1;
      } else if (r < 0.28) {
        tints[i * 3] = 1;
        tints[i * 3 + 1] = 0.88;
        tints[i * 3 + 2] = 0.72;
      } else {
        const j = 0.94 + Math.random() * 0.06;
        tints[i * 3] = j;
        tints[i * 3 + 1] = j;
        tints[i * 3 + 2] = j;
      }
    }
    return { positions, seeds, sizes, tints };
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
    }),
    [],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uColor.value.copy(colors.ink);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} count={STAR_COUNT} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} count={STAR_COUNT} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} count={STAR_COUNT} />
        <bufferAttribute attach="attributes-aTint" args={[tints, 3]} count={STAR_COUNT} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------- Moons (realistic textured spheres) ------------------------- */

const MOON_X = [3.4, -3.6, 3.8, -3.2, 3.5, -3.6, 0.5];
const MOON_SCALE = [1.1, 0.8, 1.4, 0.95, 1.0, 1.25, 1.7];
const MOON_SPIN = [0.05, -0.04, 0.03, -0.05, 0.04, -0.03, 0.02];

function Moon({
  map,
  position,
  scale,
  spin,
}: {
  map: THREE.Texture;
  position: readonly [number, number, number];
  scale: number;
  spin: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += spin * delta;
  });
  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.9} position={[...position]}>
      <mesh ref={ref} scale={scale} rotation={[0.2, 0, 0.08]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial map={map} bumpMap={map} bumpScale={2.4} roughness={0.95} metalness={0} />
      </mesh>
    </Float>
  );
}

function Moons() {
  const rtl = isRtl();
  const invalidate = useThree((s) => s.invalidate);
  const map = useTexture("/textures/moon.jpg");
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
  }, [map]);
  // Demand-frameloop (reduced motion) renders a single frame; force one more
  // once the texture is ready so that frame is never an untextured moon.
  useEffect(() => {
    invalidate();
  }, [map, invalidate]);
  const moons = useMemo(
    () =>
      SECTION_Y.map((y, i) => ({
        pos: [rtl ? -MOON_X[i] : MOON_X[i], y + 1.2, -1.8 - (i % 3) * 0.4] as const,
        scale: MOON_SCALE[i],
        spin: MOON_SPIN[i],
      })),
    [rtl],
  );
  return (
    <group>
      {moons.map((m, i) => (
        <Moon key={i} map={map} position={m.pos} scale={m.scale} spin={m.spin} />
      ))}
    </group>
  );
}

/* ------------------------- Clouds (drifting instanced volumes) ------------------------- */

const CLOUD_BANK = [
  { y: -2, x: -2.4, z: -7, seed: 11, seg: 40, vol: 8, op: 0.45, col: "#c4cde8", speed: 0.16 },
  { y: -13, x: 3.0, z: -5, seed: 22, seg: 38, vol: 7, op: 0.4, col: "#aeb8da", speed: 0.2 },
  { y: -24, x: -3.2, z: -8, seed: 33, seg: 42, vol: 9, op: 0.4, col: "#c8d1ec", speed: 0.14 },
  { y: -35, x: 2.4, z: -4, seed: 44, seg: 38, vol: 8, op: 0.42, col: "#b6c0e0", speed: 0.22 },
  { y: -46, x: -2.2, z: -7, seed: 55, seg: 44, vol: 10, op: 0.4, col: "#ced7f0", speed: 0.16 },
  { y: -58, x: 1.2, z: -5, seed: 66, seg: 46, vol: 11, op: 0.46, col: "#bcc6e6", speed: 0.18 },
];

function CloudField() {
  const rtl = isRtl();
  return (
    <Clouds material={THREE.MeshLambertMaterial} texture="/textures/cloud.png" limit={600} range={80}>
      {CLOUD_BANK.map((c, i) => (
        <Cloud
          key={i}
          seed={c.seed}
          segments={c.seg}
          bounds={[13, 2, 3]}
          volume={c.vol}
          smallestVolume={0.4}
          growth={5}
          speed={c.speed}
          opacity={c.op}
          fade={26}
          color={c.col}
          position={[rtl ? -c.x : c.x, c.y, c.z]}
        />
      ))}
    </Clouds>
  );
}

/* ------------------------- Dust ------------------------- */

function Dust() {
  return (
    <Sparkles
      count={200}
      speed={0.14}
      opacity={0.5}
      scale={[14, 70, 8]}
      position={[0, -30, 0]}
      size={1.5}
      color="#aab4c8"
    />
  );
}

/* ------------------------- Camera rig (scroll-driven) ------------------------- */

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);
  const invalidate = useThree((s) => s.invalidate);
  const reduced = useReducedMotion();
  const scrollProgress = useRef(0);
  const current = useRef(new THREE.Vector3(0, 0, 8));

  useEffect(() => {
    ensureGsap();
    // Reduced motion: no scroll-driven descent. Park at a representative
    // mid-descent vantage so the single static frame frames the scene, and
    // skip the ScrollTrigger (dead weight when the frameloop is on demand).
    if (reduced) {
      const midY = (SECTION_Y[0] + SECTION_Y[SECTION_Y.length - 1]) / 2;
      camera.position.set(0, midY, 7);
      camera.lookAt(0, midY - 1.2, 0);
      invalidate();
      const t = setTimeout(() => invalidate(), 120);
      return () => clearTimeout(t);
    }
    const st = ScrollTrigger.create({
      trigger: document.documentElement,
      start: 0,
      end: () => document.documentElement.scrollHeight - window.innerHeight,
      scrub: 0.7,
      onUpdate: (self) => {
        scrollProgress.current = self.progress;
      },
    });
    return () => st.kill();
  }, [reduced, camera, invalidate]);

  useFrame((_, delta) => {
    if (reduced) return;
    const p = scrollProgress.current;
    const targetY = THREE.MathUtils.lerp(SECTION_Y[0], SECTION_Y[SECTION_Y.length - 1], p);
    const targetX = Math.sin(p * Math.PI * 2) * 0.6 + pointer.x * 0.5;
    const targetZ = 8 - p * 1.2;

    current.current.x = THREE.MathUtils.damp(current.current.x, targetX, 3, delta);
    current.current.y = THREE.MathUtils.damp(current.current.y, targetY, 3, delta);
    current.current.z = THREE.MathUtils.damp(current.current.z, targetZ, 3, delta);

    camera.position.copy(current.current);
    camera.lookAt(pointer.x * 0.4, current.current.y - 1.2, 0);
  });

  return null;
}

/* ------------------------- Scene ------------------------- */

/**
 * Exponential depth fog. FogExp2 copies its color at construction, so reading
 * the theme token there would freeze the white placeholder — copy the live
 * (in-place mutated) canvas token into it every frame instead.
 */
function Fog() {
  const colors = useThemeColors();
  const ref = useRef<THREE.FogExp2>(null);
  useFrame(() => {
    if (ref.current) ref.current.color.copy(colors.canvas);
  });
  return <fogExp2 ref={ref} attach="fog" args={[colors.canvas, 0.05]} />;
}

export function SiteWorldScene() {
  return (
    <>
      <Fog />
      {/* Moonlight. Fixed neutral colors, NOT the ink token: ink is the dark
          foreground on the light theme and would unlight the whole scene. */}
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#cdd6f5", "#0a0e18", 0.5]} />
      <directionalLight position={[6, 5, 8]} intensity={1.5} color="#eef2ff" />
      <pointLight position={[-6, -20, 4]} intensity={0.5} color="#cfd6e6" />

      <Stars />
      <Dust />
      <Suspense fallback={null}>
        <Moons />
        <CloudField />
      </Suspense>
      <CameraRig />
    </>
  );
}

/* ------------------------- Public wrapper ------------------------- */

export function SiteWorld() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full">
      <StageCanvas className="h-full w-full" fallback={null}>
        <SiteWorldScene />
      </StageCanvas>
    </div>
  );
}
