"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeadlineTable, useEval } from "./results";
import { SignalMark, Treatment, Wordmark } from "./signal";

const REPO = "https://github.com/Atheeq1821/claimbridge";

function CitatorCard() {
  return (
    <figure className="border border-ink bg-paper" aria-label="Example: a precedent refused because the policy changed">
      <div className="flex items-baseline justify-between gap-4 border-b border-ink bg-ink px-5 py-3 text-white">
        <span className="font-mono text-[12.5px]">EV-T6-01</span>
        <span className="text-[12px] text-[#c9d1e2]">Outpatient MRI · denied for late filing</span>
      </div>

      <dl className="grid grid-cols-3 border-b border-rule text-[12px]">
        <div className="border-r border-rule px-5 py-3">
          <dt className="text-ink-3">Service</dt>
          <dd className="mt-0.5 font-serif text-[16px] tabular">1 Feb 2026</dd>
        </div>
        <div className="border-r border-rule px-5 py-3">
          <dt className="text-ink-3">Filed</dt>
          <dd className="mt-0.5 font-serif text-[16px] tabular">120 days later</dd>
        </div>
        <div className="px-5 py-3">
          <dt className="text-ink-3">§9.1, 2026 policy</dt>
          <dd className="mt-0.5 font-serif text-[16px] tabular">90-day limit</dd>
        </div>
      </dl>

      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <SignalMark kind="negative" size={44} className="stamp shrink-0" title="Negative treatment: superseded" />
          <div>
            <p className="text-[13px] font-semibold text-neg">
              Superseded <span className="font-mono text-[12px] font-normal text-ink-3">F-TIMELY-180</span>
            </p>
            <p className="mt-0.5 font-serif text-[15.5px] leading-snug text-ink">
              Timely-filing denials were overturned when the appeal included proof of filing.
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              Learned from verified wins under §9.1 (2025), which allowed 180 days. The 2026 clause allows 90, so it no longer applies here.
            </p>
          </div>
        </div>
      </div>

      <div className="grid border-t border-rule sm:grid-cols-2">
        <div className="border-b border-rule px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">Plain vector RAG</p>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink">
            Cites past win <span className="font-mono text-[12px]">HC-031</span> and asks for proof of timely filing.
          </p>
          <p className="mt-2">
            <Treatment kind="negative" label="Wrong: there is no basis to appeal" size={12} className="text-[12.5px]" />
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">ClaimBridge</p>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink">
            Refuses the precedent, shows the superseding clause, and escalates: 120 days exceeds the limit in force.
          </p>
          <p className="mt-2">
            <Treatment kind="positive" label="Matches the ground truth" size={12} className="text-[12.5px]" />
          </p>
        </div>
      </div>
      <figcaption className="border-t border-rule bg-wash px-5 py-2 text-[11.5px] text-ink-3">
        A real result from the evaluation, on synthetic data. Same LLM and documents for both systems.
      </figcaption>
    </figure>
  );
}

const PIPELINE = [
  ["Intake", "Pins the policy version in force on the service date and reads the denial.", "GOVERNED_BY · DENIED_FOR · CITES"],
  ["Retrieval", "Pulls candidate precedents from memory: by graph structure first, text similarity second.", "CONSIDERED"],
  ["Verifier", "Rules on every precedent in Cypher: version, clause, conditions, contradictions.", "verdict · reason_code"],
  ["Planner", "Writes the plan. The LLM words it; every item must cite a node the Verifier returned.", "Recommendation · CITES"],
  ["Curator", "Turns a verified outcome into memory, or marks memory stale when a policy changes.", "Finding · VALID_IN · STALE_BECAUSE"],
];

const FATES = [
  {
    kind: "negative" as const,
    label: "Superseded",
    id: "F-MRI-REFERRAL",
    line: "MRI preauthorization was waived with a specialist referral — until the 2026 policy removed the exception.",
  },
  {
    kind: "negative" as const,
    label: "Contradicted",
    id: "F-SLEEP-RETRO",
    line: "Retroactive authorization won two sleep-study appeals. Two later, identical appeals were upheld.",
  },
  {
    kind: "caution" as const,
    label: "Distinguished",
    id: "F-OON-ER",
    line: "Out-of-network care was paid in emergencies. An elective MRI does not qualify.",
  },
  {
    kind: "positive" as const,
    label: "Followed",
    id: "F-CODING",
    line: "Coding denials were overturned with a corrected submission and itemized bill, in every policy year.",
  },
];

function Results() {
  const { data, error } = useEval();
  if (error) return <p className="text-[13px] text-ink-3">Results are in eval/results/latest.md in the repository.</p>;
  if (!data) return <div className="h-72 animate-pulse bg-wash" />;
  const ch = data.chaos;
  return (
    <>
      <HeadlineTable data={data} compact />
      {ch && (
        <p className="mt-4 max-w-[80ch] text-[14px] text-ink-2">
          Under {ch.kills} random hard kills, {ch.steps_interrupted} interrupted a step in progress; every one was resumed by another worker,
          with {ch.duplicate_step_outputs} duplicate outputs and {ch.correct} of {ch.claims} claims correct.
        </p>
      )}
    </>
  );
}

