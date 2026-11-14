import { BACKEND_HEADERS } from "./net";
import type { AIAssessment, AIPlan, AISiteMap, AITimeline, Conditions, RegionAnalysis, RegionSummary, RegionTimeline, Evaluation, Health, ModelCard, Profile, Proposal, Site, SunState, TerrainPatch, Timeline } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const texture = (name: string) => `${API_URL}/static/textures/${name}`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...BACKEND_HEADERS, ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export interface EvalOptions {
  landing_time: string;
  profile: Profile;
  divert_radius_m: number;
  mission_hours: number;
}

export const api = {
  health: () => req<Health>("/api/health"),
  sites: () => req<Site[]>("/api/sites"),
  conditions: (lat: number, lon: number, start: string, days = 14, mission_hours = 156) =>
    req<Conditions>(`/api/conditions?lat=${lat}&lon=${lon}&start=${encodeURIComponent(start)}&days=${days}&step_min=10&mission_hours=${mission_hours}`),
  sun: (time: string) => req<SunState>(`/api/sun?time=${encodeURIComponent(time)}`),
  evaluate: (lat: number, lon: number, o: EvalOptions, signal?: AbortSignal) =>
    req<Evaluation>("/api/evaluate", { method: "POST", body: JSON.stringify({ lat, lon, ...o }), signal }),
  suggest: (lat: number, lon: number, o: EvalOptions, region_radius_m = 7500, n = 4) =>
    req<Evaluation[]>("/api/suggest", { method: "POST", body: JSON.stringify({ lat, lon, region_radius_m, n, ...o }) }),
  compare: (sites: { id: string; name: string; lat: number; lon: number }[], o: EvalOptions) =>
    req<Evaluation[]>("/api/compare", { method: "POST", body: JSON.stringify({ sites, ...o }) }),
  timeline: (lat: number, lon: number, start: string, days = 30, mission_hours = 156) =>
    req<Timeline>(
      `/api/timeline?lat=${lat}&lon=${lon}&start=${encodeURIComponent(start)}&days=${days}&step_hours=2&mission_hours=${mission_hours}`,
    ),
  terrain: (lat: number, lon: number, half_size_m: number, cells = 161) =>
    req<TerrainPatch>(`/api/terrain?lat=${lat}&lon=${lon}&half_size_m=${half_size_m}&cells=${cells}`),
  proposals: () => req<Proposal[]>("/api/proposals"),
  proposal: (id: string) => req<Proposal>(`/api/proposals/${id}`),
  createProposal: (name: string, evaluation: Evaluation, notes = "") =>
    req<Proposal>("/api/proposals", { method: "POST", body: JSON.stringify({ name, evaluation, notes }) }),
  updateProposal: (id: string, patch: Partial<Pick<Proposal, "status" | "notes" | "decided_by" | "name">>) =>
    req<Proposal>(`/api/proposals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteProposal: (id: string) => req<{ ok: boolean }>(`/api/proposals/${id}`, { method: "DELETE" }),

  // AI (docs/AI_API.md)
  modelCard: () => req<ModelCard>("/api/ai/model-card"),
  assess: (lat: number, lon: number, landing_time: string, signal?: AbortSignal) =>
    req<AIAssessment>("/api/ai/assess", { method: "POST", body: JSON.stringify({ lat, lon, landing_time }), signal }),
  recommend: (body: { sites: { id: string; name: string; lat: number; lon: number; half_size_m?: number }[]; start: string; days: number; step_hours: number; divert_radius_m: number; n_backups?: number }) =>
    req<AIPlan>("/api/ai/recommend", { method: "POST", body: JSON.stringify(body) }),
  regionsSummary: (regions: { id: string; lat: number; lon: number; half_size_m?: number }[], time: string) =>
    req<{ time: string; regions: RegionSummary[] }>("/api/regions/summary", { method: "POST", body: JSON.stringify({ regions, time }) }),
  region: (lat: number, lon: number, half_size_m: number, landing_time: string, cells = 61) =>
    req<RegionAnalysis>(`/api/regions/analyze?lat=${lat}&lon=${lon}&half_size_m=${half_size_m}&landing_time=${encodeURIComponent(landing_time)}&cells=${cells}`),
  regionTimeline: (lat: number, lon: number, half_size_m: number, start: string, days = 32, step_hours = 6) =>
    req<RegionTimeline>(`/api/regions/timeline?lat=${lat}&lon=${lon}&half_size_m=${half_size_m}&start=${encodeURIComponent(start)}&days=${days}&step_hours=${step_hours}`),
  aiTimeline: (lat: number, lon: number, start: string, days = 30, step_hours = 6) =>
    req<AITimeline>(`/api/ai/timeline?lat=${lat}&lon=${lon}&start=${encodeURIComponent(start)}&days=${days}&step_hours=${step_hours}`),
  siteMap: (lat: number, lon: number, landing_time: string, half_size_m: number, cells = 25) =>
    req<AISiteMap>(`/api/ai/site-map?lat=${lat}&lon=${lon}&landing_time=${encodeURIComponent(landing_time)}&half_size_m=${half_size_m}&cells=${cells}`),
};
