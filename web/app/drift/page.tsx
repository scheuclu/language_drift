"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type GalleryWord = {
  w: string;   // word
  f0: number;  // freq in 2014
  fm: number;  // max freq
  d: number;   // total drift
};

type WordShard = {
  w: string;     // word
  y: number[];   // years
  f: number[];   // frequencies
  d: number[];   // drift from base
  td: number;    // total drift
  n: [string, number][][]; // neighbors by year
};

const BASE_YEAR = 2018;

function DriftExplorerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryWord = searchParams.get("w") || "";

  const [gallery, setGallery] = useState<GalleryWord[]>([]);
  const [selectedWord, setSelectedWord] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeShard, setActiveShard] = useState<WordShard | null>(null);
  const [loadingShard, setLoadingShard] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the drift gallery on mount
  useEffect(() => {
    async function loadGallery() {
      try {
        const res = await fetch("/data/drift_gallery.json");
        if (!res.ok) throw new Error("Failed to load drift gallery");
        const data = await res.json();
        const topWords = data.top as GalleryWord[];
        setGallery(topWords);
        
        // Select word from query parameter or default to the most drifting word
        if (queryWord) {
          setSelectedWord(queryWord);
        } else if (topWords.length > 0) {
          setSelectedWord(topWords[0].w);
        }
      } catch (err) {
        console.error(err);
        setError("Error loading language drift dataset.");
      } finally {
        setLoadingGallery(false);
      }
    }
    loadGallery();
  }, [queryWord]);

  // Load the detailed word data whenever selectedWord changes
  useEffect(() => {
    if (!selectedWord) return;
    
    async function loadWordShard() {
      setLoadingShard(true);
      setError(null);
      try {
        const res = await fetch(`/data/w/${selectedWord.toLowerCase()}.json`);
        if (!res.ok) throw new Error(`Word '${selectedWord}' not found in the dataset.`);
        const data = (await res.json()) as WordShard;
        setActiveShard(data);
        
        // Sync URL query param without full page reload
        const params = new URLSearchParams(window.location.search);
        if (params.get("w") !== selectedWord) {
          params.set("w", selectedWord);
          router.push(`?${params.toString()}`, { scroll: false });
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load word details.");
        setActiveShard(null);
      } finally {
        setLoadingShard(false);
      }
    }
    loadWordShard();
  }, [selectedWord, router]);

  // Filter gallery based on search query
  const filteredGallery = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return gallery;
    return gallery.filter(item => item.w.toLowerCase().includes(q));
  }, [gallery, searchQuery]);

  // Process shard data for chart rendering
  const chartData = useMemo(() => {
    if (!activeShard) return null;
    
    const years = activeShard.y;
    const freqs = activeShard.f;
    const drifts = activeShard.d;
    
    // Map drift back to years, inserting 0.0 for the reference/base year (2018)
    const driftPoints: { year: number; val: number }[] = [];
    let dIdx = 0;
    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      if (year === BASE_YEAR) {
        driftPoints.push({ year, val: 0.0 });
      } else {
        driftPoints.push({ year, val: drifts[dIdx++] || 0.0 });
      }
    }

    const freqPoints = years.map((year, idx) => ({
      year,
      val: freqs[idx]
    }));

    return {
      years,
      driftPoints,
      freqPoints
    };
  }, [activeShard]);

  const handleWordSelect = (word: string) => {
    setSelectedWord(word);
  };

  // Helper to draw custom SVG line charts
  const renderLineChart = (
    points: { year: number; val: number }[],
    color: string,
    yLabel: string,
    isFreq = false
  ) => {
    const width = 500;
    const height = 180;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const xs = points.map(p => p.year);
    const ys = points.map(p => p.val);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = 0;
    const maxY = Math.max(...ys) || 1;

    const getX = (year: number) => 
      paddingLeft + ((year - minX) / (maxX - minX)) * (width - paddingLeft - paddingRight);

    const getY = (val: number) => 
      height - paddingBottom - ((val - minY) / (maxY - minY)) * (height - paddingTop - paddingBottom);

    // Build SVG path
    let path = "";
    let areaPath = "";
    
    points.forEach((p, i) => {
      const x = getX(p.year);
      const y = getY(p.val);
      if (i === 0) {
        path += `M ${x} ${y}`;
        areaPath += `M ${x} ${height - paddingBottom} L ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
        areaPath += ` L ${x} ${y}`;
      }
      if (i === points.length - 1) {
        areaPath += ` L ${x} ${height - paddingBottom} Z`;
      }
    });

    return (
      <div className="relative bg-white/[0.01] border border-white/5 rounded-xl p-4 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-2 flex justify-between">
          <span>{yLabel}</span>
          <span className="text-foreground/55 font-bold">
            {isFreq ? `Peak: ${Math.round(maxY).toLocaleString()} ppm` : `Max: ${maxY.toFixed(3)}`}
          </span>
        </div>
        
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
          {/* Y Axis Gridlines */}
          {[0, 0.5, 1].map((ratio) => {
            const val = minY + ratio * (maxY - minY);
            const y = getY(val);
            return (
              <g key={ratio} opacity={0.25}>
                <line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={paddingLeft - 8} y={y + 3} fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="monospace" textAnchor="end">
                  {isFreq ? `${Math.round(val)}` : val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* X Axis Years */}
          {points.map((p, i) => {
            // Label every second year to avoid overlap
            if (i % 2 !== 0 && i !== points.length - 1) return null;
            const x = getX(p.year);
            const y = height - paddingBottom + 14;
            return (
              <text key={p.year} x={x} y={y} fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="monospace" textAnchor="middle">
                {p.year}
              </text>
            );
          })}

          {/* Area under the line */}
          <path d={areaPath} fill={`url(#areaGrad-${color})`} opacity={0.15} />

          {/* Main Line path */}
          <path d={path} fill="none" stroke={color} strokeWidth={2.5} />

          {/* Data Points */}
          {points.map((p) => {
            const x = getX(p.year);
            const y = getY(p.val);
            const isBase = p.year === BASE_YEAR;
            return (
              <g key={p.year} className="group/dot cursor-pointer">
                <circle cx={x} cy={y} r={isBase ? 5 : 4} fill={isBase ? "#ffffff" : color} stroke="#070707" strokeWidth={1.5} />
                {/* Simple SVG Tooltip */}
                <title>{p.year}: {isFreq ? `${Math.round(p.val).toLocaleString()} ppm` : p.val.toFixed(4)}</title>
              </g>
            );
          })}

          <defs>
            <linearGradient id={`areaGrad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  };

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#070707] pt-20 pb-16 px-4 sm:px-6 lg:px-10">
      {/* background atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[720px] h-[450px] rounded-full blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,108,255,0.08) 0%, rgba(93,213,232,0.03) 45%, transparent 70%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        {/* Sidebar Selector */}
        <div className="flex flex-col gap-4 lg:h-[calc(100vh-160px)]">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted font-mono block">
              Search Drifting Lexicon
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 focus:border-accent rounded px-3 py-2 text-sm font-mono text-foreground outline-none transition-colors"
              placeholder="Filter by word…"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-white/10 rounded-xl bg-black/40 backdrop-blur-md p-2 max-h-[300px] lg:max-h-none scrollbar-thin">
            {loadingGallery ? (
              <div className="h-full flex items-center justify-center text-muted font-mono text-xs italic">
                Loading index…
              </div>
            ) : filteredGallery.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted font-mono text-xs italic">
                No words match query.
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredGallery.map((item) => {
                  const isSelected = item.w === selectedWord;
                  return (
                    <div
                      key={item.w}
                      onClick={() => handleWordSelect(item.w)}
                      className={`flex justify-between items-center px-3 py-1.5 rounded cursor-pointer transition-colors ${
                        isSelected 
                          ? "bg-accent/10 border-l-2 border-accent text-accent font-bold" 
                          : "hover:bg-white/[0.03] text-foreground/75"
                      }`}
                    >
                      <span className="font-mono text-xs uppercase tracking-wide">{item.w}</span>
                      <span className="text-[10px] font-mono text-muted tabular-nums">
                        d={item.d.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main Dashboard */}
        <div className="space-y-8">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 text-sm font-mono text-red-400">
              {error}
            </div>
          )}

          {loadingShard && !activeShard ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-accent-2 animate-pulse" style={{ animationDelay: "200ms" }} />
                <span className="w-2 h-2 rounded-full bg-accent-3 animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-muted font-mono text-xs uppercase tracking-widest">
                Analyzing word trajectory…
              </span>
            </div>
          ) : activeShard ? (
            <div className="space-y-8">
              {/* Header Info */}
              <div className="flex flex-col md:flex-row md:items-baseline md:justify-between border-b border-white/10 pb-4 gap-2">
                <div className="flex items-baseline gap-4">
                  <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-foreground leading-none">
                    {activeShard.w}
                  </h1>
                  <span className="text-xs uppercase tracking-wider text-muted font-mono">
                    Year-by-Year Drift Analyzer
                  </span>
                </div>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted font-mono block">Total Drift</span>
                    <span className="font-mono text-lg text-accent-3 font-bold">{activeShard.td.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted font-mono block">Base Anchor</span>
                    <span className="font-mono text-lg text-foreground font-bold">{BASE_YEAR}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted font-mono block">Max Frequency</span>
                    <span className="font-mono text-lg text-accent font-bold">
                      {Math.max(...activeShard.f).toLocaleString()} <span className="text-[10px] text-muted font-normal">ppm</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Trajectory Charts */}
              {chartData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {renderLineChart(chartData.driftPoints, "#ff5da2", "Semantic Distance from 2018")}
                  {renderLineChart(chartData.freqPoints, "#5dd5e8", "Occurrence Frequency (ppm)", true)}
                </div>
              )}

              {/* Neighbors Timeline */}
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-lg tracking-wide text-foreground">
                    Semantic Neighborhood Evolution
                  </h2>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    The closest word neighbors in the embedding space for each year. Click on any neighbor to inspect its drift.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {activeShard.y.map((year, yIdx) => {
                    const yearNeighbors = activeShard.n[yIdx];
                    return (
                      <div key={year} className="rounded-xl border border-white/5 bg-white/[0.01] p-3 space-y-2.5">
                        <div className="flex justify-between items-baseline border-b border-white/5 pb-1">
                          <span className={`font-mono text-xs font-bold ${year === BASE_YEAR ? "text-white underline" : "text-muted"}`}>
                            {year}
                          </span>
                          {year === BASE_YEAR && (
                            <span className="text-[8px] bg-white/10 text-white font-mono px-1 rounded">
                              REF
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1.5">
                          {yearNeighbors.slice(0, 5).map(([neighbor, score]) => (
                            <li key={neighbor} className="flex justify-between text-[11px] font-mono group/item">
                              <span 
                                onClick={() => handleWordSelect(neighbor)}
                                className="text-foreground/75 hover:text-accent cursor-pointer truncate mr-1 select-all hover:underline"
                                title={`Explore '${neighbor}'`}
                              >
                                {neighbor}
                              </span>
                              <span className="text-foreground/35 tabular-nums text-[9px] pt-0.5">
                                {score.toFixed(2)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center text-muted font-mono text-xs italic">
              Select a word from the sidebar directory to run analysis.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DriftExplorerPage() {
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
      <DriftExplorerInner />
    </Suspense>
  );
}
