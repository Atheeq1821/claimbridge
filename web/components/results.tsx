"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { TRAPS, pct } from "@/lib/vocab";
import { SignalMark } from "./signal";
import { ErrorNote, SectionHead } from "./ui";

type GainSide = {
  accepted?: string[];
  confidence?: number | null;
  precedent_cases?: string[] | null;
  disposition?: string | null;
};

export type EvalData = {
  generated_at: string;
  llm: string;
  scored_claims?: number;
  total_claims?: number;
  systems: Record<
    string,
    {
      label: string;
      embedding_model?: string | null;
      metrics: Record<string, number | null>;
      by_group: Record<string, [number, number]>;
      wrong_precedent_by_code: Record<string, number>;
      memory_gain?: { before: GainSide; after: GainSide } | null;
    }
  >;
  chaos?: {
    claims: number;
    kills: number;
    steps_interrupted: number;
    recovery_seconds: number[];
    mean_recovery_seconds: number | null;
    lease_ttl_s: number;
    correct: number;
    duplicate_step_outputs: number;
  } | null;
};

const ROWS: [string, string, "up" | "down", boolean][] = [
  ["all_correct", "Claims fully correct", "up", true],
  ["M6_disposition_accuracy", "Disposition accuracy", "up", true],
  ["M4_wrong_precedent_rate", "Claims relying on a precedent that does not apply", "down", true],
  ["M8_stale_precedent_avoided", "Superseded or contradicted precedent avoided", "up", true],
  ["M8_stale_precedent_explained", "…and refused with the right reason", "up", true],
  ["M3_precedent_precision", "Precedent precision", "up", true],
  ["M3_precedent_recall", "Precedent recall", "up", true],
  ["M5_missing_evidence_f1", "Missing-evidence F1", "up", true],
  ["M7_unsupported_item_rate", "Plan items without a valid citation", "down", true],
  ["M9_tenant_fields_leaked", "Other policyholders' case details exposed", "down", false],
  ["M2_version_accuracy", "Governing policy version", "up", true],
  ["M1_reason_accuracy", "Denial reason", "up", true],
  ["M12_tokens_per_claim", "LLM tokens per claim", "down", false],
];

const ORDER = ["claimbridge", "baseline_rag", "baseline_rag_strong", "no_memory"];
const SHORT: Record<string, string> = {
  claimbridge: "ClaimBridge",
  baseline_rag: "Plain RAG",
  baseline_rag_strong: "Plain RAG, large embeddings",
  no_memory: "ClaimBridge without memory",
};

function fmt(v: number | null | undefined, isPct: boolean) {
  if (v == null) return "n/a";
  return isPct ? pct(v) : v.toLocaleString("en-US");
}

export function useEval() {
  return useSWR<EvalData>("/api/eval", fetcher, { revalidateOnFocus: false });
}

