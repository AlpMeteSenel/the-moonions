"use client";

import { create } from "zustand";
import { api, type EvalOptions } from "./api";
import type { AIAssessment, AIPlan, AITimeline, RegionAnalysis, RegionSummary, RegionTimeline, Evaluation, ModelCard, Profile, Proposal, Site, SunState, Timeline } from "./types";

export type View = "globe" | "site";
export type Panel = "planner" | "compare" | "proposals" | null;
export type CameraPreset = "moon" | "pole" | "region";

function roundHour(d = new Date()) {
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

const CUSTOM_KEY = "moonions.custom-sites";

function loadCustom(): Site[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveCustom(sites: Site[]) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(sites.filter((s) => s.custom)));
  } catch {
    /* storage unavailable */
  }
}

interface State {
  sites: Site[];
  selectedId: string | null;
  focusBackup: string | null;
  landingTime: string;
  profile: Profile;
  divertRadius: number;
  missionHours: number;
  view: View;
  panel: Panel;
  showHazard: boolean;
  realLighting: boolean;
  compareIds: string[];
  evals: Record<string, Evaluation>;
  loading: Record<string, boolean>;
  errors: Record<string, string>;
  timelines: Record<string, Timeline>;
  sun: SunState | null;
  proposals: Proposal[];
  suggesting: boolean;
  placing: boolean;
  siteStatus: string | null;
  ai: Record<string, AIAssessment>;
  aiLoading: Record<string, boolean>;
  modelCard: ModelCard | null;
  plan: AIPlan | null;
  planning: boolean;
  planError: string | null;
  planSiteIds: string[];
  showAiMap: boolean;
  showModelCard: boolean;
  aiTimelines: Record<string, AITimeline>;
  aiMapStatus: "loading" | "ready" | null;
  regions: Record<string, RegionAnalysis>;
  regionLoading: Record<string, boolean>;
  regionTimelines: Record<string, RegionTimeline>;
  focusZone: string | null;
  summaries: Record<string, Record<string, RegionSummary>>;
  cameraPreset: { kind: CameraPreset; nonce: number };
  showHistoric: boolean;

  init: () => Promise<void>;
  select: (id: string | null) => void;
  setFocusBackup: (id: string | null) => void;
  setLandingTime: (iso: string) => void;
  setProfile: (p: Profile) => void;
  setDivertRadius: (m: number) => void;
  setView: (v: View) => void;
  setPanel: (p: Panel) => void;
  toggleHazard: () => void;
  toggleLighting: () => void;
  togglePlacing: () => void;
  toggleCompare: (id: string) => void;
  addCustom: (lat: number, lon: number, name?: string) => string;
  removeSite: (id: string) => void;
  promoteBackup: (siteId: string, backupId: string) => void;
  evaluate: (id: string) => Promise<Evaluation | undefined>;
  loadTimeline: (id: string) => Promise<void>;
  suggestAround: (id: string) => Promise<void>;
  refreshSun: () => Promise<void>;
  loadProposals: () => Promise<void>;
  propose: (id: string, notes?: string) => Promise<Proposal | undefined>;
  decide: (pid: string, status: Proposal["status"], notes?: string) => Promise<void>;
  deleteProposal: (pid: string) => Promise<void>;
  openProposal: (p: Proposal) => Promise<void>;
  assess: (id: string) => Promise<void>;
  loadModelCard: () => Promise<void>;
  togglePlanSite: (id: string) => void;
  runPlan: (days?: number, stepHours?: number) => Promise<void>;
  applyPlan: () => void;
  setLandingTimeAndSelect: (id: string, iso: string) => void;
  toggleAiMap: () => void;
  setShowModelCard: (v: boolean) => void;
  loadAiTimeline: (id: string) => Promise<void>;
  loadRegion: (id: string) => Promise<void>;
  loadRegionTimeline: (id: string) => Promise<void>;
  setFocusZone: (id: string | null) => void;
  setRegionSize: (id: string, half_size_m: number) => void;
  loadSummaries: () => Promise<void>;
  setCameraPreset: (kind: CameraPreset) => void;
  toggleHistoric: () => void;
}

