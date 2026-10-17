"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { post, type ClaimDetail, type GraphEdge, type GraphNode, type Verdict } from "@/lib/api";
import { DISPOSITION, STATUS_LABEL, TRAPS, TREATMENT, ago, fmtDate, humanEvent, pct } from "@/lib/vocab";
import { EvidenceGraph } from "./evidence-graph";
import { SignalMark, Treatment } from "./signal";
import { Button, Cite, ErrorNote, Mono, SectionHead } from "./ui";

const KIND_LABEL: Record<string, string> = {
  EVIDENCE_NEEDED: "Evidence",
  ACTION: "Next step",
  WARNING: "Warning",
  REJECTED_PRECEDENT: "Do not rely",
};

const VERDICT_ORDER = ["ACCEPTED", "VERSION_DRIFT", "CONTRADICTED", "CONDITION_UNMET", "LINEAGE_MISMATCH", "CANDIDATE", "REASON_MISMATCH"];

const yearOf = (clauseId?: string | null) => clauseId?.match(/C-(\d{4})-/)?.[1] ?? "";

// The Planner states uncertainty with node IDs; show it in citation words, IDs second.
function uncertaintyLine(u: string, verdicts: Verdict[]): { text: string; ids?: string } {
  const drift = u.match(/^(F-[\w-]+) was learned under (C-\d{4}-[\w-]+); (C-\d{4}-[\w-]+) governs this claim\.$/);
  if (drift) {
    const v = verdicts.find((x) => x.finding_id === drift[1]);
    return {
      text: `${drift[1]}: superseded by §${v?.learned_section ?? ""} (${yearOf(drift[3])}); it was learned under the ${yearOf(drift[2])} clause.`,
      ids: `${drift[2]} → ${drift[3]}`,
    };
  }
  const contra = u.match(/^(F-[\w-]+) was contradicted by later verified cases \((.+)\)\.$/);
  if (contra) {
    const n = contra[2].split(",").length;
    return { text: `${contra[1]}: contradicted by ${n} later verified appeal${n === 1 ? "" : "s"} upheld on the same facts.`, ids: contra[2] };
  }
  return { text: u };
}

// The citation line, in words first: "Superseded by §4.2 (2026)". Node IDs follow in mono.
function groundsLine(v: Verdict): { text: string; ids: string[] } {
  switch (v.code) {
    case "VERSION_DRIFT":
      return {
        text: `Superseded by §${v.learned_section} (${yearOf(v.governing)}). Learned under the ${yearOf(v.learned_on)} clause, which the policy in force has since changed.`,
        ids: [v.learned_on, v.governing ?? ""].filter(Boolean),
      };
    case "CONTRADICTED":
      return {
        text: `Contradicted: ${v.contradicted_by.length} later verified appeal${v.contradicted_by.length === 1 ? " was" : "s were"} upheld on the same facts.`,
        ids: v.contradicted_by,
      };
    case "CONDITION_UNMET":
      return { text: "Distinguished: it won only in emergencies, and this claim was not one.", ids: [] };
    case "LINEAGE_MISMATCH":
      return {
        text: `Distinguished: it concerns §${v.learned_section}, a different clause from the one this denial cites.`,
        ids: [v.learned_on],
      };
    case "ACCEPTED":
      return { text: `Followed: good law under the policy in force (valid in ${v.valid_in.join(", ")}).`, ids: [v.learned_on] };
    default:
      return { text: TREATMENT[v.code]?.why ?? "", ids: [] };
  }
}

