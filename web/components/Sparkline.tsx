"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

type Props = {
  values: number[];
  highlightIndex?: number;
  label?: string;
  unit?: string;
  yMin?: number;
  yMax?: number;
  height?: number;
  className?: string;
};

export function Sparkline({
  values,
  highlightIndex,
  label,
  unit,
  yMin,
  yMax,
  height = 56,
  className,
}: Props) {
  const path = useMemo(() => {
    if (values.length === 0) return { d: "", area: "", points: [] as [number, number][] };
    const lo = yMin ?? Math.min(...values);
    const hi = yMax ?? Math.max(...values);
    const range = Math.max(hi - lo, 1e-9);
    const w = 200;
    const h = height;
    const padX = 4;
    const padY = 6;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;
    const points: [number, number][] = values.map((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * usableW;
      const y = padY + (1 - (v - lo) / range) * usableH;
      return [x, y];
    });
    const d = points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const area =
      d +
      ` L${points[points.length - 1][0].toFixed(1)},${(h - padY).toFixed(1)}` +
      ` L${points[0][0].toFixed(1)},${(h - padY).toFixed(1)} Z`;
    return { d, area, points };
  }, [values, yMin, yMax, height]);

  const highlight =
    highlightIndex !== undefined && path.points[highlightIndex];

  return (
    <div className={className}>
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1 font-mono">
          {label}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 200 ${height}`} preserveAspectRatio="none">
        <motion.path
          d={path.area}
          fill="url(#sparkGrad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
        <defs>
          <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,184,96,0.45)" />
            <stop offset="100%" stopColor="rgba(244,184,96,0)" />
          </linearGradient>
        </defs>
        <motion.path
          d={path.d}
          fill="none"
          stroke="rgba(244,184,96,0.95)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9 }}
        />
        {highlight && (
          <>
            <line
              x1={highlight[0]}
              x2={highlight[0]}
              y1={0}
              y2={height}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
            />
            <circle
              cx={highlight[0]}
              cy={highlight[1]}
              r={3}
              fill="rgb(244,184,96)"
              stroke="rgb(7,8,12)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {highlight && highlightIndex !== undefined && (
        <div className="text-xs text-muted font-mono mt-1 tabular-nums">
          {values[highlightIndex].toLocaleString()}{unit ?? ""}
        </div>
      )}
    </div>
  );
}
