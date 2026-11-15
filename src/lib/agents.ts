import { API_URL } from "./api";
import { BACKEND_HEADERS } from "./net";

export type AgentId = "chief" | "scout" | "terrain" | "power" | "comms" | "timing" | "safety";
export type Vote = "GO" | "CAUTION" | "NO-GO";

export interface AgentInfo {
  id: AgentId;
  name: string;
  role: string;
  color: string;
}

export interface AgentDecision {
  go: boolean;
  decided_by: string;
  primary: {
    site_id: string;
    name: string;
    landing_time: string;
    zone: { id: string; lat: number; lon: number; area_km2: number; mean_success: number } | null;
    vetoes: string[];
    /** Area-planner proposals are new areas, not listed sites: shown as a custom region of this size. */
    area?: { lat: number; lon: number; half_size_m: number };
  };
  backup_zones: { id: string; area_km2: number; distance_m: number; direction: string; decide_by_s: number }[];
  backup_regions: { site_id: string; name: string; landing_time: string; vetoes: string[]; area?: { lat: number; lon: number; half_size_m: number } }[];
  rationale: string;
  concerns: string[];
  table: { option: string; site_id: string; name: string; time: string; points: number; vetoes: string[]; viable_km2: number; votes: Record<string, string> }[];
}

export interface AgentEvent {
  seq: number;
  t: number;
  agent: AgentId;
  kind: "roster" | "say" | "tool" | "tool_done" | "report" | "handoff" | "vote" | "think" | "decision" | "error";
  text: string;
  to?: AgentId;
  vote?: Vote;
  site_id?: string;
  roster?: AgentInfo[];
  llm?: string | null;
  decision?: AgentDecision | null;
  headline?: string;
}

/** Run the agent team; calls onEvent for every streamed event. Resolves when the stream ends. */
export async function runAgents(start: string, days: number, stayHours: number, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  const url = `${API_URL}/api/agents/run?start=${encodeURIComponent(start)}&days=${days}&stay_hours=${stayHours}`;
  const r = await fetch(url, { headers: BACKEND_HEADERS, signal });
  if (!r.ok || !r.body) throw new Error(`Mission control unavailable (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line) as AgentEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as AgentEvent);
}

/** How long an event stays on stage before the next one plays (ms at 1x), so people can follow it. */
export function dwellMs(e: AgentEvent): number {
  switch (e.kind) {
    case "roster":
      return 0;
    case "tool":
      return 260;
    case "tool_done":
      return 60;
    case "vote":
      return 650;
    case "handoff":
      return 900;
    case "think":
      return 1200;
    case "decision":
      return 0;
    default:
      return Math.min(3200, 1200 + e.text.length * 12);
  }
}

// ----------------------------------------------------------------------------- area planner
/**
 * The crew acts out the area planner (POST /api/plan/area): the user circles an area and states a
 * goal; a GPT-6 Luna agent researches it with the backend's tools. Its steps are mapped onto the
 * crew: the model's reasoning is the Flight Director, each tool is the specialist who owns that job.
 */
const TOOL_AGENT: Record<string, AgentId> = {
  list_candidates: "scout",
  cold_traps: "scout",
  survey: "power",
  stay_conditions: "power",
  landing_timeline: "timing",
  landing_zones: "terrain",
};

type PlanProposal = {
  candidate_id: string;
  title: string;
  time: string;
  area: { lat: number; lon: number; half_size_m: number };
  zone: { id: string; lat: number; lon: number; area_km2: number; mean_success: number };
  viable_share: number;
  rationale: string;
  risks: string;
};
type PlanEvent = { t: number; kind: string; text: string; name?: string; llm?: string; candidates?: { id: string; lat: number; lon: number; half_size_m: number }[]; proposals?: PlanProposal[] };

export async function runAreaPlan(
  polygon: [number, number][],
  request: string,
  start: string,
  days: number,
  stayHours: number,
  onEvent: (e: AgentEvent) => void,
  onOverlay: (o: { candidates: { id: string; lat: number; lon: number; half_size_m: number }[]; proposals: { lat: number; lon: number; title: string }[] }) => void,
  signal?: AbortSignal,
) {
  const r = await fetch(`${API_URL}/api/plan/area`, {
    method: "POST",
    headers: { ...BACKEND_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ polygon, request, start, days, stay_hours: stayHours }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`Planner unavailable (${r.status})`);
  let seq = 0;
  let model: string | null = null;
  let cands: { id: string; lat: number; lon: number; half_size_m: number }[] = [];
  const emit = (e: Omit<AgentEvent, "seq">) => onEvent({ ...e, seq: seq++ });
  const handle = (p: PlanEvent) => {
    const t = p.t;
    switch (p.kind) {
      case "status":
        if (p.llm) model = p.llm;
        emit({ t, agent: "chief", kind: "say", text: p.text, llm: p.llm ?? undefined });
        break;
      case "candidates":
        cands = p.candidates ?? [];
        onOverlay({ candidates: cands, proposals: [] });
        emit({ t, agent: "chief", kind: "handoff", to: "scout", text: "Ada, split the circled area into landing candidates." });
        emit({ t, agent: "scout", kind: "report", text: p.text });
        break;
      case "think":
        emit({ t, agent: "chief", kind: "think", text: p.text });
        break;
      case "tool": {
        const who = TOOL_AGENT[p.name ?? ""] ?? "scout";
        emit({ t, agent: "chief", kind: "handoff", to: who, text: `${p.name?.replace(/_/g, " ")}` });
        emit({ t, agent: who, kind: "tool", text: p.text });
        break;
      }
      case "tool_result": {
        const who = TOOL_AGENT[p.name ?? ""] ?? "scout";
        emit({ t, agent: who, kind: "tool_done", text: "" });
        emit({ t, agent: who, kind: "report", text: p.text });
        break;
      }
      case "error":
        emit({ t, agent: "chief", kind: "error", text: p.text });
        break;
      case "proposals": {
        const ps = p.proposals ?? [];
        onOverlay({ candidates: cands, proposals: ps.map((x) => ({ lat: x.zone.lat, lon: x.zone.lon, title: x.title })) });
        const [best, ...rest] = ps;
        const decision: AgentDecision | null = best
          ? {
              go: true,
              decided_by: model ?? "rules",
              primary: { site_id: `plan-${best.candidate_id}`, name: best.title, landing_time: best.time, zone: best.zone, vetoes: [], area: best.area },
              backup_zones: [],
              backup_regions: rest.map((x) => ({ site_id: `plan-${x.candidate_id}`, name: x.title, landing_time: x.time, vetoes: [], area: x.area })),
              rationale: (p.text ? p.text + " " : "") + best.rationale,
              concerns: ps.map((x) => x.risks).filter(Boolean),
              table: [],
            }
          : null;
        emit({ t, agent: "chief", kind: "decision", text: p.text, decision, headline: best ? `Land at ${best.title}` : "No landing spot passed the checks" });
        break;
      }
    }
  };
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) handle(JSON.parse(line) as PlanEvent);
    }
  }
}
