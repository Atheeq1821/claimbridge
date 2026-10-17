"use client";

import { useMemo } from "react";
import type { GraphEdge, GraphNode } from "@/lib/api";
import { TREATMENT } from "@/lib/vocab";

// The evidence subgraph behind one recommendation, laid out in reading order:
// claim → the policy it is governed by → precedents considered → why they stand or fall.

const COL_X = [0, 230, 470, 720];
const NODE_W = 196;
const NODE_H = 46;
const GAP = 12;

const STROKE: Record<string, string> = {
  negative: "var(--neg)",
  caution: "var(--caution)",
  positive: "var(--pos)",
  neutral: "var(--rule-2)",
};

function columnOf(n: GraphNode): number {
  if (n.kind === "claim") return 0;
  if (n.kind === "version" || n.kind === "evidence") return 1;
  if (n.kind === "clause") return n.sub && n.sub.startsWith("C-") ? 1 : 3;
  if (n.kind === "finding") return 2;
  return 3;
}

const SIGNAL_ORDER = { positive: 0, negative: 1, caution: 2, neutral: 3 } as const;

function SignalGlyph({ kind, x, y }: { kind: string; x: number; y: number }) {
  const f = STROKE[kind];
  const t = `translate(${x} ${y}) scale(0.875)`;
  if (kind === "negative")
    return (
      <g transform={t}>
        <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2z" fill={f} />
        <path d="M4.6 7h6.8v2H4.6z" fill="#fff" />
      </g>
    );
  if (kind === "caution")
    return (
      <g transform={t}>
        <path d="M8 1.2 15.2 14H.8z" fill={f} />
        <path d="M7.1 5.4h1.8l-.3 4.6H7.4zM7.1 11.2h1.8V13H7.1z" fill="#fff" />
      </g>
    );
  if (kind === "positive")
    return (
      <g transform={t}>
        <path d="M8 .9 15.1 8 8 15.1.9 8z" fill={f} />
        <path d="M7.1 4.6h1.8v2.5h2.5v1.8H8.9v2.5H7.1V8.9H4.6V7.1h2.5z" fill="#fff" />
      </g>
    );
  return (
    <g transform={t}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke={f} strokeWidth="2.2" />
      <circle cx="8" cy="8" r="1.6" fill={f} />
    </g>
  );
}

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function EvidenceGraph({
  nodes,
  edges,
  highlight,
  onHover,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlight: string | null;
  onHover?: (id: string | null) => void;
}) {
  const layout = useMemo(() => {
    const cols: GraphNode[][] = [[], [], [], []];
    nodes.forEach((n) => cols[columnOf(n)].push(n));
    cols[2].sort(
      (a, b) =>
        SIGNAL_ORDER[(TREATMENT[a.code ?? ""]?.signal ?? "neutral") as keyof typeof SIGNAL_ORDER] -
          SIGNAL_ORDER[(TREATMENT[b.code ?? ""]?.signal ?? "neutral") as keyof typeof SIGNAL_ORDER] ||
        a.id.localeCompare(b.id),
    );
    // Column 1: version, cited clause, then evidence requirements.
    const rank1 = (n: GraphNode) => (n.kind === "version" ? 0 : n.kind === "clause" ? 1 : 2);
    cols[1].sort((a, b) => rank1(a) - rank1(b) || a.label.localeCompare(b.label));
    // Column 3 follows the order of the precedents that point at it.
    const parentY = new Map<string, number>();
    cols[2].forEach((f, i) => edges.filter((e) => e.from === f.id).forEach((e) => !parentY.has(e.to) && parentY.set(e.to, i)));
    cols[3].sort((a, b) => (parentY.get(a.id) ?? 99) - (parentY.get(b.id) ?? 99));

    const pos = new Map<string, { x: number; y: number }>();
    const heights = cols.map((c) => c.length * (NODE_H + GAP));
    const H = Math.max(...heights, NODE_H + GAP);
    cols.forEach((c, ci) => {
      const top = ci === 0 ? (H - NODE_H) / 2 : (H - heights[ci]) / 2;
      c.forEach((n, i) => pos.set(n.id, { x: COL_X[ci], y: top + i * (NODE_H + GAP) }));
    });
    return { pos, H, cols };
  }, [nodes, edges]);

  if (!nodes.length) return null;
  const W = COL_X[3] + NODE_W + 78; // right margin holds the "supersedes" label
  const { pos, H } = layout;
  const related = (id: string) => highlight === id || edges.some((e) => (e.from === highlight && e.to === id) || (e.to === highlight && e.from === id));

  return (
    <figure className="w-full">
      <p className="mb-2 text-[11.5px] text-ink-3 md:hidden">Scroll sideways to follow the graph →</p>
      <div className="w-full overflow-x-auto">
      <svg viewBox={`-2 -24 ${W + 4} ${H + 30}`} className="h-auto w-full min-w-[720px]" role="img" aria-label="Evidence graph for this claim">
        {["Claim", "Policy & evidence", "Precedents considered", "Grounds"].map((t, i) => (
          <text key={t} x={COL_X[i]} y={-10} className="fill-ink-3" style={{ font: "600 10.5px var(--font-sans)", letterSpacing: "0.06em" }}>
            {t.toUpperCase()}
          </text>
        ))}
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const signal = e.code ? TREATMENT[e.code]?.signal ?? "neutral" : e.state === "missing" ? "negative" : "neutral";
          const sameCol = a.x === b.x;
          const x1 = sameCol ? a.x + NODE_W : a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = sameCol ? b.x + NODE_W : b.x;
          const y2 = b.y + NODE_H / 2;
          const d = sameCol
            ? `M${x1} ${y1} C${x1 + 26} ${y1}, ${x2 + 26} ${y2}, ${x2} ${y2}`
            : `M${x1} ${y1} C${x1 + 36} ${y1}, ${x2 - 36} ${y2}, ${x2} ${y2}`;
          const dim = highlight && !(related(e.from) && related(e.to)) && e.from !== highlight && e.to !== highlight;
          return (
            <g key={i} opacity={dim ? 0.25 : 1}>
              <path
                d={d}
                fill="none"
                stroke={STROKE[signal]}
                strokeWidth={signal === "neutral" ? 1 : 1.5}
                strokeDasharray={e.state === "missing" ? "4 3" : undefined}
              />
              {/* Only the within-column "supersedes" link is labelled, in the clear margin to the right.
                  Every other edge reads from its colour and from the caption on the node it reaches. */}
              {sameCol && e.label === "supersedes" && (
                <text
                  x={x1 + 30}
                  y={(y1 + y2) / 2 + 3}
                  style={{ font: "600 10px var(--font-sans)" }}
                  fill={STROKE[signal] === "var(--rule-2)" ? "var(--ink-3)" : STROKE[signal]}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const signal = n.kind === "finding" ? TREATMENT[n.code ?? ""]?.signal ?? "neutral" : null;
          const hot = highlight === n.id;
          const dim = highlight && !related(n.id);
          const fill =
            n.kind === "claim" ? "var(--ink)" : hot ? "#e3ecf9" : n.kind === "evidence" && !n.satisfied ? "var(--neg-wash)" : "#fff";
          const textFill = n.kind === "claim" ? "#fff" : "var(--ink)";
          return (
            <g
              key={n.id}
              transform={`translate(${p.x} ${p.y})`}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => onHover?.(n.id)}
              onMouseLeave={() => onHover?.(null)}
              style={{ cursor: onHover ? "default" : undefined }}
            >
              <title>{`${n.id}${n.sub ? ` — ${n.sub}` : ""}`}</title>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={2}
                fill={fill}
                stroke={hot ? "var(--link)" : signal ? STROKE[signal] : n.kind === "claim" ? "var(--ink)" : "var(--rule-2)"}
                strokeWidth={hot || signal ? 1.5 : 1}
              />
              {signal && <SignalGlyph kind={signal} x={9} y={8} />}
              <text
                x={signal ? 30 : 10}
                y={19}
                fill={textFill}
                style={{
                  font: n.kind === "finding" || n.kind === "resolution" || (n.kind === "clause" && n.sub !== n.label)
                    ? "600 11.5px var(--font-mono)"
                    : "600 12px var(--font-sans)",
                }}
              >
                {trim(n.label, signal ? 22 : 26)}
              </text>
              <text x={signal ? 30 : 10} y={35} style={{ font: "400 10.5px var(--font-sans)" }} fill={n.kind === "claim" ? "#c9d1e2" : "var(--ink-3)"}>
                {n.kind === "finding"
                  ? TREATMENT[n.code ?? ""]?.label ?? n.code
                  : n.kind === "evidence"
                    ? n.satisfied
                      ? "On file"
                      : "Missing"
                    : n.kind === "resolution"
                      ? "Verified outcome: upheld"
                      : trim(n.sub ?? "", 30)}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-5 bg-pos" aria-hidden />followed</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-5 bg-caution" aria-hidden />distinguished</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-5 bg-neg" aria-hidden />superseded or contradicted</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-neg" aria-hidden />evidence missing</span>
        <span>Hover a node to trace its links.</span>
      </figcaption>
    </figure>
  );
}
