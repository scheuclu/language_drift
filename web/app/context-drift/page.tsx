"use client";

import { Suspense, useEffect, useMemo, useState, useRef } from "react";
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

type Preset = {
  word: string;
  category: string;
  phenomenon: string;
  contextA: string;
  contextB: string;
  similarity: number;
};

const DEFAULT_WORD = "bank";
const DEFAULT_CONTEXT_A = "He went to the bank to cash a check.";
const DEFAULT_CONTEXT_B = "They sat on the grassy bank of the river.";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", 
  "at", "by", "for", "from", "in", "into", "of", "off", "on", "onto", 
  "out", "over", "to", "up", "with", "is", "was", "were", "be", "been", 
  "am", "are", "have", "has", "had", "do", "does", "did", "he", "she", 
  "it", "they", "we", "you", "i", "his", "her", "their", "our", "your", 
  "my", "this", "that", "these", "those", "there", "here"
]);

const PRESETS: Preset[] = [
  {
    word: "crane",
    category: "machine vs. bird",
    phenomenon: "Homograph",
    contextA: "The heavy steel crane lifted the shipping container onto the cargo ship.",
    contextB: "A tall white crane stood gracefully in the shallow water of the marsh.",
    similarity: 0.4215
  },
  {
    word: "date",
    category: "romance vs. fruit",
    phenomenon: "Homonymy",
    contextA: "We need to schedule a romantic date for next Friday evening.",
    contextB: "She ordered a sweet date and a cup of mint tea after dinner.",
    similarity: 0.3548
  },
  {
    word: "apple",
    category: "fruit vs. tech brand",
    phenomenon: "Capitalization/Brand",
    contextA: "He sliced a fresh green apple to eat with peanut butter.",
    contextB: "Apple announced a new operating system at their conference.",
    similarity: 0.5182
  },
  {
    word: "python",
    category: "software vs. reptile",
    phenomenon: "Metaphor/Jargon",
    contextA: "I wrote a script in Python to automate my data analysis pipeline.",
    contextB: "A large reticulated python wrapped itself around the tree branch.",
    similarity: 0.4491
  },
  {
    word: "run",
    category: "cardio vs. execution",
    phenomenon: "Noun vs. Verb",
    contextA: "She went for a quick five mile run in the morning.",
    contextB: "The server will run the database backup script at midnight.",
    similarity: 0.6359
  },
  {
    word: "light",
    category: "weight vs. luminance",
    phenomenon: "Polysemy",
    contextA: "The sun emits bright light that warms our entire planet.",
    contextB: "The suitcase was surprisingly light and easy to carry.",
    similarity: 0.4812
  }
];

// Helper to align tokens to space-split words
function getWordIds(words: string[], tokens: string[]): number[] {
  const wordIds: number[] = [];
  let wordIdx = 0;
  let currentWordAccumulator = "";
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "[CLS]" || token === "[SEP]" || token === "<s>" || token === "</s>" || token.startsWith("[")) {
      wordIds.push(-1);
      continue;
    }
    
    wordIds.push(wordIdx);
    
    const cleanToken = token.replace(/^##/, '').replace(/[^\w]/g, '').toLowerCase();
    currentWordAccumulator += cleanToken;
    
    const targetCleanWord = words[wordIdx].replace(/[^\w]/g, '').toLowerCase();
    if (currentWordAccumulator.length >= targetCleanWord.length || targetCleanWord === "") {
      wordIdx = Math.min(wordIdx + 1, words.length - 1);
      currentWordAccumulator = "";
    }
  }
  return wordIds;
}

