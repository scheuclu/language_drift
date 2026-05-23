"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SpaceData } from "@/lib/space";

type Props = {
  data: SpaceData;
  driftByWord: Map<string, number>;
  yearIndex: number;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
};

// Three-stop gradient: low drift (blue) → mid (yellow) → high (magenta).
function driftColor(d: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, d / 8));
  if (t < 0.5) {
    // blue → yellow
    const u = t * 2;
    return [0.2 + u * 0.75, 0.5 + u * 0.5, 1 - u * 0.8];
  }
  const u = (t - 0.5) * 2;
  // yellow → magenta
  return [0.95 + u * 0.05, 1 - u * 0.65, 0.2 + u * 0.6];
}

function PointCloud({
  data,
  driftByWord,
  yearIndex,
  hoveredIdx,
  onHover,
}: Props) {
  const meshRef = useRef<THREE.Points>(null);
  const positionAttr = useRef<THREE.BufferAttribute | null>(null);
  const fromCoords = useRef<Float32Array | null>(null);
  const toCoords = useRef<Float32Array | null>(null);
  const tween = useRef(1); // 0 = from, 1 = to
  const prevYi = useRef(yearIndex);
  const { raycaster } = useThree();

  // Tweak raycaster threshold so Points hover works.
  useEffect(() => {
    if (raycaster.params.Points) raycaster.params.Points.threshold = 0.02;
  }, [raycaster]);

  const n = data.index.n_words;

  // Initial positions + colors (set once).
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(n * 3);
    positions.set(data.coords[yearIndex]);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const w = data.index.words[i];
      const d = driftByWord.get(w) ?? 0;
      const [r, g, b] = driftColor(d);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    return { positions, colors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, driftByWord, n]);

  // When yearIndex changes, set up a tween from current → new year's coords.
  useEffect(() => {
    if (prevYi.current === yearIndex) return;
    fromCoords.current = positionAttr.current
      ? new Float32Array(positionAttr.current.array as Float32Array)
      : new Float32Array(data.coords[prevYi.current]);
    toCoords.current = new Float32Array(data.coords[yearIndex]);
    tween.current = 0;
    prevYi.current = yearIndex;
  }, [yearIndex, data]);

  useFrame((_, delta) => {
    const attr = positionAttr.current;
    if (!attr) return;
    if (tween.current < 1 && fromCoords.current && toCoords.current) {
      tween.current = Math.min(1, tween.current + delta / 0.7); // 0.7s transition
      const t = 1 - Math.pow(1 - tween.current, 3); // ease-out cubic
      const arr = attr.array as Float32Array;
      const f = fromCoords.current;
      const to = toCoords.current;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = f[i] + (to[i] - f[i]) * t;
      }
      attr.needsUpdate = true;
    }
  });

  function pickIndex(e: ThreeEvent<PointerEvent>): number | null {
    // r3f populates e.index on Points intersections.
    return typeof e.index === "number" ? e.index : null;
  }

  return (
    <points
      ref={meshRef}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(pickIndex(e));
      }}
      onPointerOut={() => onHover(null)}
    >
      <bufferGeometry>
        <bufferAttribute
          ref={(r) => {
            positionAttr.current = r;
          }}
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.92}
        depthWrite={false}
      />
      {hoveredIdx !== null && (
        <Highlight
          coords={data.coords[yearIndex]}
          idx={hoveredIdx}
          tweenedFrom={fromCoords.current}
          tween={tween.current}
        />
      )}
    </points>
  );
}

function Highlight({
  coords,
  idx,
  tweenedFrom,
  tween,
}: {
  coords: Float32Array;
  idx: number;
  tweenedFrom: Float32Array | null;
  tween: number;
}) {
  // Use current tweened position so the highlight tracks the animated point.
  const x = coords[idx * 3];
  const y = coords[idx * 3 + 1];
  const z = coords[idx * 3 + 2];
  void tweenedFrom;
  void tween;
  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[0.018, 16, 16]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
    </mesh>
  );
}

export function Space3D(props: Props) {
  return (
    <Canvas
      camera={{ position: [1.8, 1.2, 1.8], fov: 50 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <PointCloud {...props} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={0.3}
        maxDistance={6}
      />
      <fog attach="fog" args={["#0a0a0a", 3, 7]} />
    </Canvas>
  );
}