function PrecedentRow({ v, hot, onHover }: { v: Verdict; hot: boolean; onHover: (id: string | null) => void }) {
  const t = TREATMENT[v.code] ?? TREATMENT.CANDIDATE;
  const grounds = groundsLine(v);
  return (
    <li
      className={`grid grid-cols-[132px_1fr] gap-x-4 border-b border-rule py-3 transition-colors sm:grid-cols-[150px_1fr_auto] ${hot ? "bg-[#eef3fb]" : ""}`}
      onMouseEnter={() => onHover(v.finding_id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="pt-0.5">
        <Treatment kind={t.signal} label={t.label} />
        <Mono className="mt-1 block text-ink-3">{v.finding_id}</Mono>
      </div>
      <div className="min-w-0">
        <p className="font-serif text-[15px] leading-snug text-ink">{v.statement}</p>
        <p
          className={`mt-1 font-serif text-[14px] ${t.signal === "negative" ? "text-neg" : t.signal === "caution" ? "text-caution-ink" : "text-ink-2"}`}
        >
          {grounds.text}
        </p>
        {grounds.ids.length > 0 && <Mono className="mt-0.5 block text-ink-3">{grounds.ids.join(" → ")}</Mono>}
      </div>
      <div className="col-start-2 mt-1 text-[12px] text-ink-3 sm:col-start-3 sm:mt-0 sm:text-right">
        <div className="tabular">
          {v.support} verified win{v.support === 1 ? "" : "s"}
        </div>
        <div className="tabular">confidence {pct(v.confidence)}</div>
        <div>via {v.source}</div>
      </div>
    </li>
  );
}

function ActionPanel({ d, cid, onDone }: { d: ClaimDetail; cid: string; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const status = d.claim.status as string;
  const owner = d.claim.lease_owner as string | undefined;
  const last = d.timeline[d.timeline.length - 1];

  async function act(name: string, url: string, body: object) {
    setBusy(name);
    setErr(null);
    try {
      await post(url, body);
      onDone();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }

  let body: React.ReactNode;
  if (status === "NEW") {
    body = (
      <>
        <p className="text-[13px] text-ink-2">This claim has not been filed. Filing hands it to the Intake agent.</p>
        <Button variant="primary" className="mt-3 w-full" busy={busy === "file"} onClick={() => act("file", "/api/claims/inject", { ids: [cid] })}>
          File claim
        </Button>
      </>
    );
  } else if (status === "AWAITING_REVIEW") {
    body = (
      <>
        <p className="text-[13px] text-ink-2">The plan below is a recommendation. Approve it to send the appeal; nothing happens without you.</p>
        <Button variant="primary" className="mt-3 w-full" busy={busy === "approve"} onClick={() => act("approve", `/api/claims/${cid}/approve`, {})}>
          Approve recommendation
        </Button>
      </>
    );
  } else if (status === "APPROVED") {
    body = (
      <>
        <p className="text-[13px] text-ink-2">
          When the insurer answers the appeal, record what happened. The Curator turns it into memory for the next claim.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            ["OVERTURNED", "Overturned"],
            ["PARTIAL", "Partial"],
            ["UPHELD", "Upheld"],
          ].map(([o, l]) => (
            <Button
              key={o}
              variant={o === "UPHELD" ? "danger" : o === "OVERTURNED" ? "primary" : "secondary"}
              busy={busy === o}
              onClick={() => act(o, `/api/claims/${cid}/outcome`, { outcome: o })}
            >
              {l}
            </Button>
          ))}
        </div>
      </>
    );
  } else if (status === "CURATED") {
    const p = (last?.payload ?? {}) as { action?: string; outcome?: string; findings?: { finding_id: string; confidence?: number; status?: string }[] };
    body = (
      <p className="text-[13px] text-ink-2">
        Outcome <strong className="text-ink">{p.outcome?.toLowerCase()}</strong>. Memory{" "}
        {p.action === "learned" ? "learned a new precedent" : p.action === "strengthened" ? "strengthened a precedent" : p.action === "contradicted" ? "recorded a contradiction against" : "was unchanged"}
        {p.findings?.length ? (
          <>
            {": "}
            {p.findings.map((f) => (
              <Link key={f.finding_id} href="/console/memory" className="font-mono text-[12px] text-link underline">
                {f.finding_id}
              </Link>
            ))}
          </>
        ) : null}
        .
      </p>
    );
  } else if (status === "NEEDS_HUMAN") {
    body = <p className="text-[13px] text-neg">The agents could not finish this claim on their own. A caseworker needs to look at it.</p>;
  } else {
    body = (
      <p className="text-[13px] text-ink-2">
        {owner ? (
          <>
            <span className="font-medium text-link">{owner}</span> is working on it now.
          </>
        ) : (
          <>Waiting for the next free agent.</>
        )}{" "}
        This page updates as each agent commits to the graph.
      </p>
    );
  }

  return (
    <section className="border border-ink p-4">
      <h2 className="flex items-center justify-between font-serif text-[16px] font-semibold">
        <span>{STATUS_LABEL[status] ?? status}</span>
        {d.recommendation?.approved_by && <span className="font-sans text-[11.5px] font-normal text-ink-3">approved by {d.recommendation.approved_by}</span>}
      </h2>
      <div className="mt-2">{body}</div>
      <ErrorNote error={err} />
    </section>
  );
}

function AgentRecord({ d }: { d: ClaimDetail }) {
  return (
    <ol className="relative">
      {d.timeline.map((e) => {
        const alarm = e.type === "RESUMED" || e.type === "LEASE_EXPIRED" || e.type === "FENCED_WRITE_REJECTED";
        const extra =
          e.type === "RESUMED"
            ? `after ${(e.payload.previous_owner as string) ?? "a failed worker"}`
            : e.type === "INTAKE_DONE"
              ? `${e.payload.reason ?? ""} · ${e.payload.method === "llm" ? "read by LLM" : e.payload.method === "cited_section" ? "from cited section" : "by similarity"}`
              : e.type === "PLANNER_DONE"
                ? `${(e.payload.items as number) ?? ""} items`
                : e.type === "OUTCOME_RECORDED"
                  ? String(e.payload.outcome ?? "").toLowerCase()
                  : "";
        return (
          <li key={e.seq} className="grid grid-cols-[14px_1fr] gap-x-2.5 pb-2.5">
            <span className={`mt-[7px] size-[7px] rounded-full ${alarm ? "bg-caution" : e.type.endsWith("_DONE") ? "bg-ink" : "bg-rule-2"}`} aria-hidden />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[12.5px] ${alarm ? "font-semibold text-caution-ink" : "text-ink"}`}>{humanEvent(e.type)}</span>
                <span className="shrink-0 text-[11px] text-ink-3 tabular">{ago(e.ts)}</span>
              </div>
              <div className="truncate text-[11.5px] text-ink-3">
                <Mono>{e.agent}</Mono>
                {extra ? ` · ${extra}` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CaseView() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, mutate } = useSWR<ClaimDetail>(`/api/claims/${id}`, { refreshInterval: 5000 });
  const { data: g, mutate: mutateGraph } = useSWR<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/api/claims/${id}/graph`);
  const [hot, setHot] = useState<string | null>(null);
  const [showIrrelevant, setShowIrrelevant] = useState(false);

  if (error)
    return (
      <div className="mx-auto max-w-[1280px]">
        <ErrorNote error={error} />
      </div>
    );
  if (!d)
    return (
      <div className="mx-auto max-w-[1280px] space-y-3">
        <div className="h-5 w-40 animate-pulse bg-wash" />
        <div className="h-9 w-2/3 animate-pulse bg-wash" />
        <div className="h-64 animate-pulse bg-wash" />
      </div>
    );

  const c = d.claim;
  const rec = d.recommendation;
  const disp = rec ? DISPOSITION[rec.disposition] : null;
  const verdicts = [...d.verdicts].sort((a, b) => VERDICT_ORDER.indexOf(a.code) - VERDICT_ORDER.indexOf(b.code));
  const relevant = verdicts.filter((v) => v.code !== "REASON_MISMATCH");
  const irrelevant = verdicts.filter((v) => v.code === "REASON_MISMATCH");
  const missing = d.requirements.filter((r) => !r.satisfied);
  const noBasis = rec?.disposition === "NO_BASIS_ESCALATE";
  const refresh = () => {
    mutate();
    mutateGraph();
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <Link href="/console" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-link">
        <ChevronLeft size={14} aria-hidden /> Docket
      </Link>

      <header className="mt-3 border-b border-ink pb-5">
        <h1 className="max-w-[30ch] font-serif text-[34px] font-semibold leading-[1.08] tracking-[-0.015em]">
          {d.service}
          <span className="mt-1 block text-[22px] font-normal leading-tight text-ink-2">
            {d.reason_name ? `Denied: ${d.reason_name.toLowerCase()}` : "Denial being read"}
          </span>
        </h1>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-2">
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Claim</dt>
            <dd>
              <Mono className="text-ink">{c.claim_id}</Mono>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Policyholder</dt>
            <dd>{d.tenant}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Service date</dt>
            <dd className="tabular">{fmtDate(c.service_date)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Filed</dt>
            <dd className="tabular">{c.filing_lag_days} days later</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Governing policy</dt>
            <dd>{d.version ? `LumenCare Silver ${d.version.label}` : "being determined"}</dd>
          </div>
          {d.clause && (
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Denial cites</dt>
              <dd>
                §{d.clause.section} {d.clause.title}
              </dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Emergency</dt>
            <dd>{c.is_emergency ? "yes" : "no"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-3">In network</dt>
            <dd>{c.in_network ? "yes" : "no"}</dd>
          </div>
        </dl>
        {d.trap && TRAPS[d.trap] && (
          <p className="mt-3 max-w-[90ch] text-[12.5px] text-ink-2">
            <span className="font-semibold text-ink">
              Scenario {d.trap}, {TRAPS[d.trap].name.toLowerCase()}.
            </span>{" "}
            {d.note ?? TRAPS[d.trap].line}
          </p>
        )}
      </header>

      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SectionHead
            top
            title="Holding"
            aside={rec?.llm_model ? `wording by ${rec.llm_model.split("/").pop()} · decisions by the graph` : undefined}
          />
          {rec && disp ? (
            <div>
              <p className="flex items-center gap-3 font-serif text-[24px] font-semibold leading-tight">
                <SignalMark kind={disp.tone} size={22} className="stamp" />
                {disp.label}
              </p>
              <p className="mt-2 max-w-[70ch] font-serif text-[16px] leading-relaxed text-ink-2">{rec.summary}</p>
              <p className="mt-2 text-[12.5px] text-ink-3 tabular">
                Precedent confidence {pct(rec.confidence)}
                {rec.guard_dropped || rec.guard_added
                  ? ` · citation guard dropped ${rec.guard_dropped} and added ${rec.guard_added} item${rec.guard_added === 1 ? "" : "s"}`
                  : " · every item cites the graph"}
              </p>
              {rec.uncertainty?.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">What could make this wrong</h3>
                  <ul className="mt-1.5 space-y-1">
                    {rec.uncertainty.map((u) => {
                      const line = uncertaintyLine(u, d.verdicts);
                      return (
                        <li key={u} className="flex gap-2 text-[13px] text-ink-2">
                          <span className="mt-[9px] h-px w-3 shrink-0 bg-ink-3" aria-hidden />
                          <span>
                            {line.text}
                            {line.ids && <Mono className="ml-1.5 text-ink-3">{line.ids}</Mono>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-3">No holding yet. The Planner writes one after the Verifier has ruled on every precedent.</p>
          )}
          <div className="mt-5 lg:hidden">
            <ActionPanel d={d} cid={id} onDone={refresh} />
          </div>

          {rec && rec.items.length > 0 && (
            <>
              <SectionHead title="Plan" aside="each item names the graph nodes it rests on — hover one to find it below" />
              <ol className="space-y-0">
                {rec.items.map((it) => (
                  <li key={it.order} className="grid grid-cols-[30px_1fr] gap-x-2 border-b border-rule py-2.5 last:border-b-0">
                    <span className="font-serif text-[15px] text-ink-3 tabular">[{it.order}]</span>
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                            it.kind === "REJECTED_PRECEDENT" || it.kind === "WARNING" ? "text-neg" : "text-ink-3"
                          }`}
                        >
                          {KIND_LABEL[it.kind] ?? it.kind}
                        </span>
                        <span className="text-[14px] text-ink">{it.text}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {it.cites.map((x) => (
                          <Cite key={x} id={x} active={hot === x} onHover={setHot} />
                        ))}
                        {it.origin === "template" && <span className="text-[11px] text-ink-3">added by the citation guard</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          <SectionHead
            title="Precedents"
            aside={
              relevant.length
                ? `${relevant.filter((v) => v.code === "ACCEPTED").length} followed · ${relevant.filter((v) => v.code !== "ACCEPTED").length} refused or distinguished`
                : undefined
            }
          />
          {relevant.length ? (
            <ul>
              {relevant.map((v) => (
                <PrecedentRow key={v.finding_id} v={v} hot={hot === v.finding_id} onHover={setHot} />
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-3">
              {["NEW", "RECEIVED", "CLASSIFIED"].includes(c.status) ? "Precedents appear once Retrieval has searched memory." : "No precedent in memory applies to this claim."}
            </p>
          )}
          {irrelevant.length > 0 && (
            <button
              className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-link"
              onClick={() => setShowIrrelevant(!showIrrelevant)}
              aria-expanded={showIrrelevant}
            >
              {showIrrelevant ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {irrelevant.length} look-alike{irrelevant.length === 1 ? "" : "s"} found by text similarity, not relevant
            </button>
          )}
          {showIrrelevant && (
            <ul className="mt-1">
              {irrelevant.map((v) => (
                <PrecedentRow key={v.finding_id} v={v} hot={hot === v.finding_id} onHover={setHot} />
              ))}
            </ul>
          )}

          <SectionHead title="How the graph decided" aside="claim → governing policy → precedents → grounds" />
          {g && g.nodes.length > 1 ? (
            <EvidenceGraph nodes={g.nodes} edges={g.edges} highlight={hot} onHover={setHot} />
          ) : (
            <p className="text-[13.5px] text-ink-3">The graph fills in as the agents work.</p>
          )}

          <SectionHead title="Denial notice" aside={`issued ${fmtDate(d.notice_date)}`} />
          <blockquote className="max-w-[72ch] border-l border-ink pl-4 font-serif text-[15.5px] leading-relaxed text-ink-2">
            {d.notice}
          </blockquote>

          <SectionHead
            title="Evidence"
            aside={noBasis ? "not needed: there is no basis for an appeal" : missing.length ? `${missing.length} missing` : d.requirements.length ? "all on file" : undefined}
          />
          <div className="grid gap-x-10 sm:grid-cols-2">
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Required by the governing terms</h3>
              <ul className="mt-1.5">
                {d.requirements.length ? (
                  d.requirements.map((r) => (
                    <li key={r.code} className="flex items-center justify-between border-b border-rule py-1.5 text-[13px]">
                      <span>{r.name}</span>
                      {r.satisfied ? (
                        <Treatment kind="positive" label="On file" size={12} />
                      ) : noBasis ? (
                        <Treatment kind="neutral" label="Not needed" size={12} />
                      ) : (
                        <Treatment kind="negative" label="Missing" size={12} />
                      )}
                    </li>
                  ))
                ) : (
                  <li className="py-1.5 text-[13px] text-ink-3">Nothing required, or not yet determined.</li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">Submitted with the claim</h3>
              <ul className="mt-1.5">
                {d.evidence.length ? (
                  d.evidence.map((e) => (
                    <li key={e.code} className="flex items-center justify-between border-b border-rule py-1.5 text-[13px]">
                      <span>{e.name}</span>
                      <span className="text-[12px] text-ink-3 tabular">{fmtDate(e.submitted)}</span>
                    </li>
                  ))
                ) : (
                  <li className="py-1.5 text-[13px] text-ink-3">No documents submitted.</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="hidden lg:block">
            <ActionPanel d={d} cid={id} onDone={refresh} />
          </div>
          {d.clause && (
            <section>
              <h2 className="border-b border-ink pb-1.5 font-serif text-[15px] font-semibold">
                §{d.clause.section} {d.clause.title}
              </h2>
              <p className="mt-2 font-serif text-[14px] leading-relaxed text-ink-2">{d.clause.text}</p>
              <p className="mt-1.5 text-[11.5px] text-ink-3">
                <Mono>{d.clause.clause_id}</Mono> · in force from {fmtDate(d.version?.effective_from)}
              </p>
            </section>
          )}
          <section>
            <h2 className="mb-2.5 border-b border-ink pb-1.5 font-serif text-[15px] font-semibold">Agent record</h2>
            <AgentRecord d={d} />
          </section>
        </aside>
      </div>
    </div>
  );
}