export function Landing() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-5 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 text-[13.5px] sm:gap-5">
          <a href="#how" className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#results" className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">
            Results
          </a>
          <a href={REPO} className="hidden px-2 py-1 text-ink-2 hover:text-ink sm:inline">
            Source
          </a>
          <Link href="/console" className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-ink px-4 font-medium text-white hover:bg-[#1f2f52]">
            Open the console <ArrowRight size={15} aria-hidden />
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1240px] items-center gap-x-14 gap-y-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1fr_minmax(0,560px)] lg:pt-16">
        <div>
          <h1 className="max-w-[13ch] font-serif text-[clamp(44px,6.4vw,84px)] font-semibold leading-[0.98] tracking-[-0.03em] text-ink">
            Memory that knows when it&apos;s wrong.
          </h1>
          <p className="mt-6 max-w-[48ch] font-serif text-[19px] leading-relaxed text-ink-2">
            ClaimBridge is an AI caseworker for denied health-insurance claims. It reuses verified wins — and refuses the ones the current
            policy no longer supports, with the clause that superseded them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/console" className="inline-flex h-11 items-center gap-2 rounded-[3px] bg-ink px-5 text-[14.5px] font-medium text-white hover:bg-[#1f2f52]">
              Open the console <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/console/evaluation" className="inline-flex h-11 items-center rounded-[3px] border border-rule-2 px-5 text-[14.5px] font-medium text-ink hover:border-ink hover:bg-wash">
              See the evaluation
            </Link>
          </div>
          <p className="mt-8 max-w-[56ch] text-[12.5px] leading-relaxed text-ink-3">
            Five agents on a FalkorDB graph · WeMakeDevs × FalkorDB Graph Hacks, Track 02: Agent Memory and Coordination · synthetic data,
            human approval required.
          </p>
        </div>
        <CitatorCard />
      </section>

      <section className="border-y border-ink bg-wash">
        <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8">
          <h2 className="max-w-[24ch] font-serif text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em]">
            Every precedent carries its treatment.
          </h2>
          <p className="mt-3 max-w-[66ch] text-[15px] text-ink-2">
            The way a legal citator flags case law, ClaimBridge flags every lesson in memory before it is reused — in the graph, in Cypher, with
            the reason attached.
          </p>
          <div className="mt-10 grid border-t border-ink sm:grid-cols-2 lg:grid-cols-4">
            {FATES.map((f) => (
              <div key={f.id} className="border-b border-rule py-5 pr-6 sm:border-r sm:pl-5 sm:first:pl-0 lg:border-b-0 lg:last:border-r-0">
                <Treatment kind={f.kind} label={f.label} size={18} className="text-[15px]" />
                <p className="mt-1 font-mono text-[12px] text-ink-3">{f.id}</p>
                <p className="mt-3 font-serif text-[16px] leading-snug text-ink">{f.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-6 px-5 py-20 sm:px-8">
        <h2 className="max-w-[26ch] font-serif text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em]">
          Five agents. One graph. No messages between them.
        </h2>
        <p className="mt-3 max-w-[68ch] text-[15px] text-ink-2">
          Each agent is its own process. It leases a claim with one atomic write, does one step, and commits — fenced, so a worker that lost
          its lease cannot overwrite the next one. Kill any of them mid-step: the lease expires and another replica resumes from the
          checkpoint in the graph.
        </p>
        <ol className="mt-10 grid border-t border-ink md:grid-cols-5">
          {PIPELINE.map(([name, job, writes], i) => (
            <li key={name} className="border-b border-rule py-5 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0">
              <p className="font-serif text-[14px] text-ink-3 tabular">{i + 1}</p>
              <h3 className="mt-1 font-serif text-[21px] font-semibold">{name}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{job}</p>
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-3">{writes}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[80ch] text-[13.5px] text-ink-3">
          A deterministic Supervisor runs the pool, executes kill and start commands written into the graph, and records expired leases. A
          caseworker approves every recommendation and records the real outcome, which is what memory learns from.
        </p>
      </section>

      <section id="results" className="border-t border-ink">
        <div className="mx-auto max-w-[1240px] scroll-mt-6 px-5 py-20 sm:px-8">
          <h2 className="max-w-[28ch] font-serif text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em]">
            Same model, same documents. Only the graph differs.
          </h2>
          <p className="mt-3 max-w-[70ch] text-[15px] text-ink-2">
            34 synthetic claims, 19 of them traps. A larger embedding model did not rescue plain RAG: its mistakes are about policy versions,
            conditions and contradictions, not retrieval.
          </p>
          <div className="mt-10">
            <Results />
          </div>
          <Link href="/console/evaluation" className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-link hover:underline">
            Full evaluation, including the failures <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink bg-ink text-[#c9d1e2]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-6 px-5 py-10 text-[12.5px] leading-relaxed sm:px-8">
          <div className="max-w-[60ch] space-y-2">
            <Wordmark invert />
            <p>
              All insurers, plans, people and claims are fictional. ClaimBridge recommends; a person approves. It does not approve claims or
              give legal advice.
            </p>
            <p>Built with FalkorDB, FastAPI and Next.js; LLM wording by Groq gpt-oss-120b. Developed with an AI coding assistant, disclosed in the repository.</p>
          </div>
          <div className="flex gap-5">
            <Link href="/console" className="text-white hover:underline">
              Console
            </Link>
            <a href={REPO} className="text-white hover:underline">
              Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
