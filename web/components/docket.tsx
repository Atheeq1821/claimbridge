"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowUpRight, Search } from "lucide-react";
import { post, type ClaimRow } from "@/lib/api";
import {
  DISPOSITION,
  STATUS_LABEL,
  STATUS_ORDER,
  STEPS,
  TRAPS,
  TREATMENT,
  ago,
  fmtDate,
  stepIndex,
} from "@/lib/vocab";
import { SignalMark, Treatment } from "./signal";
import { Button, Empty, ErrorNote } from "./ui";

const GROUPS = [
  { id: "T1", label: "T1 · Version drift" },
  { id: "T2", label: "T2 · Wrong clause" },
  { id: "T3", label: "T3 · Missing evidence" },
  { id: "T4", label: "T4 · Contradicted memory" },
  { id: "T5", label: "T5 · Condition unmet" },
  { id: "T6", label: "T6 · No basis" },
  { id: "T7", label: "T7 · Tenant isolation" },
  { id: "M", label: "M · Memory gain" },
  { id: "normal", label: "Routine claims" },
  { id: "all", label: "Every claim" },
];

const LEDGER = ["NEW", "RECEIVED", "CLASSIFIED", "RETRIEVED", "VERIFIED", "AWAITING_REVIEW", "APPROVED", "CURATED", "NEEDS_HUMAN"];

function StepTrack({ row }: { row: ClaimRow }) {
  const idx = stepIndex(row.status);
  const working = row.lease_owner;
  return (
    <div className="flex min-w-[148px] flex-col gap-1">
      <div className="flex gap-[3px]" aria-hidden>
        {STEPS.map((s) => {
          const at = STATUS_ORDER.indexOf(s.status);
          const done = idx > at;
          const current = at === idx;
          return (
            <span
              key={s.status}
              className={`h-[5px] flex-1 ${
                row.status === "NEEDS_HUMAN"
                  ? "bg-neg"
                  : done || (current && row.status === "AWAITING_REVIEW")
                    ? "bg-ink"
                    : current && working
                      ? "live-dot bg-link"
                      : "bg-wash-2"
              }`}
            />
          );
        })}
      </div>
      <span key={row.status + (working ?? "")} className="turn text-[12px] text-ink-2">
        {working ? (
          <>
            <span className="text-link">{working}</span> working
          </>
        ) : (
          STATUS_LABEL[row.status] ?? row.status
        )}
      </span>
    </div>
  );
}

function CitatorStrip({ flags }: { flags: ClaimRow["flags"] }) {
  if (!flags.length) return <span className="text-[12px] text-ink-3">—</span>;
  const tally = { negative: 0, caution: 0, positive: 0, neutral: 0 };
  flags.forEach((f) => (tally[TREATMENT[f.code]?.signal ?? "neutral"] += 1));
  const parts = [
    tally.negative && `${tally.negative} refused`,
    tally.caution && `${tally.caution} distinguished`,
    tally.positive && `${tally.positive} followed`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {flags.map((f) => {
          const t = TREATMENT[f.code] ?? TREATMENT.CANDIDATE;
          return (
            <span key={f.finding_id} title={`${f.finding_id}: ${t.label}. ${t.why}`}>
              <SignalMark kind={t.signal} size={13} />
            </span>
          );
        })}
      </div>
      <span className="text-[11.5px] text-ink-3">{parts.join(" · ")}</span>
    </div>
  );
}