/** Hour key used for map summaries (backend caches the polar AI map per hour). */
export const hourOf = (iso: string) => iso.slice(0, 13) + ":00:00Z";

export const DEFAULT_HALF_SIZE = 3000;
export const halfSizeOf = (site: { half_size_m?: number }) => site.half_size_m ?? DEFAULT_HALF_SIZE;
export const regionKey = (id: string, landingTime: string, half: number) => `${id}|${landingTime}|${half}`;

/** AI timelines start at 00:00 UTC two days before the touchdown time (stable while scrubbing). */
export function aiTimelineKey(id: string, landingTime: string) {
  const d = new Date(landingTime);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 2);
  return { key: `${id}|${d.toISOString().slice(0, 10)}`, start: d.toISOString() };
}

export const aiKey = (id: string, landingTime: string) => `${id}|${landingTime}`;

export const evalKey = (id: string, s: Pick<State, "landingTime" | "profile" | "divertRadius" | "missionHours">) =>
  `${id}|${s.landingTime}|${s.profile}|${s.divertRadius}|${s.missionHours}`;

const inflight = new Map<string, Promise<Evaluation | undefined>>();

export const useStore = create<State>((set, get) => ({
  sites: [],
  selectedId: null,
  focusBackup: null,
  landingTime: roundHour(),
  profile: "balanced",
  divertRadius: 3000,
  missionHours: 156,
  view: "globe",
  panel: null,
  showHazard: false,
  realLighting: true,
  compareIds: [],
  evals: {},
  loading: {},
  errors: {},
  timelines: {},
  sun: null,
  proposals: [],
  suggesting: false,
  placing: false,
  siteStatus: null,
  ai: {},
  aiLoading: {},
  modelCard: null,
  plan: null,
  planning: false,
  planError: null,
  planSiteIds: [],
  showAiMap: true,
  showModelCard: false,
  aiTimelines: {},
  aiMapStatus: null,
  regions: {},
  regionLoading: {},
  regionTimelines: {},
  focusZone: null,
  summaries: {},
  cameraPreset: { kind: "pole", nonce: 0 },
  showHistoric: false,

  init: async () => {
    // the module-level default was computed when the module loaded (on the server: possibly hours
    // ago); start the session at the current hour on the client
    set({ landingTime: roundHour() });
    const [sites] = await Promise.all([api.sites(), get().refreshSun(), get().loadProposals(), get().loadModelCard()]);
    const all = [...sites, ...loadCustom()];
    set({ sites: all, planSiteIds: all.filter((x) => x.group === "Artemis III region").map((x) => x.id) });
    void get().loadSummaries();
  },

  select: (id) => {
    set({ selectedId: id, focusBackup: null });
    if (id) {
      void get().evaluate(id);
      void get().loadTimeline(id);
      void get().assess(id);
      void get().loadAiTimeline(id);
      void get().loadRegion(id);
      void get().loadRegionTimeline(id);
    }
  },
  setFocusBackup: (id) => set({ focusBackup: id }),
  setLandingTime: (iso) => {
    set({ landingTime: iso });
    void get().refreshSun();
    void get().loadSummaries();
    const { selectedId, compareIds } = get();
    if (selectedId) {
      void get().evaluate(selectedId);
      void get().assess(selectedId);
      void get().loadRegion(selectedId);
    }
    compareIds.forEach((c) => void get().evaluate(c));
  },
  setProfile: (p) => {
    set({ profile: p });
    const { selectedId } = get();
    if (selectedId) void get().evaluate(selectedId);
    get().compareIds.forEach((c) => void get().evaluate(c));
  },
  setDivertRadius: (m) => {
    set({ divertRadius: m });
    const { selectedId } = get();
    if (selectedId) void get().evaluate(selectedId);
  },
  setView: (v) => set({ view: v }),
  setPanel: (p) => set({ panel: get().panel === p ? null : p }),
  toggleHazard: () => set({ showHazard: !get().showHazard }),
  toggleLighting: () => set({ realLighting: !get().realLighting }),
  togglePlacing: () => set({ placing: !get().placing }),
  toggleCompare: (id) => {
    const ids = get().compareIds;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-6);
    set({ compareIds: next });
    if (!ids.includes(id)) void get().evaluate(id);
  },

  addCustom: (lat, lon, name) => {
    const id = `custom-${Date.now().toString(36)}`;
    const site: Site = { id, name: name ?? `Custom ${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, group: "My candidates", custom: true, half_size_m: DEFAULT_HALF_SIZE };
    const sites = [...get().sites, site];
    set({ sites, placing: false });
    saveCustom(sites);
    get().select(id);
    return id;
  },
  promoteBackup: (siteId, backupId) => {
    const s = get();
    const site = s.sites.find((x) => x.id === siteId);
    const b = s.evals[evalKey(siteId, s)]?.backups?.find((x) => x.id === backupId);
    if (!site || !b) return;
    get().addCustom(b.lat, b.lon, `${site.name.split(" · ")[0]} · ${b.id} ${b.direction}`);
    set({ view: "site" });
  },
  removeSite: (id) => {
    const sites = get().sites.filter((s) => s.id !== id);
    set({ sites, compareIds: get().compareIds.filter((c) => c !== id), selectedId: get().selectedId === id ? null : get().selectedId });
    saveCustom(sites);
  },

  evaluate: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const key = evalKey(id, s);
    if (s.evals[key]) return s.evals[key];
    if (inflight.has(key)) return inflight.get(key);
    const opts: EvalOptions = { landing_time: s.landingTime, profile: s.profile, divert_radius_m: s.divertRadius, mission_hours: s.missionHours };
    set({ loading: { ...get().loading, [id]: true } });
    const p = api
      .evaluate(site.lat, site.lon, opts)
      .then((ev) => {
        set({ evals: { ...get().evals, [key]: ev }, errors: { ...get().errors, [id]: "" } });
        return ev;
      })
      .catch((e: Error) => {
        set({ errors: { ...get().errors, [id]: e.message } });
        return undefined;
      })
      .finally(() => {
        inflight.delete(key);
        set({ loading: { ...get().loading, [id]: false } });
      });
    inflight.set(key, p);
    return p;
  },

  loadTimeline: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    // timeline always starts at the beginning of the landing-time's day so it doesn't jump around
    const start = new Date(s.landingTime);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - 2);
    const key = `${id}|${start.toISOString().slice(0, 10)}|${s.missionHours}`;
    if (s.timelines[key]) return;
    const tl = await api.timeline(site.lat, site.lon, start.toISOString(), 32, s.missionHours);
    set({ timelines: { ...get().timelines, [key]: tl } });
  },

  suggestAround: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    set({ suggesting: true });
    try {
      const res = await api.suggest(site.lat, site.lon, {
        landing_time: s.landingTime,
        profile: s.profile,
        divert_radius_m: s.divertRadius,
        mission_hours: s.missionHours,
      });
      const added: Site[] = res.map((ev, i) => ({
        id: `${id}-best-${i + 1}-${Date.now().toString(36)}`,
        name: `${site.name.split(" · ")[0]} · option ${String.fromCharCode(65 + i)}`,
        lat: ev.lat,
        lon: ev.lon,
        group: "My candidates",
        custom: true,
      }));
      const evals = { ...get().evals };
      added.forEach((a, i) => (evals[evalKey(a.id, get())] = res[i]));
      const sites = [...get().sites, ...added];
      set({ sites, evals, compareIds: added.map((a) => a.id), panel: "compare" });
      saveCustom(sites);
      if (added[0]) get().select(added[0].id);
    } finally {
      set({ suggesting: false });
    }
  },

  refreshSun: async () => {
    try {
      set({ sun: await api.sun(get().landingTime) });
    } catch {
      /* backend offline */
    }
  },
  loadProposals: async () => {
    try {
      set({ proposals: await api.proposals() });
    } catch {
      /* backend offline */
    }
  },
  propose: async (id, notes = "") => {
    const s = get();
    const ev = s.evals[evalKey(id, s)];
    const site = s.sites.find((x) => x.id === id);
    if (!ev || !site) return;
    const p = await api.createProposal(site.name, { ...ev, id: site.id, name: site.name }, notes);
    await get().loadProposals();
    set({ panel: "proposals" });
    return p;
  },
  decide: async (pid, status, notes) => {
    await api.updateProposal(pid, { status, ...(notes !== undefined ? { notes } : {}) });
    await get().loadProposals();
  },
  deleteProposal: async (pid) => {
    await api.deleteProposal(pid);
    await get().loadProposals();
  },
  assess: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const key = aiKey(id, s.landingTime);
    if (s.ai[key] || s.aiLoading[key]) return;
    set({ aiLoading: { ...get().aiLoading, [key]: true } });
    try {
      const res = await api.assess(site.lat, site.lon, s.landingTime);
      set({ ai: { ...get().ai, [key]: res } });
    } catch {
      set({ ai: { ...get().ai, [key]: { available: false } } });
    } finally {
      set({ aiLoading: { ...get().aiLoading, [key]: false } });
    }
  },
  loadModelCard: async () => {
    try {
      set({ modelCard: await api.modelCard() });
    } catch {
      set({ modelCard: { available: false } });
    }
  },
  togglePlanSite: (id) => {
    const ids = get().planSiteIds;
    set({ planSiteIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-12) });
  },
  runPlan: async (days = 30, stepHours = 12) => {
    const s = get();
    const sites = s.sites.filter((x) => s.planSiteIds.includes(x.id)).map(({ id, name, lat, lon, half_size_m }) => ({ id, name, lat, lon, half_size_m: half_size_m ?? DEFAULT_HALF_SIZE }));
    if (!sites.length) return;
    set({ planning: true, planError: null, panel: "planner" });
    try {
      const plan = await api.recommend({ sites, start: s.landingTime, days, step_hours: stepHours, divert_radius_m: s.divertRadius });
      set({ plan });
    } catch (e) {
      set({ planError: (e as Error).message });
    } finally {
      set({ planning: false });
    }
  },
  applyPlan: () => {
    const plan = get().plan;
    if (!plan?.available) return;
    get().setLandingTimeAndSelect(plan.primary.site_id, plan.primary.landing_time);
  },
  setLandingTimeAndSelect: (id, iso) => {
    set({ landingTime: iso });
    void get().refreshSun();
    get().select(id);
  },
  toggleAiMap: () => set({ showAiMap: !get().showAiMap }),
  setShowModelCard: (v) => set({ showModelCard: v }),
  loadRegion: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const key = regionKey(id, s.landingTime, halfSizeOf(site));
    if (s.regions[key] || s.regionLoading[key]) return;
    set({ regionLoading: { ...get().regionLoading, [key]: true } });
    try {
      const r = await api.region(site.lat, site.lon, halfSizeOf(site), s.landingTime);
      set({ regions: { ...get().regions, [key]: r } });
    } catch {
      set({ regions: { ...get().regions, [key]: { available: false } as RegionAnalysis } });
    } finally {
      set({ regionLoading: { ...get().regionLoading, [key]: false } });
    }
  },
  loadRegionTimeline: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const { key, start } = aiTimelineKey(id, s.landingTime);
    const k = `${key}|${halfSizeOf(site)}`;
    if (s.regionTimelines[k]) return;
    try {
      const tl = await api.regionTimeline(site.lat, site.lon, halfSizeOf(site), start, 32, 6);
      set({ regionTimelines: { ...get().regionTimelines, [k]: tl } });
    } catch {
      /* AI offline */
    }
  },
  setFocusZone: (id) => set({ focusZone: id }),
  loadSummaries: async () => {
    const s = get();
    const hour = hourOf(s.landingTime);
    if (s.summaries[hour]) return;
    const regions = s.sites.filter((x) => x.group !== "Historic landing").map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, half_size_m: halfSizeOf(x) }));
    if (!regions.length) return;
    try {
      const res = await api.regionsSummary(regions, hour);
      set({ summaries: { ...get().summaries, [hour]: Object.fromEntries(res.regions.map((r) => [r.id, r])) } });
    } catch {
      /* AI offline */
    }
  },
  setCameraPreset: (kind) => set({ cameraPreset: { kind, nonce: get().cameraPreset.nonce + 1 } }),
  toggleHistoric: () => set({ showHistoric: !get().showHistoric }),
  setRegionSize: (id, half) => {
    const sites = get().sites.map((x) => (x.id === id ? { ...x, half_size_m: half } : x));
    set({ sites });
    saveCustom(sites);
    void get().loadRegion(id);
    void get().loadRegionTimeline(id);
  },
  loadAiTimeline: async (id) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const { key, start } = aiTimelineKey(id, s.landingTime);
    if (s.aiTimelines[key]) return;
    try {
      const tl = await api.aiTimeline(site.lat, site.lon, start, 32, 6);
      set({ aiTimelines: { ...get().aiTimelines, [key]: tl } });
    } catch {
      /* AI offline */
    }
  },
  openProposal: async (p) => {
    const full = await api.proposal(p.id);
    const ev = full.evaluation!;
    let site = get().sites.find((s) => Math.abs(s.lat - p.lat) < 1e-6 && Math.abs(s.lon - p.lon) < 1e-6);
    if (!site) {
      site = { id: `prop-${p.id}`, name: p.name, lat: p.lat, lon: p.lon, group: "My candidates", custom: true };
      const sites = [...get().sites, site];
      set({ sites });
      saveCustom(sites);
    }
    set({ landingTime: p.landing_time, profile: p.profile, divertRadius: ev.divert?.radius_m ?? get().divertRadius });
    set({ evals: { ...get().evals, [evalKey(site.id, get())]: ev } });
    void get().refreshSun();
    get().select(site.id);
  },
}));

export function useSelected() {
  return useStore((s) => s.sites.find((x) => x.id === s.selectedId) ?? null);
}

export function useEval(id: string | null | undefined) {
  return useStore((s) => (id ? s.evals[evalKey(id, s)] : undefined));
}

export function useAI(id: string | null | undefined) {
  return useStore((s) => (id ? s.ai[aiKey(id, s.landingTime)] : undefined));
}

export function useAILoading(id: string | null | undefined) {
  return useStore((s) => (id ? Boolean(s.aiLoading[aiKey(id, s.landingTime)]) : false));
}

export function useRegion(id: string | null | undefined) {
  return useStore((s) => {
    const site = id ? s.sites.find((x) => x.id === id) : undefined;
    return site ? s.regions[regionKey(site.id, s.landingTime, halfSizeOf(site))] : undefined;
  });
}

export function useRegionLoading(id: string | null | undefined) {
  return useStore((s) => {
    const site = id ? s.sites.find((x) => x.id === id) : undefined;
    return site ? Boolean(s.regionLoading[regionKey(site.id, s.landingTime, halfSizeOf(site))]) : false;
  });
}

export function useRegionTimeline(id: string | null | undefined) {
  return useStore((s) => {
    const site = id ? s.sites.find((x) => x.id === id) : undefined;
    return site ? s.regionTimelines[`${aiTimelineKey(site.id, s.landingTime).key}|${halfSizeOf(site)}`] : undefined;
  });
}
