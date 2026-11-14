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
  primary: { site_id: string; name: string; landing_time: string; zone: { id: string; lat: number; lon: number; area_km2: number; mean_success: number } | null; vetoes: string[] };
  backup_zones: { id: string; area_km2: number; distance_m: number; direction: string; decide_by_s: number }[];
  backup_regions: { site_id: string; name: string; landing_time: string; vetoes: string[] }[];
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
