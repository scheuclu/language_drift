"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SpaceData } from "@/lib/space";

export type RGB = [number, number, number];

type Props = {
  data: SpaceData;
  yearIndex: number;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  markedIndices: number[];
  markedColors: RGB[];
  highlightedMarkedIdx: number | null; // index into markedIndices
  onToggleMark: (idx: number) => void;
};

function makeDiscTexture(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.78, "rgba(255,255,255,1)");
  grad.addColorStop(0.92, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMarkedDiscTexture(): THREE.Texture {
  const size = 96;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function PointCloud({
  data,
  yearIndex,
  hoveredIdx,
  onHover,
  markedIndices,
  markedColors,
  highlightedMarkedIdx,
  onToggleMark,
}: Props) {
  const meshRef = useRef<THREE.Points>(null);
  const positionAttr = useRef<THREE.BufferAttribute | null>(null);
  const fromCoords = useRef<Float32Array | null>(null);
  const toCoords = useRef<Float32Array | null>(null);
  const tween = useRef(1);
  const prevYi = useRef(yearIndex);
  const { raycaster } = useThree();

  useEffect(() => {
    if (raycaster.params.Points) raycaster.params.Points.threshold = 0.02;
  }, [raycaster]);

  const n = data.index.n_words;
  const discTex = useMemo(() => makeDiscTexture(), []);

  const positions = useMemo(() => {
    const arr = new Float32Array(n * 3);
    arr.set(data.coords[yearIndex]);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n]);

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
      tween.current = Math.min(1, tween.current + delta / 0.7);
      const t = 1 - Math.pow(1 - tween.current, 3);
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
    return typeof e.index === "number" ? e.index : null;
  }

  return (
    <>
      <points
        ref={meshRef}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(pickIndex(e));
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          const idx = pickIndex(e);
          if (idx !== null) {
            e.stopPropagation();
            onToggleMark(idx);
          }
        }}
      >
        <bufferGeometry>
          <bufferAttribute
            ref={(r) => {
              positionAttr.current = r;
            }}
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.009}
          sizeAttenuation
          color="#8088a0"
          map={discTex}
          alphaMap={discTex}
          transparent
          alphaTest={0.04}
          opacity={0.16}
          depthWrite={false}
        />
      </points>

      {hoveredIdx !== null && (
        <TrackedSphere
          idx={hoveredIdx}
          positionAttr={positionAttr}
          radius={0.014}
          color="#ffffff"
          opacity={0.35}
        />
      )}

      {markedIndices.length > 0 && (
        <MarkedCloud
          indices={markedIndices}
          colors={markedColors}
          positionAttr={positionAttr}
          highlightedMarkedIdx={highlightedMarkedIdx}
        />
      )}
    </>
  );
}

function MarkedCloud({
  indices,
  colors,
  positionAttr,
  highlightedMarkedIdx,
}: {
  indices: number[];
  colors: RGB[];
  positionAttr: React.RefObject<THREE.BufferAttribute | null>;
  highlightedMarkedIdx: number | null;
}) {
  const markedTex = useMemo(() => makeMarkedDiscTexture(), []);
  const positions = useMemo(
    () => new Float32Array(indices.length * 3),
    [indices.length],
  );
  const colorBuf = useMemo(() => {
    const arr = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const c = colors[i] ?? [1, 1, 1];
      arr[i * 3] = c[0];
      arr[i * 3 + 1] = c[1];
      arr[i * 3 + 2] = c[2];
    }
    return arr;
  }, [indices, colors]);
  const attrRef = useRef<THREE.BufferAttribute | null>(null);

  useFrame(() => {
    const src = positionAttr.current;
    const dst = attrRef.current;
    if (!src || !dst) return;
    const s = src.array as Float32Array;
    const d = dst.array as Float32Array;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      d[i * 3] = s[idx * 3];
      d[i * 3 + 1] = s[idx * 3 + 1];
      d[i * 3 + 2] = s[idx * 3 + 2];
    }
    dst.needsUpdate = true;
  });

  // Overlay: render the hovered chip's point larger, with its own color.
  const hoverInfo =
    highlightedMarkedIdx !== null && highlightedMarkedIdx < indices.length
      ? {
          cloudIdx: indices[highlightedMarkedIdx],
          color: colors[highlightedMarkedIdx] ?? [1, 1, 1],
        }
      : null;

  return (
    <>
      {/* Soft additive halo behind each marked point — makes them glow. */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[colorBuf, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.07}
          sizeAttenuation
          vertexColors
          map={markedTex}
          alphaMap={markedTex}
          transparent
          alphaTest={0.01}
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthTest={false}
          depthWrite={false}
        />
      </points>
      {/* Crisp core. */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            ref={(r) => {
              attrRef.current = r;
            }}
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute attach="attributes-color" args={[colorBuf, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.020}
          sizeAttenuation
          vertexColors
          map={markedTex}
          alphaMap={markedTex}
          transparent
          alphaTest={0.05}
          opacity={1}
          depthTest={false}
          depthWrite={false}
        />
      </points>

      {hoverInfo && (
        <HoverEnlarged
          cloudIdx={hoverInfo.cloudIdx}
          color={hoverInfo.color}
          positionAttr={positionAttr}
          texture={markedTex}
        />
      )}
    </>
  );
}

function HoverEnlarged({
  cloudIdx,
  color,
  positionAttr,
  texture,
}: {
  cloudIdx: number;
  color: RGB;
  positionAttr: React.RefObject<THREE.BufferAttribute | null>;
  texture: THREE.Texture;
}) {
  const positions = useMemo(() => new Float32Array(3), []);
  const attrRef = useRef<THREE.BufferAttribute | null>(null);
  useFrame(() => {
    const src = positionAttr.current;
    const dst = attrRef.current;
    if (!src || !dst) return;
    const s = src.array as Float32Array;
    const d = dst.array as Float32Array;
    d[0] = s[cloudIdx * 3];
    d[1] = s[cloudIdx * 3 + 1];
    d[2] = s[cloudIdx * 3 + 2];
    dst.needsUpdate = true;
  });
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          ref={(r) => {
            attrRef.current = r;
          }}
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        color={new THREE.Color(color[0], color[1], color[2])}
        map={texture}
        alphaMap={texture}
        transparent
        alphaTest={0.05}
        opacity={1}
        depthTest={false}
        depthWrite={false}
      />
    </points>
  );
}

function TrackedSphere({
  idx,
  positionAttr,
  radius,
  color,
  opacity,
}: {
  idx: number;
  positionAttr: React.RefObject<THREE.BufferAttribute | null>;
  radius: number;
  color: string;
  opacity: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const attr = positionAttr.current;
    if (!attr || !ref.current) return;
    const arr = attr.array as Float32Array;
    ref.current.position.set(arr[idx * 3], arr[idx * 3 + 1], arr[idx * 3 + 2]);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
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
