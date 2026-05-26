"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { SpaceData } from "@/lib/space";

export type RGB = [number, number, number];

type Props = {
  data: SpaceData;
  yearIndex: number;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
  markedIndices: number[];
  markedColors: RGB[];
  highlightedMarkedIdx: number | null;
  onToggleMark: (idx: number) => void;
};

const TWEEN_MS = 700;
const HOVER_RADIUS_PX = 8;

function rgbCss([r, g, b]: RGB, a: number) {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

export function Space({
  data,
  yearIndex,
  hoveredIdx,
  onHover,
  markedIndices,
  markedColors,
  highlightedMarkedIdx,
  onToggleMark,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Current rendered coords (tween target). Length = n_words * 2.
  const currentCoords = useRef<Float32Array | null>(null);
  const tweenFrom = useRef<Float32Array | null>(null);
  const tweenTo = useRef<Float32Array | null>(null);
  const tweenStart = useRef<number>(0);
  const tweenActive = useRef<boolean>(false);
  const prevYi = useRef<number>(yearIndex);
  // d3-zoom transform.
  const transform = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  // Quadtree built from the current target year's coords.
  const tree = useRef<d3.Quadtree<number> | null>(null);
  const dpr = useRef<number>(1);
  const size = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  const n = data.index.n_words;

  // Initial / resize setup + d3-zoom binding.
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const resize = () => {
      const rect = overlay.getBoundingClientRect();
      dpr.current = window.devicePixelRatio || 1;
      size.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr.current;
      canvas.height = rect.height * dpr.current;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
    };
    resize();

    const sel = d3.select(overlay as Element);
    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.4, 40])
      .filter((event) => {
        // Allow wheel zoom + drag pan, but not on touch hold for now.
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => {
        transform.current = event.transform;
      });
    sel.call(zoom as never);
    sel.on("dblclick.zoom", null);

    const ro = new ResizeObserver(resize);
    ro.observe(overlay);

    return () => {
      sel.on(".zoom", null);
      ro.disconnect();
    };
  }, []);

  // When the year changes, kick off a tween.
  useEffect(() => {
    if (prevYi.current === yearIndex && currentCoords.current) return;
    const target = new Float32Array(data.coords[yearIndex]);
    if (!currentCoords.current) {
      // first paint
      currentCoords.current = target;
      tweenActive.current = false;
    } else {
      tweenFrom.current = new Float32Array(currentCoords.current);
      tweenTo.current = target;
      tweenStart.current = performance.now();
      tweenActive.current = true;
    }
    prevYi.current = yearIndex;
    // Rebuild quadtree on target positions so hover works mid-flight too
    // (close enough; the tween is short).
    const t = d3
      .quadtree<number>()
      .x((i) => target[i * 2])
      .y((i) => target[i * 2 + 1]);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) ids.push(i);
    t.addAll(ids);
    tree.current = t;
  }, [yearIndex, data, n]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const cur = currentCoords.current;
      if (!cur) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // Advance tween.
      if (tweenActive.current && tweenFrom.current && tweenTo.current) {
        const t = Math.min(1, (performance.now() - tweenStart.current) / TWEEN_MS);
        const e = 1 - Math.pow(1 - t, 3);
        const from = tweenFrom.current;
        const to = tweenTo.current;
        for (let i = 0; i < cur.length; i++) {
          cur[i] = from[i] + (to[i] - from[i]) * e;
        }
        if (t >= 1) tweenActive.current = false;
      }

      const { w, h } = size.current;
      const r = dpr.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#070707";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Map UMAP [-1, 1] into a centered square that fits the viewport
      // (preserve aspect; leave 4% padding so points near the bbox edge breathe).
      const pad = 0.96;
      const half = Math.min(w, h) * 0.5 * pad;
      const cx = w / 2;
      const cy = h / 2;
      const tr = transform.current;

      // Combined transform: (device px) = dpr * (screen px), then zoom transform,
      // then UMAP→screen map. We pre-multiply by dpr.
      ctx.setTransform(r, 0, 0, r, 0, 0);
      ctx.translate(tr.x, tr.y);
      ctx.scale(tr.k, tr.k);
      // Now in screen-px coords.

      // Background cloud — small soft discs at low alpha.
      const pointR = 0.9; // screen-px before zoom (zoom scales it)
      ctx.fillStyle = "rgba(128,136,160,0.35)";
      for (let i = 0; i < n; i++) {
        const x = cx + cur[i * 2] * half;
        const y = cy + cur[i * 2 + 1] * half;
        ctx.beginPath();
        ctx.arc(x, y, pointR / Math.max(0.8, tr.k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }

      // Marked: halo + crisp core.
      for (let i = 0; i < markedIndices.length; i++) {
        const idx = markedIndices[i];
        const col = markedColors[i] ?? [1, 1, 1];
        const x = cx + cur[idx * 2] * half;
        const y = cy + cur[idx * 2 + 1] * half;
        const isHi = highlightedMarkedIdx === i;
        const haloR = (isHi ? 18 : 12) / tr.k;
        const coreR = (isHi ? 5.5 : 3.5) / tr.k;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        grad.addColorStop(0, rgbCss(col, 0.85));
        grad.addColorStop(0.45, rgbCss(col, 0.25));
        grad.addColorStop(1, rgbCss(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgbCss(col, 1);
        ctx.beginPath();
        ctx.arc(x, y, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hovered.
      if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < n) {
        const x = cx + cur[hoveredIdx * 2] * half;
        const y = cy + cur[hoveredIdx * 2 + 1] * half;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5 / tr.k;
        ctx.beginPath();
        ctx.arc(x, y, 6 / tr.k, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hoveredIdx, markedIndices, markedColors, highlightedMarkedIdx, n]);

  // Hover + click handlers on overlay div.
  const screenToWorld = (sx: number, sy: number): [number, number] | null => {
    if (!size.current) return null;
    const { w, h } = size.current;
    const tr = transform.current;
    // Undo zoom transform, then undo UMAP→screen map.
    const ux = (sx - tr.x) / tr.k;
    const uy = (sy - tr.y) / tr.k;
    const pad = 0.96;
    const half = Math.min(w, h) * 0.5 * pad;
    return [(ux - w / 2) / half, (uy - h / 2) / half];
  };

  const pick = (clientX: number, clientY: number): number | null => {
    const overlay = overlayRef.current;
    if (!overlay || !tree.current) return null;
    const rect = overlay.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wp = screenToWorld(sx, sy);
    if (!wp) return null;
    // hover radius in world units = HOVER_RADIUS_PX / (half * tr.k)
    const { w, h } = size.current;
    const half = Math.min(w, h) * 0.5 * 0.96;
    const worldR = HOVER_RADIUS_PX / (half * transform.current.k);
    const idx = tree.current.find(wp[0], wp[1], worldR);
    return idx === undefined ? null : idx;
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      onMouseMove={(e) => onHover(pick(e.clientX, e.clientY))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        // d3-zoom blocks mousedown propagation, so onMouseDown/Up never fire here.
        // d3-drag suppresses click after a real drag, so this only fires on clean clicks.
        const idx = pick(e.clientX, e.clientY);
        if (idx !== null) onToggleMark(idx);
      }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
