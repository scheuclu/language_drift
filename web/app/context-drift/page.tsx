"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

type Point = {
  label: string;
  x: number;
  y: number;
  source: "target_a" | "target_b" | "context_a" | "context_b";
};

type DriftResponse = {
  similarity: number;
  distance: number;
  points: Point[];
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const DEFAULT_WORD = "bank";
const DEFAULT_CONTEXT_A = "He went to the bank to cash a check.";
const DEFAULT_CONTEXT_B = "They sat on the grassy bank of the river.";

function ContextDriftInner() {
  const searchParams = useSearchParams();
  const queryWord = searchParams.get("w") || DEFAULT_WORD;

  const [word, setWord] = useState(queryWord);
  const [contextA, setContextA] = useState(DEFAULT_CONTEXT_A);
  const [contextB, setContextB] = useState(DEFAULT_CONTEXT_B);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DriftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-run if query param word changes
  useEffect(() => {
    const w = searchParams.get("w");
    if (w) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWord(w);
    }
  }, [searchParams]);

  const fetchDrift = async (targetWord: string, a: string, b: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/context-drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: targetWord,
          context_a: a,
          context_b: b,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to process sentences.");
      }

      const data = (await res.json()) as DriftResponse;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect to NLP service. Make sure server.py is running.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Run initial query
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDrift(word, contextA, contextB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDrift(word, contextA, contextB);
  };

  // Compute SVG plot viewport scaling
  const plotData = useMemo(() => {
    if (!result || result.points.length === 0) return null;

    const xs = result.points.map((p) => p.x);
    const ys = result.points.map((p) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Padding percentages
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;

    return {
      points: result.points,
      bounds: {
        minX: minX - spanX * 0.15,
        maxX: maxX + spanX * 0.15,
        minY: minY - spanY * 0.15,
        maxY: maxY + spanY * 0.15,
      },
    };
  }, [result]);

  // Map coordinates to SVG viewPort [0, 500] and [0, 400]
  const scaleCoord = (x: number, y: number, bounds: Bounds) => {
    const W = 600;
    const H = 450;
    const padding = 50;

    const scaleX = (W - padding * 2) / (bounds.maxX - bounds.minX);
    const scaleY = (H - padding * 2) / (bounds.maxY - bounds.minY);

    const scaledX = padding + (x - bounds.minX) * scaleX;
    // Invert Y axis for SVG standard coordinates
    const scaledY = H - padding - (y - bounds.minY) * scaleY;

    return { x: scaledX, y: scaledY };
  };

  // Extract projected target points
  const targetPoints = useMemo(() => {
    if (!plotData) return null;
    const ptA = plotData.points.find((p) => p.source === "target_a");
    const ptB = plotData.points.find((p) => p.source === "target_b");
    if (!ptA || !ptB) return null;

    const coordA = scaleCoord(ptA.x, ptA.y, plotData.bounds);
    const coordB = scaleCoord(ptB.x, ptB.y, plotData.bounds);

    return { a: coordA, b: coordB, rawA: ptA, rawB: ptB };
  }, [plotData]);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-20 pb-16 px-5 sm:px-6 lg:px-10">
      {/* background atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[720px] h-[450px] rounded-full blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, rgba(93,213,232,0.1) 0%, rgba(244,184,96,0.04) 45%, transparent 70%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-2">
          contextual embeddings
        </div>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl leading-tight sm:leading-none mb-3">
          Type-level Context Drift.
        </h1>
        <p className="text-foreground/60 text-sm sm:text-base max-w-2xl leading-relaxed mb-8">
          BERT embeddings are contextual. Enter a target word and two sentences below. We will
          extract the word&apos;s hidden state vectors from DistilBERT, compute their semantic drift,
          and project them next to their sentence key concepts using PCA.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">
          {/* Controls Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted font-mono block">
                Target Word
              </label>
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                required
                className="w-full bg-white/[0.03] border border-white/10 focus:border-accent rounded px-3 py-2 text-sm font-mono text-foreground outline-none transition-colors"
                placeholder="e.g. bank"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted font-mono block">
                Sentence Context A
              </label>
              <textarea
                value={contextA}
                onChange={(e) => setContextA(e.target.value)}
                required
                rows={3}
                className="w-full bg-white/[0.03] border border-white/10 focus:border-accent rounded px-3 py-2 text-sm text-foreground outline-none transition-colors resize-none"
                placeholder="Sentence using the target word..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted font-mono block">
                Sentence Context B
              </label>
              <textarea
                value={contextB}
                onChange={(e) => setContextB(e.target.value)}
                required
                rows={3}
                className="w-full bg-white/[0.03] border border-white/10 focus:border-accent rounded px-3 py-2 text-sm text-foreground outline-none transition-colors resize-none"
                placeholder="Another sentence using the target word in a different context..."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-glow justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "running inference…" : "calculate drift"}
            </button>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-3 text-xs font-mono text-red-400 leading-relaxed">
                {error}
              </div>
            )}
          </form>

          {/* Visualization Canvas */}
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden flex flex-col min-h-[480px]">
            {loading ? (
              <div className="flex-1 grid place-items-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="w-2 h-2 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
                    <span className="w-2 h-2 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
                  </div>
                  <span className="text-muted font-mono text-[11px] uppercase tracking-wider">
                    Running model pipeline…
                  </span>
                </div>
              </div>
            ) : result && plotData && targetPoints ? (
              <div className="p-5 flex-1 flex flex-col">
                {/* Stats Panel */}
                <div className="grid grid-cols-2 gap-4 mb-5 border-b border-white/5 pb-4">
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
                      Cosine Similarity
                    </div>
                    <div className="text-2xl font-mono text-accent leading-none">
                      {result.similarity.toFixed(4)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
                      Cosine Distance (Drift)
                    </div>
                    <div className="text-2xl font-mono text-accent-3 leading-none">
                      {result.distance.toFixed(4)}
                    </div>
                  </div>
                </div>

                {/* SVG Graph Plot */}
                <div className="relative flex-1 bg-black/60 rounded-xl border border-white/5 overflow-hidden min-h-[350px]">
                  <svg
                    viewBox="0 0 600 450"
                    className="w-full h-full select-none"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {/* Gridlines */}
                    <line x1={50} x2={550} y1={225} y2={225} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
                    <line x1={300} x2={300} y1={50} y2={400} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />

                    {/* Vector line representing drift between word context A and B */}
                    <motion.line
                      x1={targetPoints.a.x}
                      y1={targetPoints.a.y}
                      x2={targetPoints.b.x}
                      y2={targetPoints.b.y}
                      stroke="url(#driftGradient)"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.2, ease: "easeInOut" }}
                    />

                    {/* Define Gradient */}
                    <defs>
                      <linearGradient id="driftGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#5dd5e8" />
                        <stop offset="100%" stopColor="#ff5da2" />
                      </linearGradient>
                    </defs>

                    {/* Plot background context words */}
                    {plotData.points.map((p) => {
                      if (p.source === "target_a" || p.source === "target_b") return null;
                      const { x, y } = scaleCoord(p.x, p.y, plotData.bounds);
                      const isA = p.source === "context_a";
                      return (
                        <g key={p.label + p.source}>
                          <circle
                            cx={x}
                            cy={y}
                            r={4.5}
                            fill={isA ? "#5dd5e8" : "#ff5da2"}
                            opacity={0.3}
                          />
                          <text
                            x={x}
                            y={y - 8}
                            fontSize={10}
                            fontFamily="monospace"
                            fill="rgba(255,255,255,0.55)"
                            textAnchor="middle"
                          >
                            {p.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Plot target words (large glowing anchors) */}
                    {/* Word Context A */}
                    <g>
                      <circle
                        cx={targetPoints.a.x}
                        cy={targetPoints.a.y}
                        r={12}
                        fill="#5dd5e8"
                        opacity={0.25}
                        className="animate-pulse"
                      />
                      <circle
                        cx={targetPoints.a.x}
                        cy={targetPoints.a.y}
                        r={6}
                        fill="#5dd5e8"
                        stroke="#070707"
                        strokeWidth={1.5}
                      />
                      <text
                        x={targetPoints.a.x}
                        y={targetPoints.a.y - 15}
                        fontSize={12}
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill="#5dd5e8"
                        textAnchor="middle"
                        style={{ textShadow: "0 0 10px rgba(93,213,232,0.6)" }}
                      >
                        {targetPoints.rawA.label}
                      </text>
                    </g>

                    {/* Word Context B */}
                    <g>
                      <circle
                        cx={targetPoints.b.x}
                        cy={targetPoints.b.y}
                        r={12}
                        fill="#ff5da2"
                        opacity={0.25}
                        className="animate-pulse"
                      />
                      <circle
                        cx={targetPoints.b.x}
                        cy={targetPoints.b.y}
                        r={6}
                        fill="#ff5da2"
                        stroke="#070707"
                        strokeWidth={1.5}
                      />
                      <text
                        x={targetPoints.b.x}
                        y={targetPoints.b.y - 15}
                        fontSize={12}
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill="#ff5da2"
                        textAnchor="middle"
                        style={{ textShadow: "0 0 10px rgba(255,93,162,0.6)" }}
                      >
                        {targetPoints.rawB.label}
                      </text>
                    </g>
                  </svg>
                </div>
              </div>
            ) : (
              <div className="flex-1 grid place-items-center text-muted font-mono text-xs italic">
                Enter target word and sentences to run analysis.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ContextDriftPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-20 pb-16 px-5 sm:px-6 lg:px-10 grid place-items-center">
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
            <span className="w-2 h-2 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
          </div>
        </main>
      }
    >
      <ContextDriftInner />
    </Suspense>
  );
}