// Cosine similarity
function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// Self-contained Dual PCA implementation for small N vectors
function computePCA(vectors: number[][]): { x: number; y: number }[] {
  const N = vectors.length;
  if (N === 0) return [];
  const D = vectors[0].length;

  // 1. Center the vectors
  const mean = new Array(D).fill(0);
  for (let j = 0; j < D; j++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += vectors[i][j];
    }
    mean[j] = sum / N;
  }

  const centered = vectors.map(v => v.map((val, j) => val - mean[j]));

  // 2. Compute N x N matrix M = X * X^T
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      let dot = 0;
      for (let j = 0; j < D; j++) {
        dot += centered[i][j] * centered[k][j];
      }
      M[i][k] = dot;
    }
  }

  const norm = (v: number[]) => Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));

  // 3. Power iteration for 1st eigenvector
  let v1 = new Array(N).fill(0).map(() => Math.random() - 0.5);
  const n1 = norm(v1);
  v1 = v1.map(val => val / (n1 || 1));

  for (let iter = 0; iter < 100; iter++) {
    const w = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = 0; k < N; k++) {
        sum += M[i][k] * v1[k];
      }
      w[i] = sum;
    }
    const nw = norm(w);
    v1 = w.map(val => val / (nw || 1));
  }

  // Compute eigenvalue lambda1 = v1^T * M * v1
  let lambda1 = 0;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      sum += M[i][k] * v1[k];
    }
    lambda1 += v1[i] * sum;
  }

  // 4. Deflate M: M_def = M - lambda1 * v1 * v1^T
  const M_def: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      M_def[i][k] = M[i][k] - lambda1 * v1[i] * v1[k];
    }
  }

  // 5. Power iteration for 2nd eigenvector
  let v2 = new Array(N).fill(0).map(() => Math.random() - 0.5);
  // Orthogonalize against v1
  const dot_v1_v2 = v1.reduce((sum, val, idx) => sum + val * v2[idx], 0);
  v2 = v2.map((val, idx) => val - dot_v1_v2 * v1[idx]);
  const n2 = norm(v2);
  v2 = v2.map(val => val / (n2 || 1));

  for (let iter = 0; iter < 100; iter++) {
    const w = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = 0; k < N; k++) {
        sum += M_def[i][k] * v2[k];
      }
      w[i] = sum;
    }
    const dot_w_v1 = v1.reduce((sum, val, idx) => sum + val * w[idx], 0);
    const w_orth = w.map((val, idx) => val - dot_w_v1 * v1[idx]);
    const nw = norm(w_orth);
    v2 = w_orth.map(val => val / (nw || 1));
  }

  // Compute eigenvalue lambda2 = v2^T * M_def * v2
  let lambda2 = 0;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = 0; k < N; k++) {
      sum += M_def[i][k] * v2[k];
    }
    lambda2 += v2[i] * sum;
  }

  const scale1 = Math.sqrt(Math.max(0, lambda1));
  const scale2 = Math.sqrt(Math.max(0, lambda2));

  return Array.from({ length: N }, (_, i) => ({
    x: scale1 * v1[i],
    y: scale2 * v2[i]
  }));
}

