// Typed access to the ClaimBridge API (proxied same-origin under /api).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parse(res: Response) {
  if (res.ok) return res.json();
  let detail = res.statusText;
  try {
    const body = await res.json();
    detail = body.detail ?? detail;
  } catch {}
  throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
}

export const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(parse);

export async function post<T = unknown>(url: string, body: unknown = {}, headers: HeadersInit = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return parse(res);
}

export type Flag = { finding_id: string; code: string };

export type ClaimRow = {
  claim_id: string;
  tenant_id: string;
  tenant: string;
  service: string;
  service_name: string;
  service_date: number;
  status: string;
  reason: string | null;
  reason_name: string | null;
  version: string | null;
  disposition: string | null;
  lease_owner: string | null;
  attempt: number | null;
  amount: number;
  confidence: number | null;
  trap: string | null;
  note: string | null;
  flags: Flag[];
  updated_at: number | null;
};

export type Verdict = {
  finding_id: string;
  code: string;
  source: string;
  statement: string;
  status: string;
  confidence: number;
  support: number;
  learned_on: string;
  learned_section: string;
  governing: string | null;
  contradicted_by: string[];
  valid_in: string[];
};

export type RecItem = { order: number; kind: string; text: string; origin: string; cites: string[] };

export type Recommendation = {
  disposition: string;
  summary: string;
  confidence: number;
  uncertainty: string[];
  llm_platform: string | null;
  llm_model: string | null;
  guard_dropped: number;
  guard_added: number;
  approved_by?: string;
  items: RecItem[];
};

export type TimelineEvent = {
  seq: number;
  type: string;
  agent: string;
  step: string | null;
  ts: number;
  payload: Record<string, unknown>;
};

export type ClaimRecord = {
  claim_id: string;
  tenant_id: string;
  status: string;
  service_date: number;
  filed_date: number;
  filing_lag_days: number;
  amount: number;
  in_network: boolean;
  is_emergency: boolean;
  lease_owner?: string | null;
  attempt?: number;
  disposition?: string | null;
};

export type ClaimDetail = {
  claim: ClaimRecord;
  tenant: string;
  service: string;
  notice: string;
  notice_date: number;
  version: { version_id: string; label: string; effective_from: number; effective_to: number } | null;
  clause: { clause_id: string; section: string; title: string; text: string; lineage_id: string } | null;
  reason: string | null;
  reason_name: string | null;
  evidence: { code: string; name: string; submitted: number }[];
  requirements: { code: string; name: string; satisfied: boolean }[];
  verdicts: Verdict[];
  recommendation: Recommendation | null;
  timeline: TimelineEvent[];
  trap: string | null;
  note: string | null;
};

export type GraphNode = {
  id: string;
  kind: "claim" | "version" | "clause" | "evidence" | "finding" | "resolution";
  label: string;
  sub?: string;
  code?: string;
  status?: string;
  satisfied?: boolean;
};
export type GraphEdge = { from: string; to: string; label: string; code?: string; state?: string };

export type Finding = {
  finding_id: string;
  statement: string;
  status: string;
  support: number;
  wins: number;
  confidence: number;
  origin: string;
  updated_at: number;
  reason: string;
  reason_name: string;
  lineage: string;
  learned_on: string;
  section: string;
  clause_title: string;
  valid_in: string[];
  needs: string[];
  contradictions: number;
  stale_because: string[];
  playbook: string | null;
};

export type Memory = {
  findings: Finding[];
  playbooks: { playbook_id: string; name: string; uses: number; wins: number; reason: string; steps: string[] }[];
  versions: { id: string; label: string; effective_from: number }[];
  next_version: string | null;
};

export type Overview = {
  world: string | null;
  statuses: Record<string, number>;
  findings: Record<string, number>;
  workers_alive: number;
  supervisor_alive: boolean;
  llm: { platform: string; model: string; mode: string };
  world_job: { running: boolean; action: string | null; error: string | null };
};
