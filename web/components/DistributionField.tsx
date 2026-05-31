"use client";

import { useEffect, useRef } from "react";

export type ParticleData = {
  words: string[];
  years: number[];
  pm: Float32Array[]; // per year, length n (per-million)
  base: Float32Array; // per word, 2014-15 mean pm
};

type Props = {
  data: ParticleData;
  yearIndex: number;
  onHover?: (info: { w: string; lift: number; x: number; y: number } | null) => void;
};

const LO = -3, HI = 5; // log2 frequency-change domain
const EPS = 0.05;
const NB = 120; // x bins
const TWEEN_MS = 950;
// colour by direction of change
const FALL: [number, number, number] = [96, 150, 240];   // cool blue
const NEUT: [number, number, number] = [212, 218, 235];   // near-white
const RISE: [number, number, number] = [248, 190, 96];    // warm gold

export function DistributionField({ data, yearIndex, onHover }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 1, h: 1 });
  const dpr = useRef(1);
  const n = data.words.length;

  const curX = useRef<Float32Array>(new Float32Array(n));
  const curY = useRef<Float32Array>(new Float32Array(n));
  const fromX = useRef<Float32Array>(new Float32Array(n));
  const fromY = useRef<Float32Array>(new Float32Array(n));
  const toX = useRef<Float32Array>(new Float32Array(n));
  const toY = useRef<Float32Array>(new Float32Array(n));
  const grp = useRef<Uint8Array>(new Uint8Array(n)); // 0 fall,1 neut,2 rise
  const groups = useRef<number[][]>([[], [], []]);
  const tStart = useRef(0);
  const tActive = useRef(false);
  const vScale = useRef(1);
  const inited = useRef(false);
  const prevYi = useRef(-1);

  const pad = { l: 24, r: 24, t: 28, b: 40 };
  const plotW = () => size.current.w - pad.l - pad.r;
  const plotH = () => size.current.h - pad.t - pad.b;
  const xForLift = (lift: number) => {
    const f = Math.max(0, Math.min(1, (lift - LO) / (HI - LO)));
    return pad.l + f * plotW();
  };

  // fixed vertical scale so the tallest column (2014 spike) ~fills the height
  // and later years visibly collapse + spread (area-honest morph via sqrt).
  const computeVScale = () => {
    let maxSqrt = 1;
    for (let yi = 0; yi < data.years.length; yi++) {
      const pmY = data.pm[yi];
      const counts = new Int32Array(NB);
      for (let i = 0; i < n; i++) {
        const lift = Math.log2((pmY[i] + EPS) / (data.base[i] + EPS));
        const f = Math.max(0, Math.min(0.999, (lift - LO) / (HI - LO)));
        counts[(f * NB) | 0]++;
      }
      for (let b = 0; b < NB; b++) if (Math.sqrt(counts[b]) > maxSqrt) maxSqrt = Math.sqrt(counts[b]);
    }
    vScale.current = (plotH() * 0.94) / maxSqrt;
  };

  const computeTargets = (yi: number) => {
    const pmY = data.pm[yi];
    const counts = new Int32Array(NB);
    const binOf = new Int32Array(n);
    const lifts = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lift = Math.log2((pmY[i] + EPS) / (data.base[i] + EPS));
      lifts[i] = lift;
      const f = Math.max(0, Math.min(0.999, (lift - LO) / (HI - LO)));
      const b = (f * NB) | 0;
      binOf[i] = b;
      counts[b]++;
    }
    const seen = new Int32Array(NB);
    const baseY = pad.t + plotH();
    const g: number[][] = [[], [], []];
    for (let i = 0; i < n; i++) {
      const b = binOf[i];
      const colH = Math.sqrt(counts[b]) * vScale.current;
      const frac = counts[b] > 1 ? seen[b] / (counts[b] - 1) : 0;
      seen[b]++;
      toX.current[i] = pad.l + ((b + 0.5) / NB) * plotW();
      toY.current[i] = baseY - frac * colH;
      const lift = lifts[i];
      const gi = lift > 0.35 ? 2 : lift < -0.35 ? 0 : 1;
      grp.current[i] = gi;
      g[gi].push(i);
    }
    groups.current = g;
  };

  const layout = (yi: number, animate: boolean) => {
    if (!size.current.w) return;
    computeVScale();
    computeTargets(yi);
    if (animate && inited.current) {
      fromX.current.set(curX.current);
      fromY.current.set(curY.current);
      tStart.current = performance.now();
      tActive.current = true;
    } else {
      curX.current.set(toX.current);
      curY.current.set(toY.current);
      tActive.current = false;
    }
    inited.current = true;
  };

  // base + resize + initial layout
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr.current = window.devicePixelRatio || 1;
      size.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr.current;
      canvas.height = rect.height * dpr.current;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      layout(prevYi.current < 0 ? yearIndex : prevYi.current, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // year change -> animate morph
  useEffect(() => {
    if (prevYi.current === yearIndex) return;
    layout(yearIndex, true);
    prevYi.current = yearIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearIndex]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const { w, h } = size.current;
      const r = dpr.current;
      const cx = curX.current, cy = curY.current;
      if (tActive.current) {
        const t = Math.min(1, (performance.now() - tStart.current) / TWEEN_MS);
        const e = 1 - Math.pow(1 - t, 3);
        const fx = fromX.current, fy = fromY.current, tx = toX.current, ty = toY.current;
        for (let i = 0; i < n; i++) {
          cx[i] = fx[i] + (tx[i] - fx[i]) * e;
          cy[i] = fy[i] + (ty[i] - fy[i]) * e;
        }
        if (t >= 1) tActive.current = false;
      }
      ctx.setTransform(r, 0, 0, r, 0, 0);
      ctx.fillStyle = "#05060c";
      ctx.fillRect(0, 0, w, h);
      // deep-space nebula glow behind the distribution (cinematic, matches /space)
      const md = Math.max(w, h);
      const nb = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, md * 0.6);
      nb.addColorStop(0, "rgba(46,34,86,0.5)");
      nb.addColorStop(0.5, "rgba(24,24,58,0.22)");
      nb.addColorStop(1, "rgba(5,6,12,0)");
      ctx.fillStyle = nb;
      ctx.fillRect(0, 0, w, h);

      // additive particle bloom — dense regions of the distribution glow
      ctx.globalCompositeOperation = "lighter";
      const cols = [FALL, NEUT, RISE];
      for (let gi = 0; gi < 3; gi++) {
        const list = groups.current[gi];
        if (!list.length) continue;
        const c = cols[gi];
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.4)`;
        ctx.beginPath();
        for (let j = 0; j < list.length; j++) {
          const i = list[j];
          ctx.moveTo(cx[i] + 1.6, cy[i]);
          ctx.arc(cx[i], cy[i], 1.6, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // baseline + zero line
      const zeroX = xForLift(0);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(zeroX, pad.t - 6);
      ctx.lineTo(zeroX, h - pad.b + 4);
      ctx.stroke();

      // x labels
      ctx.fillStyle = "rgba(150,150,160,0.85)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (const v of [-2, -1, 0, 1, 2, 3, 4]) {
        const label = v === 0 ? "same" : v < 0 ? `${Math.round(100 / 2 ** -v)}%` : `×${2 ** v}`;
        ctx.fillText(label, xForLift(v), h - pad.b + 20);
      }
      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  // hover: nearest particle (throttled ~30fps to keep the O(n) scan cheap)
  const lastHover = useRef(0);
  const onMove = (clientX: number, clientY: number) => {
    if (!onHover) return;
    const tnow = performance.now();
    if (tnow - lastHover.current < 33) return;
    lastHover.current = tnow;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    let best = -1, bd = 100;
    const cx = curX.current, cy = curY.current;
    for (let i = 0; i < n; i++) {
      const dx = cx[i] - mx, dy = cy[i] - my;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { onHover(null); return; }
    const pmY = data.pm[Math.max(0, prevYi.current)];
    const lift = Math.log2((pmY[best] + EPS) / (data.base[best] + EPS));
    onHover({ w: data.words[best], lift, x: cx[best], y: cy[best] });
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full h-[60vh] min-h-[420px]"
      onMouseMove={(e) => onMove(e.clientX, e.clientY)}
      onMouseLeave={() => onHover?.(null)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