export function Docket() {
  const { data, error, isLoading, mutate } = useSWR<ClaimRow[]>("/api/claims", { refreshInterval: 4000 });
  const [status, setStatus] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [fileGroup, setFileGroup] = useState("T1");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const rows = useMemo(() => {
    let r = data ?? [];
    if (status) r = r.filter((x) => x.status === status);
    if (group !== "all") r = r.filter((x) => (group === "normal" ? !x.trap : x.trap === group));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) =>
        [x.claim_id, x.tenant, x.service_name, x.reason_name ?? ""].some((v) => v?.toLowerCase().includes(s)),
      );
    }
    return [...r].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0) || a.claim_id.localeCompare(b.claim_id));
  }, [data, status, group, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (data ?? []).forEach((x) => (c[x.status] = (c[x.status] ?? 0) + 1));
    return c;
  }, [data]);

  async function file(ids?: string[]) {
    setBusy(true);
    setActionError(null);
    try {
      await post("/api/claims/inject", ids ? { ids } : { group: fileGroup });
      await mutate();
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }

  const unfiled = (data ?? []).filter((x) => x.status === "NEW" && (fileGroup === "all" || (fileGroup === "normal" ? !x.trap : x.trap === fileGroup))).length;

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="font-serif text-[32px] font-semibold leading-[1.1] tracking-[-0.015em]">Docket</h1>
          <p className="mt-1.5 max-w-[66ch] text-[13.5px] text-ink-2">
            Denied claims, worked by five agents that share nothing but the graph. Each precedent carries its treatment:{" "}
            <Treatment kind="positive" label="followed" size={12} />,{" "}
            <Treatment kind="caution" label="distinguished" size={12} /> or{" "}
            <Treatment kind="negative" label="refused" size={12} />.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="file-group">
            Scenario to file
          </label>
          <select
            id="file-group"
            value={fileGroup}
            onChange={(e) => setFileGroup(e.target.value)}
            className="h-8 rounded-[3px] border border-rule-2 bg-paper px-2 text-[13px] text-ink hover:border-ink"
          >
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          {unfiled ? (
            <Button variant="primary" busy={busy} onClick={() => file()}>
              File {unfiled} claim{unfiled === 1 ? "" : "s"}
            </Button>
          ) : (
            <span className="inline-flex h-8 items-center px-1 text-[12.5px] text-ink-3" role="status">
              All claims in this scenario are filed
            </span>
          )}
        </div>
      </div>
      <ErrorNote error={actionError} />

      {/* The ledger: where every claim stands, as one ruled line. */}
      <div className="mt-5 flex flex-wrap border-y border-ink" role="group" aria-label="Filter by stage">
        {LEDGER.map((s) => {
          const n = counts[s] ?? 0;
          const active = status === s;
          return (
            <button
              key={s}
              onClick={() => setStatus(active ? null : s)}
              aria-pressed={active}
              className={`flex h-9 items-center gap-1.5 border-r border-rule px-3 text-[12.5px] transition-colors last:border-r-0 ${
                active ? "bg-ink text-white" : "hover:bg-wash"
              }`}
            >
              <span className={`font-semibold tabular ${active ? "text-white" : n ? "text-ink" : "text-ink-3"}`}>{n}</span>
              <span className={active ? "text-[#c9d1e2]" : s === "NEEDS_HUMAN" && n ? "text-neg" : n ? "text-ink-2" : "text-ink-3"}>
                {STATUS_LABEL[s]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Claim, policyholder, service, reason"
            aria-label="Search claims"
            className="h-8 w-[280px] rounded-[3px] border border-rule-2 bg-paper pl-8 pr-2 text-[13px] placeholder:text-ink-3 hover:border-ink"
          />
        </div>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Scenario"
          className="h-8 rounded-[3px] border border-rule-2 bg-paper px-2 text-[13px] hover:border-ink"
        >
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.id === "all" ? "All scenarios" : g.label}
            </option>
          ))}
        </select>
        {(status || group !== "all" || q) && (
          <Button variant="ghost" onClick={() => (setStatus(null), setGroup("all"), setQ(""))}>
            Clear filters
          </Button>
        )}
        <span className="ml-auto text-[12px] text-ink-3 tabular">
          {rows.length} of {data?.length ?? 0} claims
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        {error && <ErrorNote error={error} />}
        <table className="w-full border-collapse text-left md:min-w-[1040px]">
          <thead>
            <tr className="border-b border-rule-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              <th className="py-2 pr-4 font-semibold">Claim</th>
              <th className="hidden py-2 pr-4 font-semibold md:table-cell">Scenario</th>
              <th className="hidden py-2 pr-4 font-semibold md:table-cell">Service · denial</th>
              <th className="hidden py-2 pr-4 font-semibold md:table-cell">Progress</th>
              <th className="hidden py-2 pr-4 font-semibold md:table-cell">Precedents</th>
              <th className="hidden py-2 pr-4 font-semibold whitespace-nowrap md:table-cell">Disposition · confidence</th>
              <th className="hidden py-2 text-right font-semibold md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              !data &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-rule">
                  <td colSpan={7} className="py-4">
                    <div className="h-4 w-2/3 animate-pulse bg-wash" />
                  </td>
                </tr>
              ))}
            {rows.map((r) => {
              const d = r.disposition ? DISPOSITION[r.disposition] : null;
              return (
                <tr key={r.claim_id} className="group border-b border-rule align-top hover:bg-wash">
                  <td className="py-3 pr-4">
                    <Link href={`/console/claims/${r.claim_id}`} className="font-mono text-[12.5px] font-medium text-ink hover:text-link hover:underline">
                      {r.claim_id}
                    </Link>
                    <div className="mt-0.5 text-[12px] text-ink-3">{r.tenant}</div>
                    <div className="mt-2 space-y-2 md:hidden">
                      <div className="text-[12.5px] text-ink">
                        {r.service_name} · {r.reason_name ?? "not yet classified"}
                      </div>
                      {r.status === "NEW" ? <span className="text-[12px] text-ink-3">Not filed</span> : <StepTrack row={r} />}
                      <CitatorStrip flags={r.flags} />
                      {d && <Treatment kind={d.tone} label={d.short} size={12} className="text-[12.5px]" />}
                    </div>
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell text-[12.5px]">
                    {r.trap ? (
                      <>
                        <span className="font-medium text-ink">
                          {r.trap} · {TRAPS[r.trap]?.name}
                        </span>
                        <div className="mt-0.5 max-w-[26ch] text-[11.5px] leading-snug text-ink-3">{TRAPS[r.trap]?.line}</div>
                      </>
                    ) : (
                      <span className="text-ink-3">Routine</span>
                    )}
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell text-[13px]">
                    <div className="text-ink">{r.service_name}</div>
                    <div className="mt-0.5 text-[12px] text-ink-3">
                      {r.reason_name ?? "Not yet classified"} · {fmtDate(r.service_date)}
                    </div>
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    {r.status === "NEW" ? (
                      <Button className="h-7" onClick={() => file([r.claim_id])} disabled={busy}>
                        File claim
                      </Button>
                    ) : (
                      <StepTrack row={r} />
                    )}
                  </td>
                  <td className="hidden py-3 pr-4 md:table-cell">
                    <CitatorStrip flags={r.flags} />
                  </td>
                  <td className="hidden whitespace-nowrap py-3 pr-4 md:table-cell text-[12.5px]">
                    {d ? (
                      <>
                        <Treatment kind={d.tone} label={d.short} size={12} />
                        {r.confidence != null && (
                          <div className="mt-0.5 text-[11.5px] text-ink-3 tabular" title="Precedent confidence">{Math.round(r.confidence * 100)}%</div>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap py-3 text-right text-[12px] md:table-cell text-ink-3 tabular">
                    <Link href={`/console/claims/${r.claim_id}`} className="inline-flex items-center gap-1 hover:text-link">
                      {ago(r.updated_at)} <ArrowUpRight size={13} aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && !rows.length && (
          <div className="mt-6">
            <Empty title="No claims match these filters.">Clear the filters, or file a scenario to put claims on the docket.</Empty>
          </div>
        )}
      </div>
    </div>
  );
}