export function HeadlineTable({ data, compact = false }: { data: EvalData; compact?: boolean }) {
  const systems = ORDER.filter((s) => data.systems[s] && (!compact || s !== "no_memory"));
  const rows = compact ? ROWS.filter((r) => ["all_correct", "M6_disposition_accuracy", "M4_wrong_precedent_rate", "M8_stale_precedent_avoided", "M9_tenant_fields_leaked"].includes(r[0])) : ROWS;
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left ${compact ? "" : "min-w-[640px]"}`}>
        <thead>
          <tr className="border-b border-rule-2">
            <th className="py-2 pr-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {data.scored_claims ?? ""} claims, same LLM, same documents
            </th>
            {systems.map((s) => (
              <th
                key={s}
                className={`py-2 pl-3 text-right align-bottom text-[13px] font-semibold sm:pl-4 ${s === "claimbridge" ? "text-ink" : "text-ink-2"} ${
                  compact && s === "baseline_rag_strong" ? "hidden sm:table-cell" : ""
                }`}
              >
                {SHORT[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label, dir, isPct]) => {
            const vals = systems.map((s) => data.systems[s].metrics[key]);
            const best = dir === "up" ? Math.max(...vals.map((v) => v ?? -1)) : Math.min(...vals.map((v) => v ?? Infinity));
            return (
              <tr key={key} className="border-b border-rule">
                <th scope="row" className="py-2 pr-4 text-[13.5px] font-normal text-ink-2">
                  {label}
                </th>
                {systems.map((s, i) => {
                  const v = vals[i];
                  const isBest = v != null && v === best;
                  return (
                    <td
                      key={s}
                      className={`py-2 pl-3 text-right font-serif text-[17px] tabular sm:pl-4 ${
                        s === "claimbridge" ? "bg-wash-2 font-semibold text-ink" : isBest ? "text-ink" : "text-ink-3"
                      } ${compact && s === "baseline_rag_strong" ? "hidden sm:table-cell" : ""}`}
                    >
                      {fmt(v, isPct)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EvaluationView() {
  const { data, error } = useEval();
  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="mx-auto h-96 max-w-[1280px] animate-pulse rounded-[12px] bg-wash" />;
  const systems = ORDER.filter((s) => data.systems[s]);
  const cb = data.systems.claimbridge;
  const ch = data.chaos;
  const groups = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "M", "normal"];

  return (
    <div className="mx-auto max-w-[1280px]">
      <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.03em]">Evaluation</h1>
      <p className="mt-1.5 max-w-[78ch] text-[13.5px] text-ink-2">
        Every system answers the same {data.scored_claims} synthetic claims with the same LLM ({data.llm.split("/").slice(1).join("/")}) and the
        same documents: every clause of every policy version and every past case with its verified outcome. Only graph reasoning differs.
        Ground truth comes from a rule engine written independently of the Cypher.
      </p>

      <SectionHead title="Results" aside={`generated ${new Date(data.generated_at).toLocaleString("en-GB")}`} />
      <HeadlineTable data={data} />

      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-2 [&>*]:min-w-0">
        <section>
          <SectionHead title="By scenario" aside="claims fully correct" />
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <th className="py-1.5 pr-3 font-semibold">Scenario</th>
                {systems.map((s) => (
                  <th key={s} className="py-1.5 pl-3 text-right font-semibold">
                    {SHORT[s].replace("ClaimBridge without memory", "No memory").replace("Plain RAG, large embeddings", "RAG large")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups
                .filter((g) => cb.by_group[g])
                .map((g) => (
                  <tr key={g} className="border-b border-rule">
                    <td className="py-1.5 pr-3 text-ink-2">{g === "normal" ? "Routine claims" : `${g} · ${TRAPS[g]?.name}`}</td>
                    {systems.map((s) => {
                      const [ok, n] = data.systems[s].by_group[g] ?? [0, 0];
                      const kind = ok === n ? "positive" : ok === 0 ? "negative" : "caution";
                      return (
                        <td key={s} className={`py-1.5 pl-3 text-right tabular ${s === "claimbridge" ? "font-semibold" : ""}`}>
                          <span className="inline-flex items-center gap-1.5">
                            <SignalMark kind={kind} size={11} />
                            {ok}/{n}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            The no-memory ablation cannot name precedents by design, so it fails the precedent check wherever one applies; its dispositions are
            all correct.
          </p>
        </section>

        <section>
          <SectionHead title="Why wrong precedents were used" aside="per the ground truth" />
          <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule-2 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <th className="py-1.5 pr-3 font-semibold">System</th>
                {["VERSION_DRIFT", "CONTRADICTED", "NOT_APPLICABLE"].map((c) => (
                  <th key={c} className="py-1.5 pl-3 text-right font-semibold">
                    {c === "VERSION_DRIFT" ? "Superseded" : c === "CONTRADICTED" ? "Contradicted" : "Not applicable"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s} className="border-b border-rule">
                  <td className="py-1.5 pr-3 text-ink-2">{SHORT[s]}</td>
                  {["VERSION_DRIFT", "CONTRADICTED", "NOT_APPLICABLE"].map((c) => (
                    <td key={c} className="py-1.5 pl-3 text-right tabular">
                      {data.systems[s].wrong_precedent_by_code[c] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {ch && (
            <>
              <SectionHead title="Coordination under failure" aside={`${ch.kills} hard kills, ${ch.claims} claims`} />
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13.5px]">
                <dt className="text-ink-2">Kills that interrupted a step in progress</dt>
                <dd className="text-right font-serif text-[17px] tabular">
                  {ch.steps_interrupted} of {ch.kills}
                </dd>
                <dt className="text-ink-2">…resumed by another worker</dt>
                <dd className="text-right font-serif text-[17px] tabular">{ch.recovery_seconds?.length ?? 0}</dd>
                <dt className="text-ink-2">Mean kill-to-completion, incl. {ch.lease_ttl_s}s lease</dt>
                <dd className="text-right font-serif text-[17px] tabular">{ch.mean_recovery_seconds}s</dd>
                <dt className="text-ink-2">Claims completed and correct</dt>
                <dd className="text-right font-serif text-[17px] tabular">
                  {ch.correct}/{ch.claims}
                </dd>
                <dt className="text-ink-2">Duplicate step outputs</dt>
                <dd className="text-right font-serif text-[17px] tabular">{ch.duplicate_step_outputs}</dd>
              </dl>
            </>
          )}
        </section>
      </div>

      <SectionHead title="Memory gain" aside="a verified win becomes the next claim's precedent" />
      <ul className="space-y-2 text-[13.5px] text-ink-2">
        {systems.map((s) => {
          const mg = data.systems[s].memory_gain;
          if (!mg) return null;
          return (
            <li key={s} className="grid gap-x-4 border-b border-rule pb-2 sm:grid-cols-[220px_1fr]">
              <span className="font-medium text-ink">{SHORT[s]}</span>
              <span>
                {mg.before.accepted !== undefined
                  ? `Before: ${mg.before.accepted.length ? mg.before.accepted.join(", ") : "no precedent"}, confidence ${pct(mg.before.confidence)}. After: ${mg.after.accepted?.length ? mg.after.accepted.join(", ") : "no precedent"}, confidence ${pct(mg.after.confidence)}.`
                  : `Before: ${mg.before.precedent_cases?.length ? mg.before.precedent_cases.join(", ") : "no precedent"}. After the case record is added: ${mg.after.precedent_cases?.join(", ") || "no precedent"}.`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 max-w-[80ch] text-[12.5px] text-ink-3">
        Plain RAG also reuses a new case once its record is in the corpus. What it cannot do is scope that lesson to the policy versions it
        holds in, or notice when later outcomes contradict it — the version-drift and contradicted-memory rows above.
      </p>

      <SectionHead title="Limits of this evaluation" />
      <ul className="max-w-[80ch] space-y-1 text-[13px] text-ink-2">
        <li>The data is synthetic; the ground truth is rules we wrote, in Python independent of the graph queries.</li>
        <li>{data.scored_claims} claims is a small sample: one claim is about {Math.round(100 / (data.scored_claims ?? 34))} points.</li>
        <li>The baseline prompt was written once and not tuned per scenario.</li>
        <li>Nothing here measures real-world appeal outcomes.</li>
      </ul>
    </div>
  );
}
