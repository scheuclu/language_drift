"use client";

import { useMemo } from "react";
import type { ParticleData } from "./DistributionField";

type Props = { data: ParticleData; yearIndex: number };

const X0 = -1.5, X1 = 3.5, NB = 110;
const W = 1000, H = 460;
const PAD = { l: 16, r: 16, t: 24, b: 40 };

// time gradient: 2014 cool blue -> 2025 warm gold
export function yearColor(t: number): string {
  const a = [96, 140, 230];
  const b = [248, 190, 96];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export function FreqSpectrum({ data, yearIndex }: Props) {
  const { hist, centers, maxD } = useMemo(() => {
    const bw = (X1 - X0) / NB;
    const centers = Array.from({ length: NB }, (_, b) => X0 + (b + 0.5) * bw);
    const hist = data.years.map((_, yi) => {
      const c = new Float32Array(NB);
      const pmY = data.pm[yi];
      const n = pmY.length;
      for (let i = 0; i < n; i++) {
        const lp = Math.log10(Math.max(pmY[i], 1e-3));
        let b = Math.floor((lp - X0) / bw);
        if (b < 0) b = 0;
        if (b >= NB) b = NB - 1;
        c[b]++;
      }
      for (let b = 0; b < NB; b++) c[b] = c[b] / (n * bw);
      return c;
    });
    let maxD = 0;
    for (const h of hist) for (const v of h) if (v > maxD) maxD = v;
    return { hist, centers, maxD };
  }, [data]);

  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const xFor = (lp: number) => PAD.l + ((lp - X0) / (X1 - X0)) * plotW;
  const yFor = (d: number) => PAD.t + plotH - (d / maxD) * plotH;
  const linePath = (h: Float32Array) =>
    centers.map((lp, b) => `${b ? "L" : "M"}${xFor(lp).toFixed(1)},${yFor(h[b]).toFixed(1)}`).join(" ");
  const areaPath = (h: Float32Array) =>
    `${linePath(h)} L${xFor(centers[NB - 1]).toFixed(1)},${(PAD.t + plotH).toFixed(1)} L${xFor(centers[0]).toFixed(1)},${(PAD.t + plotH).toFixed(1)} Z`;

  const n = data.years.length;
  const ticks = [-1, 0, 1, 2, 3]; // log10 per-million
  const tickLabel = (v: number) =>
    v < 0 ? `${Math.pow(10, v).toFixed(1)}` : v === 0 ? "1" : v >= 3 ? "1k" : `${Math.pow(10, v)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
      <defs>
        <linearGradient id="specActive" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={yearColor(yearIndex / (n - 1))} stopOpacity={0.34} />
          <stop offset="100%" stopColor={yearColor(yearIndex / (n - 1))} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* x grid + labels */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={xFor(v)} x2={xFor(v)} y1={PAD.t} y2={PAD.t + plotH} stroke="rgba(255,255,255,0.05)" />
          <text x={xFor(v)} y={H - PAD.b + 22} textAnchor="middle" className="fill-muted" fontSize="11" fontFamily="monospace">
            {tickLabel(v)}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 6} textAnchor="middle" className="fill-muted" fontSize="11" fontFamily="monospace">
        how common a word is that year (per million, log scale) →
      </text>

      {/* ghost curves for every year */}
      {hist.map((h, yi) =>
        yi === yearIndex ? null : (
          <path
            key={yi}
            d={linePath(h)}
            fill="none"
            stroke={yearColor(yi / (n - 1))}
            strokeWidth={1}
            strokeOpacity={0.28}
          />
        ),
      )}

      {/* active year: filled + bold, on top */}
      <path d={areaPath(hist[yearIndex])} fill="url(#specActive)" />
      <path
        d={linePath(hist[yearIndex])}
        fill="none"
        stroke={yearColor(yearIndex / (n - 1))}
        strokeWidth={2.75}
        strokeLinejoin="round"
        style={{ transition: "d 0.3s" }}
      />
    </svg>
  );
}
