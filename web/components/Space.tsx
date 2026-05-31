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
  onToggleMark?: (idx: number) => void;
  // brightness: per-year per-million freq (year-major); points get brighter the
  // more common the word was that year. Absent => uniform cloud (original look).
  freqByYear?: Float32Array[];
  // --- story mode (all optional; absent => the original interactive /space) ---
  labels?: (string | null)[]; // aligned to markedIndices
  dimBackground?: boolean; // fade the cloud so marked words pop
  interactive?: boolean; // default true; false => camera on rails, no user zoom
  fitIndices?: number[] | null; // frame these words (across all years) when set
  fitMinSpan?: number; // glow: minimum framed extent (UMAP units) so tight clusters keep context
  markedGlow?: boolean; // glow: modulate marked words by their per-year frequency
};

const TWEEN_MS = 700;
const CAM_MS = 850;
const HOVER_RADIUS_PX = 8;

// Non-linear frequency -> brightness. pm spans ~5 orders of magnitude, so map on
// a log scale: most words sit dim near the bottom, the frequent tail lights up.
const B_LO = Math.log10(0.5);
const B_HI = Math.log10(200);
const B_RANGE = B_HI - B_LO;
const N_BUCKETS = 24;
const TRAIL_LEN = 18; // comet-trail length (frames) for moving marked words
function brightnessOf(pm: number): number {
  if (pm <= 0) return 0;
  const b = (Math.log10(pm + 0.1) - B_LO) / B_RANGE;
  return b < 0 ? 0 : b > 1 ? 1 : b;
}

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
  freqByYear,
  labels,
  dimBackground = false,
  interactive = true,
  fitIndices,
  fitMinSpan,
  markedGlow = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const currentCoords = useRef<Float32Array | null>(null);
  const tweenFrom = useRef<Float32Array | null>(null);
  const tweenTo = useRef<Float32Array | null>(null);
  const tweenStart = useRef<number>(0);
  const tweenActive = useRef<boolean>(false);
  const prevYi = useRef<number>(yearIndex);
  const transform = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const tree = useRef<d3.Quadtree<number> | null>(null);
  const dpr = useRef<number>(1);
  const size = useRef<{ w: number; h: number }>({ w: 1, h: 1 });
  // camera tween (story mode)
  const camFrom = useRef<{ k: number; x: number; y: number } | null>(null);
  const camTo = useRef<{ k: number; x: number; y: number } | null>(null);
  const camStart = useRef<number>(0);
  const camActive = useRef<boolean>(false);
  const camHasFit = useRef<boolean>(false);
  // brightness: per-year brightness arrays + current year's points bucketed by it
  const brightByYear = useRef<Float32Array[] | null>(null);
  const buckets = useRef<number[][] | null>(null);
  // per-marked-word recent world positions, for comet trails
  const trail = useRef<Map<number, number[]>>(new Map());
  // supernova bursts when a marked word snaps to a new cluster
  const flashes = useRef<{ x: number; y: number; start: number; col: RGB }[]>([]);
  const prevMarked = useRef<Set<number>>(new Set());

  const n = data.index.n_words;

  const regroup = (yi: number) => {
    const bb = brightByYear.current;
    if (!bb || !bb[yi]) {
      buckets.current = null;
      return;
    }
    const b = bb[yi];
    const lists: number[][] = Array.from({ length: N_BUCKETS }, () => []);
    for (let i = 0; i < n; i++) {
      let bk = (b[i] * N_BUCKETS) | 0;
      if (bk >= N_BUCKETS) bk = N_BUCKETS - 1;
      lists[bk].push(i);
    }
    buckets.current = lists;
  };

  // keep latest draw inputs in refs so the rAF loop (mounted once) sees them
  const draw = useRef({
    markedIndices,
    markedColors,
    highlightedMarkedIdx,
    hoveredIdx,
    labels,
    dimBackground,
    markedGlow,
  });
  draw.current = {
    markedIndices,
    markedColors,
    highlightedMarkedIdx,
    hoveredIdx,
    labels,
    dimBackground,
    markedGlow,
  };

  // Initial / resize setup + (interactive only) d3-zoom binding.
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

    let sel: d3.Selection<HTMLDivElement, unknown, null, undefined> | null = null;
    if (interactive) {
      sel = d3.select(overlay as HTMLDivElement);
      const zoom = d3
        .zoom<HTMLDivElement, unknown>()
        .scaleExtent([0.4, 40])
        .filter((event) => !event.ctrlKey && !event.button)
        .on("zoom", (event) => {
          transform.current = event.transform;
        });
      sel.call(zoom as never);
      sel.on("dblclick.zoom", null);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(overlay);

    return () => {
      if (sel) sel.on(".zoom", null);
      ro.disconnect();
    };
  }, [interactive]);

  // Year change -> tween coords + rebuild quadtree.
  useEffect(() => {
    if (prevYi.current === yearIndex && currentCoords.current) return;
    const target = new Float32Array(data.coords[yearIndex]);
    if (!currentCoords.current) {
      currentCoords.current = target;
      tweenActive.current = false;
      prevMarked.current = new Set(draw.current.markedIndices);
    } else {
      tweenFrom.current = new Float32Array(currentCoords.current);
      tweenTo.current = target;
      tweenStart.current = performance.now();
      tweenActive.current = true;
      // supernova: flash marked words that jump clusters this year (but not on
      // a story switch, when the whole marked set changes).
      const mk = draw.current.markedIndices;
      const newSet = new Set(mk);
      const sameSet =
        newSet.size === prevMarked.current.size &&
        [...newSet].every((x) => prevMarked.current.has(x));
      if (sameSet) {
        const from = tweenFrom.current;
        for (let i = 0; i < mk.length; i++) {
          const idx = mk[i];
          const dx = target[idx * 2] - from[idx * 2];
          const dy = target[idx * 2 + 1] - from[idx * 2 + 1];
          if (dx * dx + dy * dy > 0.08 * 0.08) {
            flashes.current.push({
              x: target[idx * 2],
              y: target[idx * 2 + 1],
              start: performance.now(),
              col: draw.current.markedColors[i] ?? [1, 1, 1],
            });
          }
        }
      } else {
        flashes.current = [];
      }
      prevMarked.current = newSet;
    }
    prevYi.current = yearIndex;
    regroup(yearIndex);
    const t = d3
      .quadtree<number>()
      .x((i) => target[i * 2])
      .y((i) => target[i * 2 + 1]);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) ids.push(i);
    t.addAll(ids);
    tree.current = t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearIndex, data, n]);

  // Precompute brightness per year from frequencies (log map), then bucket the
  // current year's points by it.
  useEffect(() => {
    if (!freqByYear) {
      brightByYear.current = null;
      buckets.current = null;
      return;
    }
    brightByYear.current = freqByYear.map((col) => {
      const b = new Float32Array(col.length);
      for (let i = 0; i < col.length; i++) b[i] = brightnessOf(col[i]);
      return b;
    });
    regroup(prevYi.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freqByYear]);

  // Story-mode camera: frame fitIndices across ALL years (stable frame).
  useEffect(() => {
    if (interactive || !fitIndices || fitIndices.length === 0) return;
    const { w, h } = size.current;
    const pad = 0.96;
    const half = Math.min(w, h) * 0.5 * pad;
    const cx = w / 2;
    const cy = h / 2;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let yi = 0; yi < data.coords.length; yi++) {
      const c = data.coords[yi];
      for (const idx of fitIndices) {
        const x = c[idx * 2], y = c[idx * 2 + 1];
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    // glow: keep tight clusters from over-zooming — frame at least fitMinSpan,
    // centered on the cluster, so you see it light up against its surroundings.
    if (fitMinSpan) {
      const mcx = (minx + maxx) / 2, mcy = (miny + maxy) / 2;
      const h2 = fitMinSpan / 2;
      if (maxx - minx < fitMinSpan) { minx = mcx - h2; maxx = mcx + h2; }
      if (maxy - miny < fitMinSpan) { miny = mcy - h2; maxy = mcy + h2; }
    }
    const bx0 = cx + minx * half, bx1 = cx + maxx * half;
    const by0 = cy + miny * half, by1 = cy + maxy * half;
    const bw = Math.max(bx1 - bx0, 1);
    const bh = Math.max(by1 - by0, 1);
    const fitPad = 0.52; // marked words fill ~half the viewport
    let k = Math.min((w * fitPad) / bw, (h * fitPad) / bh);
    k = Math.max(0.4, Math.min(50, k));
    const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
    const target = { k, x: w / 2 - k * bcx, y: h / 2 - k * bcy };
    if (!camHasFit.current) {
      transform.current = d3.zoomIdentity.translate(target.x, target.y).scale(target.k);
      camHasFit.current = true;
    } else {
      const tr = transform.current;
      camFrom.current = { k: tr.k, x: tr.x, y: tr.y };
      camTo.current = target;
      camStart.current = performance.now();
      camActive.current = true;
    }
  }, [fitIndices, data, interactive, fitMinSpan]);

  // Render loop (mounted once).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const frame = () => {
      const cur = currentCoords.current;
      if (!cur) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const D = draw.current;

      if (tweenActive.current && tweenFrom.current && tweenTo.current) {
        const t = Math.min(1, (performance.now() - tweenStart.current) / TWEEN_MS);
        const e = 1 - Math.pow(1 - t, 3);
        const from = tweenFrom.current, to = tweenTo.current;
        for (let i = 0; i < cur.length; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
        if (t >= 1) tweenActive.current = false;
      }
      if (camActive.current && camFrom.current && camTo.current) {
        const t = Math.min(1, (performance.now() - camStart.current) / CAM_MS);
        const e = 1 - Math.pow(1 - t, 3);
        const f = camFrom.current, to = camTo.current;
        transform.current = d3.zoomIdentity
          .translate(f.x + (to.x - f.x) * e, f.y + (to.y - f.y) * e)
          .scale(f.k + (to.k - f.k) * e);
        if (t >= 1) camActive.current = false;
      }

      const { w, h } = size.current;
      const r = dpr.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pad = 0.96;
      const half = Math.min(w, h) * 0.5 * pad;
      const cx = w / 2, cy = h / 2;
      const tr = transform.current;
      const now = performance.now();
      // parallax: nebula drifts a little against the stars for depth
      const px = Math.max(-90, Math.min(90, tr.x * 0.05));
      const py = Math.max(-90, Math.min(90, tr.y * 0.05));

      // --- deep-space nebula background (screen space) ---
      ctx.setTransform(r, 0, 0, r, 0, 0);
      ctx.fillStyle = "#04050a";
      ctx.fillRect(0, 0, w, h);
      const maxd = Math.max(w, h);
      const n1x = w * 0.46 + px, n1y = h * 0.42 + py;
      const neb1 = ctx.createRadialGradient(n1x, n1y, 0, n1x, n1y, maxd * 0.62);
      neb1.addColorStop(0, "rgba(48,36,92,0.55)");
      neb1.addColorStop(0.45, "rgba(26,26,64,0.28)");
      neb1.addColorStop(1, "rgba(4,5,10,0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, w, h);
      const n2x = w * 0.73 + px * 1.6, n2y = h * 0.71 + py * 1.6;
      const neb2 = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, maxd * 0.5);
      neb2.addColorStop(0, "rgba(98,44,74,0.22)");
      neb2.addColorStop(1, "rgba(4,5,10,0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, w, h);

      // --- world space (zoom) for the points ---
      ctx.translate(tr.x, tr.y);
      ctx.scale(tr.k, tr.k);

      const sx = (i: number) => cx + cur[i * 2] * half;
      const sy = (i: number) => cy + cur[i * 2 + 1] * half;

      // background cloud — brightness by per-year frequency when available.
      const rscale = 1 / Math.max(0.8, tr.k * 0.6);
      const bk = buckets.current;
      if (bk) {
        const dim = D.dimBackground;
        const baseA = dim ? 0.008 : 0.012;
        const gainA = dim ? 0.6 : 1.0;
        const GAMMA = 3.4; // steeper => dim words recede hard, frequent ones blaze
        // additive bloom: dense / bright regions glow like a galaxy core
        ctx.globalCompositeOperation = "lighter";
        for (let b = 0; b < N_BUCKETS; b++) {
          const bm = (b + 0.5) / N_BUCKETS;
          if (bm < 0.5) continue;
          const list = bk[b];
          if (list.length === 0) continue;
          // twinkle: each brightness layer shimmers slightly out of phase
          const tw = 1 + 0.24 * Math.sin(now * 0.0016 + b * 0.6);
          const ba = (dim ? 0.05 : 0.1) * bm * bm * tw;
          ctx.fillStyle = `rgba(255,226,184,${ba.toFixed(3)})`;
          const gr = (2.2 + 10 * (bm - 0.5)) * rscale;
          ctx.beginPath();
          for (let j = 0; j < list.length; j++) {
            const i = list[j];
            const x = sx(i), y = sy(i);
            ctx.moveTo(x + gr, y);
            ctx.arc(x, y, gr, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
        // core pass
        for (let b = 0; b < N_BUCKETS; b++) {
          const list = bk[b];
          if (list.length === 0) continue;
          const bm = (b + 0.5) / N_BUCKETS; // bucket midpoint brightness
          let a = baseA + Math.pow(bm, GAMMA) * gainA;
          if (a > 1) a = 1;
          const cr = Math.round(56 + bm * (255 - 56));
          const cg = Math.round(72 + bm * (249 - 72));
          const cb = Math.round(120 + bm * (232 - 120));
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
          const rr = (0.62 + 1.0 * bm) * rscale;
          ctx.beginPath();
          for (let j = 0; j < list.length; j++) {
            const i = list[j];
            const x = sx(i), y = sy(i);
            ctx.moveTo(x + rr, y);
            ctx.arc(x, y, rr, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      } else {
        // fallback: uniform cloud (no frequency data)
        const cloudA = D.dimBackground ? 0.12 : 0.35;
        ctx.fillStyle = `rgba(128,136,160,${cloudA})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = sx(i), y = sy(i);
          ctx.moveTo(x + 0.9 * rscale, y);
          ctx.arc(x, y, 0.9 * rscale, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // comet trails — marked words streak as they migrate across years
      {
        const curMarked = new Set(D.markedIndices);
        for (const k of trail.current.keys()) if (!curMarked.has(k)) trail.current.delete(k);
        ctx.lineCap = "round";
        for (let i = 0; i < D.markedIndices.length; i++) {
          const idx = D.markedIndices[i];
          let buf = trail.current.get(idx);
          if (!buf) { buf = []; trail.current.set(idx, buf); }
          buf.push(cur[idx * 2], cur[idx * 2 + 1]);
          if (buf.length > TRAIL_LEN * 2) buf.splice(0, buf.length - TRAIL_LEN * 2);
          const pts = buf.length / 2;
          if (pts < 3) continue;
          const col = D.markedColors[i] ?? [1, 1, 1];
          for (let s = 1; s < pts; s++) {
            const f = s / pts;
            ctx.strokeStyle = rgbCss(col, f * f * 0.6);
            ctx.lineWidth = (0.3 + 3.4 * f) / tr.k;
            ctx.beginPath();
            ctx.moveTo(cx + buf[(s - 1) * 2] * half, cy + buf[(s - 1) * 2 + 1] * half);
            ctx.lineTo(cx + buf[s * 2] * half, cy + buf[s * 2 + 1] * half);
            ctx.stroke();
          }
        }
      }

      // marked: halo + core. In glow mode the intensity tracks the word's
      // per-year frequency, so a cluster visibly lights up as you scrub.
      const glowB = D.markedGlow ? brightByYear.current?.[prevYi.current] : undefined;
      for (let i = 0; i < D.markedIndices.length; i++) {
        const idx = D.markedIndices[i];
        const col = D.markedColors[i] ?? [1, 1, 1];
        const x = sx(idx), y = sy(idx);
        const isHi = D.highlightedMarkedIdx === i;
        const f = glowB ? 0.07 + 0.93 * Math.pow(glowB[idx], 1.6) : 1;
        const haloR = (isHi ? 18 : 12) / tr.k;
        const coreR = (isHi ? 5.5 : 3.5) / tr.k;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        grad.addColorStop(0, rgbCss(col, 0.85 * f));
        grad.addColorStop(0.45, rgbCss(col, 0.25 * f));
        grad.addColorStop(1, rgbCss(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgbCss(col, Math.max(glowB ? 0.15 : 1, f));
        ctx.beginPath();
        ctx.arc(x, y, coreR, 0, Math.PI * 2);
        ctx.fill();
      }

      // supernova bursts — expanding shockwave + glow when a word snaps clusters
      if (flashes.current.length) {
        ctx.globalCompositeOperation = "lighter";
        for (let fi = flashes.current.length - 1; fi >= 0; fi--) {
          const fl = flashes.current[fi];
          const t = (now - fl.start) / 1100;
          if (t >= 1) { flashes.current.splice(fi, 1); continue; }
          const x = cx + fl.x * half, y = cy + fl.y * half;
          const ease = 1 - Math.pow(1 - t, 2);
          const R = (8 + ease * 92) / tr.k;
          const a = 1 - t;
          // expanding colored glow
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, rgbCss(fl.col, 0.6 * a));
          g.addColorStop(0.45, rgbCss(fl.col, 0.2 * a));
          g.addColorStop(1, rgbCss(fl.col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, R, 0, Math.PI * 2);
          ctx.fill();
          // bright shockwave ring
          ctx.strokeStyle = rgbCss(fl.col, 0.95 * a * a);
          ctx.lineWidth = (3.2 * a + 0.4) / tr.k;
          ctx.beginPath();
          ctx.arc(x, y, R, 0, Math.PI * 2);
          ctx.stroke();
          // white-hot initial pop (fast)
          if (t < 0.45) {
            const p = 1 - t / 0.45;
            const cr = (5 + ease * 26) / tr.k;
            const wg = ctx.createRadialGradient(x, y, 0, x, y, cr);
            wg.addColorStop(0, `rgba(255,250,236,${(0.85 * p).toFixed(3)})`);
            wg.addColorStop(1, "rgba(255,250,236,0)");
            ctx.fillStyle = wg;
            ctx.beginPath();
            ctx.arc(x, y, cr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // labels (story mode) — screen-constant size via /tr.k
      if (D.labels) {
        const fs = 13 / tr.k;
        const off = 9 / tr.k;
        ctx.font = `${fs}px ui-monospace, monospace`;
        ctx.textBaseline = "middle";
        for (let i = 0; i < D.markedIndices.length; i++) {
          const text = D.labels[i];
          if (!text) continue;
          const idx = D.markedIndices[i];
          const col = D.markedColors[i] ?? [1, 1, 1];
          const x = sx(idx) + off, y = sy(idx);
          ctx.lineWidth = 3 / tr.k;
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.strokeText(text, x, y);
          ctx.fillStyle = rgbCss(col, 1);
          ctx.fillText(text, x, y);
        }
      }

      // hovered
      if (D.hoveredIdx !== null && D.hoveredIdx >= 0 && D.hoveredIdx < n) {
        const x = sx(D.hoveredIdx), y = sy(D.hoveredIdx);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5 / tr.k;
        ctx.beginPath();
        ctx.arc(x, y, 6 / tr.k, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- vignette on top (screen space) for cinematic focus ---
      ctx.setTransform(r, 0, 0, r, 0, 0);
      const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.32, cx, cy, maxd * 0.72);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [n]);

  // hover/click picking
  const screenToWorld = (sx: number, sy: number): [number, number] | null => {
    const { w, h } = size.current;
    const tr = transform.current;
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
    const wp = screenToWorld(clientX - rect.left, clientY - rect.top);
    if (!wp) return null;
    const { w, h } = size.current;
    const half = Math.min(w, h) * 0.5 * 0.96;
    const worldR = HOVER_RADIUS_PX / (half * transform.current.k);
    const idx = tree.current.find(wp[0], wp[1], worldR);
    return idx === undefined ? null : idx;
  };

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
      onMouseMove={(e) => onHover(pick(e.clientX, e.clientY))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        if (!onToggleMark) return;
        const idx = pick(e.clientX, e.clientY);
        if (idx !== null) onToggleMark(idx);
      }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
