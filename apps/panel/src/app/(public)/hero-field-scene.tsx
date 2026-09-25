"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { StageCanvas } from "@/lib/motion/stage-canvas";
import { useThemeColors } from "@/lib/motion/theme-uniforms";

/**
 * Hero signature — "living infrastructure": a drifting network of server nodes
 * wired by faint links, with bright packets travelling the wires and nodes that
 * brighten as the pointer passes. Communicates a distributed, live platform.
 *
 * Monochrome (platinum on obsidian / ink on light — theme-driven). WebGL only on
 * capable devices; everything else gets the CSS gradient fallback below.
 */

const NODE_COUNT = 260;
const PACKET_COUNT = 44;
const SPREAD_X = 6.4;
const SPREAD_Y = 3.6;
const SPREAD_Z = 1.6;
const LINK_DIST = 1.35;
const MAX_LINKS_PER_NODE = 3;

type Graph = {
  positions: Float32Array;
  seeds: Float32Array;
  linePositions: Float32Array;
  edges: [number, number][];
};

function buildGraph(): Graph {
  const positions = new Float32Array(NODE_COUNT * 3);
  const seeds = new Float32Array(NODE_COUNT);
  for (let i = 0; i < NODE_COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * SPREAD_X;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * SPREAD_Y;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD_Z;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  // Link each node to its nearest few neighbours within a threshold.
  const edges: [number, number][] = [];
  const degree = new Int32Array(NODE_COUNT);
  for (let i = 0; i < NODE_COUNT; i++) {
    const candidates: { j: number; d: number }[] = [];
    for (let j = i + 1; j < NODE_COUNT; j++) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < LINK_DIST) candidates.push({ j, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates) {
      if (degree[i] >= MAX_LINKS_PER_NODE) break;
      if (degree[c.j] >= MAX_LINKS_PER_NODE) continue;
      edges.push([i, c.j]);
      degree[i]++;
      degree[c.j]++;
    }
  }

  const linePositions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => {
    linePositions[k * 6] = positions[a * 3];
    linePositions[k * 6 + 1] = positions[a * 3 + 1];
    linePositions[k * 6 + 2] = positions[a * 3 + 2];
    linePositions[k * 6 + 3] = positions[b * 3];
    linePositions[k * 6 + 4] = positions[b * 3 + 1];
    linePositions[k * 6 + 5] = positions[b * 3 + 2];
  });

  return { positions, seeds, linePositions, edges };
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uRepel;      // 1 = nodes scatter from the pointer, 0 = packets ignore it
  attribute float aSeed;
  varying float vBright;

  void main() {
    vec3 p = position;
    // Gentle organic drift so the network feels alive.
    p.x += sin(uTime * 0.35 + aSeed) * 0.12;
    p.y += cos(uTime * 0.30 + aSeed * 1.3) * 0.12;

    // Pointer repulsion — nodes scatter away as the cursor nears them, then
    // settle back once it leaves. Eased (force²) so the dispersal is soft at
    // the edge of the field and strong right under the cursor.
    vec2 away = p.xy - uPointer;
    float pd = length(away);
    float force = smoothstep(1.7, 0.0, pd);
    vec2 dir = pd > 1e-4 ? away / pd : vec2(0.0);
    p.xy += dir * force * force * 1.15 * uRepel;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    float twinkle = 0.55 + 0.4 * sin(uTime * 1.4 + aSeed * 3.0);
    // Scattered nodes flare a touch brighter so the dispersal reads clearly.
    vBright = clamp(twinkle + force * 0.5 * uRepel, 0.0, 1.0);

    gl_PointSize = uSize * uPixelRatio * (1.0 + force * 0.8 * uRepel) * (12.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vBright;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vBright);
  }
`;

function Network() {
  const colors = useThemeColors();
  const graph = useMemo(buildGraph, []);
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const lineMatRef = useRef<THREE.LineBasicMaterial>(null);
  const packetRef = useRef<THREE.Points>(null);

  const pointer = useRef(new THREE.Vector2(0, 0));
  const target = useRef(new THREE.Vector2(0, 0));

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uSize: { value: 5.2 },
      uRepel: { value: 1 },
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
    }),
    [],
  );

  // Packet buffer + per-packet edge assignment and phase.
  const packet = useMemo(() => {
    const positions = new Float32Array(PACKET_COUNT * 3);
    const edgeIdx = new Int32Array(PACKET_COUNT);
    const phase = new Float32Array(PACKET_COUNT);
    const speed = new Float32Array(PACKET_COUNT);
    for (let i = 0; i < PACKET_COUNT; i++) {
      edgeIdx[i] = Math.floor(Math.random() * Math.max(1, graph.edges.length));
      phase[i] = Math.random();
      speed[i] = 0.15 + Math.random() * 0.25;
    }
    return { positions, edgeIdx, phase, speed };
  }, [graph]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Unproject the NDC pointer onto the z=0 plane for local-space distance.
    const ndc = new THREE.Vector3(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
    const dir = ndc.sub(state.camera.position).normalize();
    const dist = -state.camera.position.z / dir.z;
    const world = state.camera.position.clone().add(dir.multiplyScalar(dist));
    target.current.set(world.x, world.y);
    pointer.current.lerp(target.current, 0.08);

    if (matRef.current) {
      uniforms.uTime.value = t;
      uniforms.uPointer.value.copy(pointer.current);
      uniforms.uColor.value.copy(colors.ink);
    }
    if (lineMatRef.current) {
      lineMatRef.current.color.copy(colors.ink);
    }

    // No parallax rotation: the field holds a fixed orientation behind the
    // whole site and reacts to the pointer only by scattering its nodes.

    // Advance packets along their edges.
    if (packetRef.current && graph.edges.length > 0) {
      const arr = packet.positions;
      for (let i = 0; i < PACKET_COUNT; i++) {
        packet.phase[i] += delta * packet.speed[i];
        if (packet.phase[i] > 1) {
          packet.phase[i] -= 1;
          packet.edgeIdx[i] = Math.floor(Math.random() * graph.edges.length);
        }
        const [a, b] = graph.edges[packet.edgeIdx[i]];
        const f = packet.phase[i];
        arr[i * 3] = graph.positions[a * 3] + (graph.positions[b * 3] - graph.positions[a * 3]) * f;
        arr[i * 3 + 1] = graph.positions[a * 3 + 1] + (graph.positions[b * 3 + 1] - graph.positions[a * 3 + 1]) * f;
        arr[i * 3 + 2] = graph.positions[a * 3 + 2] + (graph.positions[b * 3 + 2] - graph.positions[a * 3 + 2]) * f;
      }
      const attr = packetRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
      const pm = packetRef.current.material as THREE.ShaderMaterial;
      pm.uniforms.uColor.value.copy(colors.ink);
      pm.uniforms.uTime.value = t;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Links */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[graph.linePositions, 3]}
            count={graph.linePositions.length / 3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMatRef}
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {/* Nodes */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[graph.positions, 3]} count={NODE_COUNT} />
          <bufferAttribute attach="attributes-aSeed" args={[graph.seeds, 1]} count={NODE_COUNT} />
        </bufferGeometry>
        <shaderMaterial
          ref={matRef}
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Packets — brighter, larger points riding the wires */}
      <points ref={packetRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[packet.positions, 3]} count={PACKET_COUNT} />
          <bufferAttribute attach="attributes-aSeed" args={[new Float32Array(PACKET_COUNT), 1]} count={PACKET_COUNT} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={{
            uTime: { value: 0 },
            uPointer: { value: new THREE.Vector2(999, 999) },
            uColor: { value: new THREE.Color(1, 1, 1) },
            uSize: { value: 10.0 },
            uRepel: { value: 0 },
            uPixelRatio: uniforms.uPixelRatio,
          }}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

/** CSS fallback for lite devices / SSR — a still platinum haze, no WebGL. */
function Fallback() {
  return (
    <div
      className="h-full w-full"
      style={{
        background:
          "radial-gradient(38rem 22rem at 72% 20%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 62%)",
      }}
    />
  );
}

/** Heavy WebGL scene — loaded only on full-tier devices via the gate below. */
export function HeroFieldScene() {
  return (
    <StageCanvas className="pointer-events-none absolute inset-0 z-0 h-full w-full" fallback={<Fallback />}>
      <Network />
    </StageCanvas>
  );
}

/**
 * Site-wide variant of the same scene — a fixed, full-viewport layer that sits
 * behind every section (negative z within the isolated app-shell) so the
 * network persists as you scroll the whole site, not just the hero. Same
 * design; the only behavioural difference lives in Network (no parallax
 * rotation, pointer scatter) and is shared by both mounts.
 */
export function SiteFieldScene() {
  return (
    <StageCanvas className="pointer-events-none fixed inset-0 -z-10 h-full w-full" fallback={<Fallback />}>
      <Network />
    </StageCanvas>
  );
}
