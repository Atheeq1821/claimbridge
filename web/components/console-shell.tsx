"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import useSWR, { SWRConfig, useSWRConfig } from "swr";
import { BookOpenText, Bot, Brain, ChartColumnBig, Menu, X } from "lucide-react";
import { fetcher, type Overview } from "@/lib/api";
import { Wordmark } from "./signal";

type Live = { connected: boolean; lastTick: number | null };
const LiveContext = createContext<Live>({ connected: false, lastTick: null });
export const useLive = () => useContext(LiveContext);

function LiveBridge({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [live, setLive] = useState<Live>({ connected: false, lastTick: null });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource("/api/stream");
      es.onopen = () => setLive((l) => ({ ...l, connected: true }));
      es.addEventListener("tick", () => {
        setLive({ connected: true, lastTick: Date.now() });
        if (pending.current) return;
        pending.current = setTimeout(() => {
          pending.current = null;
          mutate((key) => typeof key === "string" && key.startsWith("/api/") && key !== "/api/eval");
        }, 250);
      });
      es.onerror = () => {
        setLive((l) => ({ ...l, connected: false }));
        es?.close();
        retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [mutate]);

  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>;
}

const NAV = [
  { href: "/console", label: "Docket", icon: BookOpenText, exact: true },
  { href: "/console/memory", label: "Memory", icon: Brain },
  { href: "/console/agents", label: "Agents", icon: Bot },
  { href: "/console/evaluation", label: "Evaluation", icon: ChartColumnBig },
];

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data } = useSWR<Overview>("/api/overview", fetcher, { refreshInterval: 5000 });
  const live = useLive();
  const counts = data?.statuses ?? {};
  const review = counts["AWAITING_REVIEW"] ?? 0;
  const stale = (data?.findings?.["STALE"] ?? 0) + (data?.findings?.["CONTRADICTED"] ?? 0);

  return (
    <nav aria-label="Console" className="flex h-full flex-col bg-rail text-rail-ink">
      <div className="px-5 pb-6 pt-5">
        <Link href="/" className="inline-block" onClick={onNavigate}>
          <Wordmark invert />
        </Link>
        <p className="mt-1 text-[11.5px] leading-snug text-[#93a0bb]">Caseworker console</p>
      </div>
      <ul className="flex flex-col gap-px px-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? path === href || path.startsWith("/console/claims") : path.startsWith(href);
          const badge = label === "Docket" ? review : label === "Memory" ? stale : label === "Agents" ? data?.workers_alive : null;
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-10 items-center gap-3 rounded-[3px] px-3 text-[13.5px] transition-colors ${
                  active ? "bg-paper font-semibold text-ink" : "hover:bg-[#1e2d4f] hover:text-white"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
                {badge ? (
                  <span
                    className={`ml-auto font-mono text-[11px] tabular ${active ? "text-ink-3" : "text-[#93a0bb]"}`}
                    title={
                      label === "Docket"
                        ? "Claims awaiting review"
                        : label === "Memory"
                          ? "Precedents limited or contradicted"
                          : "Workers alive"
                    }
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3 border-t border-rail-rule px-5 py-4 text-[11.5px] leading-relaxed text-[#93a0bb]">
        <div className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${live.connected ? "live-dot bg-[#58c08a]" : "bg-[#93a0bb]"}`}
            aria-hidden
          />
          <span>{live.connected ? "Live from the graph" : "Reconnecting…"}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt>Policy world</dt>
          <dd className="text-rail-ink">{data?.world ? data.world.replace("V", "") : "—"}</dd>
          <dt>Supervisor</dt>
          <dd className="text-rail-ink">{data ? (data.supervisor_alive ? "running" : "stopped") : "—"}</dd>
          <dt>LLM</dt>
          <dd className="truncate text-rail-ink" title={data ? `${data.llm.platform}/${data.llm.model}` : ""}>
            {data ? `${data.llm.model.split("/").pop()} · ${data.llm.mode === "cached" ? "replay" : data.llm.mode}` : "—"}
          </dd>
        </dl>
      </div>
    </nav>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, keepPreviousData: true }}>
      <LiveBridge>
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 lg:block">
            <Suspense fallback={<div className="h-full bg-rail" />}>
              <Rail />
            </Suspense>
          </aside>
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <button className="absolute inset-0 bg-[#0b1430]/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-[260px]">
                <Suspense fallback={<div className="h-full bg-rail" />}>
                  <Rail onNavigate={() => setOpen(false)} />
                </Suspense>
              </div>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 items-center gap-3 border-b border-rule bg-paper px-4 lg:hidden">
              <button
                className="-ml-1 rounded-[3px] p-1.5 text-ink hover:bg-wash"
                aria-label={open ? "Close navigation" : "Open navigation"}
                onClick={() => setOpen(!open)}
              >
                {open ? <X size={18} /> : <Menu size={18} />}
              </button>
              <Wordmark />
            </header>
            <div className="border-b border-rule bg-wash px-4 py-1.5 text-[11.5px] text-ink-2 sm:px-8">
              Synthetic, fictional data for demonstration. Every recommendation needs a caseworker&apos;s approval; ClaimBridge
              does not approve claims or give legal advice.
            </div>
            <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:pt-8">{children}</main>
          </div>
        </div>
      </LiveBridge>
    </SWRConfig>
  );
}
