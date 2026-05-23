"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

export type Trajectory = {
  target: string;
  color: string;
  // sims[yi] is [s_a, s_b, s_c] cosine to each anchor in year yi.
  // null where the target lacks vectors for that year (shouldn't happen, but safe).
  sims: (readonly [number, number, number] | null)[];
};

type Props = {
  years: number[];
  anchors: [string, string, string];
  trajectories: Trajectory[];
};

const SQRT3_2 = Math.sqrt(3) / 2;
const CORNERS = [
  { x: 0, y: -1 }, // A: top
  { x: -SQRT3_2, y: 0.5 }, // B: bottom-left
  { x: SQRT3_2, y: 0.5 }, // C: bottom-right
] as const;

// Softmax temperature. Lower = more peaked toward the highest anchor; higher = more centroid.
// 0.15 gives noticeable spread without pinning everything to a corner.
const SOFTMAX_T = 0.07;

function bary(sims: readonly [number, number, number]): { x: number; y: number } {
  const m = Math.max(sims[0], sims[1], sims[2]);
  const e0 = Math.exp((sims[0] - m) / SOFTMAX_T);
  const e1 = Math.exp((sims[1] - m) / SOFTMAX_T);
  const e2 = Math.exp((sims[2] - m) / SOFTMAX_T);
  const sum = e0 + e1 + e2;
  const w0 = e0 / sum;
  const w1 = e1 / sum;
  const w2 = e2 / sum;
  return {
    x: w0 * CORNERS[0].x + w1 * CORNERS[1].x + w2 * CORNERS[2].x,
    y: w0 * CORNERS[0].y + w1 * CORNERS[1].y + w2 * CORNERS[2].y,
  };
}

export function Triangle({ years, anchors, trajectories }: Props) {
  const [hover, setHover] = useState<{ ti: number; yi: number } | null>(null);
  const [activeTi, setActiveTi] = useState<number | null>(null);

  const paths = useMemo(() => {
    return trajectories.map((t) => {
      const points = t.sims.map((s) => (s ? bary(s) : null));
      return { ...t, points };
    });
  }, [trajectories]);

  const allLabeled = anchors.every((a) => a.length > 0);

  return (
    <div className="relative w-full h-full">
      <svg
        viewBox="-1 -1.2 2 1.9"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {/* gridlines: inner triangle at scales 1/3, 2/3 */}
        {[1 / 3, 2 / 3].map((s) => (
          <polygon
            key={s}
            points={CORNERS.map((c) => `${c.x * s},${c.y * s}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.004}
          />
        ))}

        {/* outer triangle */}
        <polygon
          points={CORNERS.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={0.008}
        />

        {/* trajectories */}
        {paths.map((t, ti) => {
          const pts = t.points.filter((p): p is { x: number; y: number } => p !== null);
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
          const isActive = activeTi === ti;
          const isDimmed = activeTi !== null && activeTi !== ti;
          const lineOpacity = isActive ? 1 : isDimmed ? 0.15 : 0.6;
          const lineWidth = isActive ? 0.009 : 0.006;
          const dotOpacity = isDimmed ? 0.2 : 1;
          const dotR = isActive ? 0.014 : 0.011;
          return (
            <g
              key={t.target}
              onMouseEnter={() => setActiveTi(ti)}
              onMouseLeave={() => {
                setActiveTi(null);
                setHover(null);
              }}
            >
              {/* invisible wide hit line for easy line-hover */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={0.04}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: "pointer" }}
              />
              <motion.path
                d={d}
                fill="none"
                stroke={t.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "none" }}
                initial={false}
                animate={{ opacity: lineOpacity, strokeWidth: lineWidth }}
                transition={{ duration: 0.2 }}
              />
              {t.points.map((p, yi) => {
                if (!p) return null;
                return (
                  <g
                    key={yi}
                    onMouseEnter={() => setHover({ ti, yi })}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle cx={p.x} cy={p.y} r={0.04} fill="transparent" />
                    <motion.circle
                      cx={p.x}
                      cy={p.y}
                      fill={t.color}
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={0.002}
                      animate={{ r: dotR, opacity: dotOpacity }}
                      transition={{ duration: 0.2 }}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* year labels on the trajectory endpoints */}
        {paths.map((t, ti) =>
          t.points.map((p, yi) => {
            if (!p) return null;
            const isFirst = yi === 0;
            const isLast = yi === t.points.length - 1;
            if (!isFirst && !isLast) return null;
            const dimmed = activeTi !== null && activeTi !== ti;
            return (
              <text
                key={t.target + "-" + yi}
                x={p.x}
                y={p.y - 0.05}
                fontSize={0.045}
                fill={dimmed ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.65)"}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {years[yi]}
              </text>
            );
          }),
        )}

        {/* anchor labels at corners */}
        {anchors.map((a, i) => {
          const c = CORNERS[i];
          const offY = c.y < 0 ? -0.08 : 0.12;
          return (
            <text
              key={i}
              x={c.x}
              y={c.y + offY}
              fontSize={0.07}
              fill={a ? "rgba(244,184,96,0.95)" : "rgba(255,255,255,0.3)"}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {a || "(pick)"}
            </text>
          );
        })}

        {!allLabeled && (
          <text
            x={0}
            y={0}
            fontSize={0.06}
            fill="rgba(255,255,255,0.4)"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            pick three anchor words
          </text>
        )}
      </svg>

      {hover && allLabeled && (
        <div className="absolute top-2 left-2 backdrop-blur-md bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono pointer-events-none">
          <div className="text-foreground">
            <span style={{ color: paths[hover.ti].color }}>
              {paths[hover.ti].target}
            </span>{" "}
            · {years[hover.yi]}
          </div>
          <div className="text-muted mt-1 space-y-0.5">
            {paths[hover.ti].sims[hover.yi]?.map((s, i) => (
              <div key={i}>
                <span className="text-foreground/70 w-20 inline-block">
                  {anchors[i]}
                </span>
                <span className="tabular-nums">{s.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