function ContextDriftInner() {
  const searchParams = useSearchParams();
  const queryWord = searchParams.get("w") || DEFAULT_WORD;

  const [word, setWord] = useState(queryWord);
  const [contextA, setContextA] = useState(DEFAULT_CONTEXT_A);
  const [contextB, setContextB] = useState(DEFAULT_CONTEXT_B);

  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DriftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenizerRef = useRef<any>(null);

  // Dynamic initialization of ONNX transformers pipeline on browser client
  useEffect(() => {
    async function loadModel() {
      try {
        const { AutoModel, AutoTokenizer, env } = await import("@huggingface/transformers");
        env.allowLocalModels = false;

        const tokenizer = await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2");
        const model = await AutoModel.from_pretrained("Xenova/all-MiniLM-L6-v2", {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progress_callback: (data: any) => {
            if (data.status === "progress") {
              setModelProgress(Math.round(data.progress));
            }
          }
        });

        modelRef.current = model;
        tokenizerRef.current = tokenizer;
        setModelReady(true);
      } catch (err) {
        console.error(err);
        setError("Could not load WebAssembly NLP model: " + (err instanceof Error ? err.message : String(err)));
      }
    }
    loadModel();
  }, []);

  // Re-run if query param word changes
  useEffect(() => {
    const w = searchParams.get("w");
    if (w) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWord(w);
    }
  }, [searchParams]);

  const runClientInference = async (targetWord: string, a: string, b: string) => {
    if (!modelRef.current || !tokenizerRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const model = modelRef.current;
      const tokenizer = tokenizerRef.current;

      const wordsA = a.split(/\s+/);
      const wordsB = b.split(/\s+/);
      const targetClean = targetWord.trim().toLowerCase();

      // Locate target indices
      const findTargetIndex = (words: string[]) => {
        let idx = words.findIndex(w => w.replace(/[^\w]/g, '').toLowerCase() === targetClean);
        if (idx === -1) {
          idx = words.findIndex(w => w.toLowerCase().includes(targetClean));
        }
        return idx;
      };

      const idxA = findTargetIndex(wordsA);
      const idxB = findTargetIndex(wordsB);

      if (idxA === -1) throw new Error(`Word '${targetWord}' not found in Sentence A.`);
      if (idxB === -1) throw new Error(`Word '${targetWord}' not found in Sentence B.`);

      // Extract embeddings function
      const extractEmbeddings = async (sentence: string, words: string[], targetIdx: number) => {
        const inputs = tokenizer(sentence);
        const outputs = await model(inputs);
        const last_hidden_state = outputs.last_hidden_state;
        const dims = last_hidden_state.dims; // [1, seq_len, 384]
        const hidden_dim = dims[2];

        // Map tokens
        const input_ids = Array.from(inputs.input_ids.data as BigInt64Array);
        const tokens = input_ids.map(id => tokenizer.decode([Number(id)]).trim());
        const wordIds = getWordIds(words, tokens);

        // Get target embedding
        const targetTokenIndices = wordIds.map((wId, tIdx) => wId === targetIdx ? tIdx : -1).filter(idx => idx !== -1);
        if (targetTokenIndices.length === 0) {
          throw new Error("Could not map tokens to target word.");
        }

        const targetVec = new Array(hidden_dim).fill(0);
        for (const tIdx of targetTokenIndices) {
          const offset = tIdx * hidden_dim;
          for (let d = 0; d < hidden_dim; d++) {
            targetVec[d] += last_hidden_state.data[offset + d];
          }
        }
        const avgTargetVec = targetVec.map(val => val / targetTokenIndices.length);

        // Get context embeddings
        const contextVecs: { vec: number[]; label: string }[] = [];
        const seenWords = new Set<string>();

        for (let w = 0; w < words.length; w++) {
          const cleanW = words[w].replace(/[^\w]/g, '').toLowerCase();
          if (!cleanW || cleanW === targetClean || STOP_WORDS.has(cleanW) || seenWords.has(cleanW)) {
            continue;
          }
          seenWords.add(cleanW);

          const wordTokenIndices = wordIds.map((wId, tIdx) => wId === w ? tIdx : -1).filter(idx => idx !== -1);
          if (wordTokenIndices.length > 0) {
            const vec = new Array(hidden_dim).fill(0);
            for (const tIdx of wordTokenIndices) {
              const offset = tIdx * hidden_dim;
              for (let d = 0; d < hidden_dim; d++) {
                vec[d] += last_hidden_state.data[offset + d];
              }
            }
            contextVecs.push({
              vec: vec.map(val => val / wordTokenIndices.length),
              label: cleanW
            });
          }
        }

        return {
          target: avgTargetVec,
          context: contextVecs
        };
      };

      // Perform forward passes
      const dataA = await extractEmbeddings(a, wordsA, idxA);
      const dataB = await extractEmbeddings(b, wordsB, idxB);

      // Similarity
      const sim = cosineSimilarity(dataA.target, dataB.target);
      const dist = 1.0 - sim;

      // Group vectors for PCA
      // Index 0: target A, Index 1: target B
      const pcaVectors: number[][] = [dataA.target, dataB.target];
      const labels: string[] = [`${targetWord} (A)`, `${targetWord} (B)`];
      const sources: ("target_a" | "target_b" | "context_a" | "context_b")[] = ["target_a", "target_b"];

      // Context vectors Context A
      for (const item of dataA.context) {
        pcaVectors.push(item.vec);
        labels.push(item.label);
        sources.push("context_a");
      }

      // Context vectors Context B
      for (const item of dataB.context) {
        pcaVectors.push(item.vec);
        labels.push(item.label);
        sources.push("context_b");
      }

      // Run PCA projection
      const coords = computePCA(pcaVectors);

      const points: Point[] = coords.map((c, i) => ({
        label: labels[i],
        x: c.x,
        y: c.y,
        source: sources[i]
      }));

      setResult({
        similarity: sim,
        distance: dist,
        points
      });

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Calculation failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Run initial query when model is loaded and ready
  useEffect(() => {
    if (modelReady) {
      runClientInference(word, contextA, contextB);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelReady]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runClientInference(word, contextA, contextB);
  };

  const handleSelectPreset = (p: Preset) => {
    setWord(p.word);
    setContextA(p.contextA);
    setContextB(p.contextB);
    runClientInference(p.word, p.contextA, p.contextB);
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

  // Map coordinates to SVG viewPort
  const scaleCoord = (x: number, y: number, bounds: Bounds) => {
    const W = 600;
    const H = 450;
    const padding = 50;

    const scaleX = (W - padding * 2) / (bounds.maxX - bounds.minX);
    const scaleY = (H - padding * 2) / (bounds.maxY - bounds.minY);

    const scaledX = padding + (x - bounds.minX) * scaleX;
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

      <div className="relative max-w-5xl mx-auto space-y-12">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-accent font-mono mb-2">
            contextual embeddings
          </div>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl leading-tight sm:leading-none mb-3">
            Type-level Context Drift.
          </h1>
          <p className="text-foreground/60 text-sm sm:text-base max-w-2xl leading-relaxed">
            BERT-family embeddings are contextual. Enter a target word and two sentences below, or select an insight preset from the gallery below to explore how polysemy, homonymy, and syntax shift vectors in high-dimensional space.
          </p>
        </div>

        {!modelReady ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-8 flex flex-col items-center justify-center min-h-[350px]">
            <div className="w-full max-w-md space-y-4">
              <div className="flex justify-between font-mono text-xs text-muted uppercase tracking-wider">
                <span>Downloading ONNX Weights…</span>
                <span>{modelProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${modelProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
              <p className="text-foreground/40 font-mono text-[10px] text-center max-w-sm mx-auto leading-relaxed">
                Loading all-MiniLM-L6-v2 (~23MB) directly into local cache. Subsequent visits will load instantly.
              </p>
            </div>
          </div>
        ) : (
          <>
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
                        Running local ONNX model…
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

            {/* Curated Insights Presets Gallery */}
            <div className="space-y-6 pt-4">
              <div className="border-b border-white/10 pb-2">
                <h2 className="font-display text-lg tracking-wide">
                  Explore Curated Linguistic Insights
                </h2>
                <p className="text-muted text-xs font-mono mt-0.5">
                  Select a preset to load pre-calculated semantic drift metrics and map the vectors immediately.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PRESETS.map((p) => {
                  const drift = 1 - p.similarity;
                  return (
                    <div
                      key={p.word + p.phenomenon}
                      onClick={() => handleSelectPreset(p)}
                      className="group relative rounded-xl border border-white/10 bg-white/[0.01] hover:bg-white/[0.04] p-4 transition-all duration-300 cursor-pointer flex flex-col justify-between hover:border-accent/40"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                          <span className="font-mono text-sm font-bold text-foreground group-hover:text-accent transition-colors uppercase tracking-wider">
                            {p.word}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider bg-white/[0.06] text-muted px-2 py-0.5 rounded-full font-mono">
                            {p.phenomenon}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted uppercase font-mono tracking-wide">
                          {p.category}
                        </div>
                        <div className="text-xs text-foreground/50 space-y-1 pt-1 leading-relaxed">
                          <p className="line-clamp-1"><span className="text-[9px] text-[#5dd5e8] font-bold font-mono">A:</span> {p.contextA}</p>
                          <p className="line-clamp-1"><span className="text-[9px] text-[#ff5da2] font-bold font-mono">B:</span> {p.contextB}</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                        <div className="flex justify-between text-[10px] font-mono uppercase text-muted">
                          <span>Semantic Drift</span>
                          <span className="font-bold text-accent-3">{drift.toFixed(3)}</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${drift * 100}%`,
                              background: "linear-gradient(to right, #5dd5e8, #ff5da2)"
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
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
