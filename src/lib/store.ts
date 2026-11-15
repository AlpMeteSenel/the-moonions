"use client";

import { create } from "zustand";
import { api, type EvalOptions } from "./api";
import type { AIAssessment, AIPlan, AITimeline, Conditions, RegionAnalysis, RegionSummary, RegionTimeline, Evaluation, ModelCard, Profile, Proposal, Site, SunState, Timeline } from "./types";

export type View = "globe" | "site";
export type Panel = "crew" | "planner" | "compare" | "proposals" | null;

/** An area outlined on the Moon: [lat, lon] vertices (closed implicitly). */
export interface PlanArea {
  points: [number, number][];
  area_km2: number;
}
export interface PlanOverlay {
  candidates: { id: string; lat: number; lon: number; half_size_m: number }[];
  proposals: { lat: number; lon: number; title: string }[];
}
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
  /** Start of the visible month-long time track. Stays put while the chosen time is inside it,
   *  so dragging the time doesn't re-centre the track under the cursor. */
  timeAnchor: string;
  profile: Profile;
  divertRadius: number;
  missionHours: number;
  view: View;
  panel: Panel;
  showHazard: boolean;
  realLighting: boolean;
  compareIds: string[];
  /** Extra comparison options: a site at the planned time shifted by offsetH (date slips). */
  compareSlips: { siteId: string; offsetH: number }[];
  conditions: Record<string, Conditions>;
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
  /** Latest result per site (any time): shown while the result for a new time is loading. */
  lastEval: Record<string, Evaluation>;
  lastAi: Record<string, AIAssessment>;
  lastRegion: Record<string, RegionAnalysis>;
  lastSummaries: Record<string, RegionSummary> | undefined;
  cameraPreset: { kind: CameraPreset; nonce: number };
  showHistoric: boolean;

  init: () => Promise<void>;
  select: (id: string | null) => void;
  setFocusBackup: (id: string | null) => void;
  setLandingTime: (iso: string) => void;
  /** Fetch everything that depends on the touchdown time (debounced from setLandingTime). */
  fetchForTime: () => void;
  /** The touchdown time once scrubbing settles: drives heavy downloads such as the AI map image. */
  settledTime: string;
  setProfile: (p: Profile) => void;
  setDivertRadius: (m: number) => void;
  setView: (v: View) => void;
  setPanel: (p: Panel) => void;
  toggleHazard: () => void;
  toggleLighting: () => void;
  togglePlacing: () => void;
  toggleCompare: (id: string) => void;
  addSlip: (siteId: string, offsetH: number) => void;
  removeSlip: (siteId: string, offsetH: number) => void;
  loadConditions: (siteId: string, iso: string) => Promise<void>;
  addCustom: (lat: number, lon: number, name?: string) => string;
  removeSite: (id: string) => void;
  promoteBackup: (siteId: string, backupId: string) => void;
  evaluate: (id: string) => Promise<Evaluation | undefined>;
  loadTimeline: (id: string) => Promise<void>;
  suggestAround: (id: string) => Promise<void>;
  refreshSun: () => Promise<void>;
  /** Sun/Earth sub-points over the time track: lighting follows the time without a request. */
  sunTrack: { start: number; step: number; pts: [number, number, number, number][] } | null;
  sunTrackAnchor: string | null;
  loadSunTrack: () => Promise<void>;
  /** Area planner: drawing mode, the circled area and what the agent found (shown on the globe). */
  drawingArea: boolean;
  planArea: PlanArea | null;
  /** Vertices placed so far while drawing, and the point under the cursor (rubber band). */
  planDraft: [number, number][];
  planHover: [number, number] | null;
  planOverlay: PlanOverlay | null;
  setDrawingArea: (on: boolean) => void;
  setPlanArea: (a: PlanArea | null) => void;
  setPlanOverlay: (o: PlanOverlay | null) => void;
  playing: boolean;
  /** Playback speed, hours of mission time per second. */
  playSpeed: number;
  setPlaying: (on: boolean) => void;
  setPlaySpeed: (h: number) => void;
  /** Advance playback by one frame (no full refresh; the AI map and region colours follow, throttled). */
  playStep: (hours: number) => void;
  /** Move playback to an absolute hour (panels, zones, AI colours). */
  playTo: (iso: string) => void;
  /** Move only the Sun to a fractional time (every display frame while playing). */
  playSun: (ms: number) => void;
  /** Fetch the selected region's analysis for the day block holding `iso` in one request (24 h). */
  prefetchRange: (id: string, iso: string) => Promise<void>;
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
  loadSummaries: (iso?: string) => Promise<void>;
  setCameraPreset: (kind: CameraPreset) => void;
  toggleHistoric: () => void;
}

/** Hour key used for map summaries (backend caches the polar AI map per hour). */
export const hourOf = (iso: string) => iso.slice(0, 13) + ":00:00Z";

export const DEFAULT_HALF_SIZE = 3000;
export const halfSizeOf = (site: { half_size_m?: number }) => site.half_size_m ?? DEFAULT_HALF_SIZE;
export const regionKey = (id: string, landingTime: string, half: number) => `${id}|${landingTime}|${half}`;

/** AI timelines start at 00:00 UTC two days before the touchdown time (stable while scrubbing). */
export const TRACK_DAYS = 32;

/** Track start for a time: midnight UTC two days before it. */
function anchorFor(landingTime: string) {
  const d = new Date(landingTime);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString();
}

/** Keep the current track while the time is comfortably inside it; otherwise start a new one. */
export function keepAnchor(landingTime: string, anchor: string | undefined) {
  if (!anchor) return anchorFor(landingTime);
  const t = new Date(landingTime).getTime();
  const a = new Date(anchor).getTime();
  return t >= a && t <= a + (TRACK_DAYS - 1) * 86400e3 ? anchor : anchorFor(landingTime);
}

/** Timelines are fetched per track (site + track start), not per touchdown time. */
export function aiTimelineKey(id: string, anchor: string) {
  return { key: `${id}|${anchor.slice(0, 10)}`, start: anchor };
}

export const aiKey = (id: string, landingTime: string) => `${id}|${landingTime}`;

export const evalKey = (id: string, s: Pick<State, "landingTime" | "profile" | "divertRadius" | "missionHours">) =>
  `${id}|${s.landingTime}|${s.profile}|${s.divertRadius}|${s.missionHours}`;

let timeTimer: ReturnType<typeof setTimeout> | null = null;
let lastFrameFetch = 0;
const rangeDone = new Set<string>();
const BLOCK_H = 24;
const blockStart = (iso: string) => {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Sun/Earth sub-points at a time from the track (linear, longitude unwrapped), or null outside it. */
function sunAt(track: State["sunTrack"], iso: string): SunState | null {
  if (!track) return null;
  const f = (new Date(iso).getTime() - track.start) / (track.step * 3600e3);
  if (f < 0 || f > track.pts.length - 1) return null;
  const i = Math.min(track.pts.length - 2, Math.floor(f));
  const u = f - i;
  const a = track.pts[i];
  const b = track.pts[i + 1];
  const lon = (p: number, q: number) => {
    let d = q - p;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const v = p + d * u;
    return ((v + 540) % 360) - 180;
  };
  return { time: iso, sun_lat: a[0] + (b[0] - a[0]) * u, sun_lon: lon(a[1], b[1]), earth_lat: a[2] + (b[2] - a[2]) * u, earth_lon: lon(a[3], b[3]) };
}
const inflight = new Map<string, Promise<Evaluation | undefined>>();
const condInflight = new Set<string>();
const sumInflight = new Set<string>();

export const useStore = create<State>((set, get) => ({
  sites: [],
  selectedId: null,
  focusBackup: null,
  landingTime: roundHour(),
  timeAnchor: anchorFor(roundHour()),
  settledTime: roundHour(),
  profile: "balanced",
  divertRadius: 3000,
  missionHours: 156,
  view: "globe",
  panel: null,
  showHazard: false,
  realLighting: true,
  compareIds: [],
  compareSlips: [],
  conditions: {},
  evals: {},
  loading: {},
  errors: {},
  timelines: {},
  sun: null,
  sunTrack: null,
  sunTrackAnchor: null,
  drawingArea: false,
  planArea: null,
  planDraft: [],
  planHover: null,
  planOverlay: null,
  setDrawingArea: (on) => set({ drawingArea: on, planDraft: [], planHover: null }),
  setPlanArea: (a) => set({ planArea: a, planOverlay: null, drawingArea: false, planDraft: [], planHover: null }),
  setPlanOverlay: (o) => set({ planOverlay: o }),
  playing: false,
  playSpeed: 6,
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
  lastEval: {},
  lastAi: {},
  lastRegion: {},
  lastSummaries: undefined,
  cameraPreset: { kind: "pole", nonce: 0 },
  showHistoric: false,

  init: async () => {
    // the module-level default was computed when the module loaded (on the server: possibly hours
    // ago); start the session at the current hour on the client
    const now = roundHour();
    set({ landingTime: now, settledTime: now, timeAnchor: anchorFor(now) });
    const [sites] = await Promise.all([api.sites(), get().loadSunTrack().then(() => get().refreshSun()), get().loadProposals(), get().loadModelCard()]);
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
    const anchor = keepAnchor(iso, get().timeAnchor);
    set({ landingTime: iso, timeAnchor: anchor, sun: sunAt(get().sunTrack, iso) ?? get().sun });
    if (anchor !== get().sunTrackAnchor) void get().loadSunTrack();
    // scrubbing fires this many times a second: fetch once the time settles; until then the
    // last results stay on screen
    if (timeTimer) clearTimeout(timeTimer);
    timeTimer = setTimeout(() => {
      timeTimer = null;
      get().fetchForTime();
    }, 180);
  },
  fetchForTime: () => {
    set({ settledTime: get().landingTime });
    void get().refreshSun();
    void get().loadSummaries();
    const { selectedId, compareIds } = get();
    if (selectedId) {
      void get().evaluate(selectedId);
      void get().assess(selectedId);
      void get().prefetchRange(selectedId, get().landingTime);
      void get().loadRegion(selectedId);
      // the time track may have moved to a new month: fetch its timelines (cached ones are skipped)
      void get().loadAiTimeline(selectedId);
      void get().loadRegionTimeline(selectedId);
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
        set({ evals: { ...get().evals, [key]: ev }, lastEval: { ...get().lastEval, [id]: ev }, errors: { ...get().errors, [id]: "" } });
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
    const time = get().landingTime;
    const local = sunAt(get().sunTrack, time);
    if (local) return set({ sun: local });
    try {
      const sun = await api.sun(time);
      if (get().landingTime === time) set({ sun });
    } catch {
      /* keep the last lighting */
    }
  },
  loadSunTrack: async () => {
    const anchor = get().timeAnchor;
    if (get().sunTrackAnchor === anchor) return;
    set({ sunTrackAnchor: anchor });
    try {
      const tr = await api.sunTrack(anchor, TRACK_DAYS * 24);
      if (get().timeAnchor !== anchor) return;
      const sunTrack = { start: new Date(tr.start).getTime(), step: tr.step_hours, pts: tr.points };
      set({ sunTrack, sun: sunAt(sunTrack, get().landingTime) ?? get().sun });
    } catch {
      set({ sunTrackAnchor: null });
    }
  },
  setPlaying: (on) => {
    if (on === get().playing) return;
    set({ playing: on });
    if (on) {
      if (timeTimer) clearTimeout(timeTimer);
      void api.prewarm(get().landingTime, 48);
      const sel = get().selectedId;
      if (sel) {
        void get().prefetchRange(sel, get().landingTime);
        void get().prefetchRange(sel, new Date(new Date(get().landingTime).getTime() + BLOCK_H * 3600e3).toISOString());
      }
    } else get().fetchForTime();
  },
  setPlaySpeed: (h) => set({ playSpeed: h }),
  prefetchRange: async (id, iso) => {
    const s = get();
    const site = s.sites.find((x) => x.id === id);
    if (!site) return;
    const half = halfSizeOf(site);
    const start = blockStart(iso);
    const key = `${id}|${half}|${start}`;
    if (rangeDone.has(key)) return;
    rangeDone.add(key);
    try {
      const r = await api.regionRange(site.lat, site.lon, half, start, BLOCK_H);
      if (!r.available) return;
      const add: Record<string, RegionAnalysis> = {};
      for (const f of r.frames) {
        const t = new Date(f.landing_time).toISOString();
        add[regionKey(id, t, half)] = {
          available: true,
          lat: r.lat,
          lon: r.lon,
          half_size_m: r.half_size_m,
          cells: r.cells,
          resolution_m: r.resolution_m,
          ellipse_radius_m: r.ellipse_radius_m,
          landing_time: t,
          touchdown: r.touchdown,
          uncertainty: r.uncertainty,
          success: f.success,
          gate: f.gate,
          stats: f.stats,
          zones: f.zones,
        } as RegionAnalysis;
      }
      // don't overwrite exact single-hour results already loaded
      set({ regions: { ...add, ...get().regions } });
    } catch {
      rangeDone.delete(key);
    }
  },
  playSun: (ms) => {
    const sun = sunAt(get().sunTrack, new Date(ms).toISOString());
    if (sun) set({ sun });
  },
  playStep: (hours) => {
    const t = new Date(get().landingTime).getTime() + hours * 3600e3;
    get().playTo(new Date(Math.round(t / 3600e3) * 3600e3).toISOString());
  },
  playTo: (iso) => {
    const anchor = keepAnchor(iso, get().timeAnchor);
    set({ landingTime: iso, timeAnchor: anchor, sun: get().playing ? get().sun : sunAt(get().sunTrack, iso) ?? get().sun }); // while playing the Sun moves per frame
    if (anchor !== get().sunTrackAnchor) void get().loadSunTrack();
    const sel = get().selectedId;
    if (sel) {
      void get().prefetchRange(sel, iso);
      void get().prefetchRange(sel, new Date(new Date(iso).getTime() + BLOCK_H * 3600e3).toISOString());
    }
    // the AI map image and the region colours follow at most ~1x per second
    const now = Date.now();
    if (now - lastFrameFetch > 900) {
      lastFrameFetch = now;
      set({ settledTime: iso });
      void get().loadSummaries(iso);
      if ((new Date(iso).getUTCHours() + 24) % 24 === 0) void api.prewarm(iso, 48);
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
      set({ ai: { ...get().ai, [key]: res }, lastAi: { ...get().lastAi, [id]: res } });
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
    if (timeTimer) clearTimeout(timeTimer);
    set({ landingTime: iso, settledTime: iso, timeAnchor: keepAnchor(iso, get().timeAnchor), sun: sunAt(get().sunTrack, iso) ?? get().sun });
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
      set({ regions: { ...get().regions, [key]: r }, lastRegion: { ...get().lastRegion, [`${id}|${halfSizeOf(site)}`]: r } });
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
    const { key, start } = aiTimelineKey(id, s.timeAnchor);
    const k = `${key}|${halfSizeOf(site)}`;
    if (s.regionTimelines[k]) return;
    try {
      const tl = await api.regionTimeline(site.lat, site.lon, halfSizeOf(site), start, TRACK_DAYS, 6);
      set({ regionTimelines: { ...get().regionTimelines, [k]: tl } });
    } catch {
      /* AI offline */
    }
  },
  setFocusZone: (id) => set({ focusZone: id }),
  addSlip: (siteId, offsetH) => {
    const cur = get().compareSlips;
    if (offsetH === 0 || cur.some((x) => x.siteId === siteId && x.offsetH === offsetH)) return;
    set({ compareSlips: [...cur, { siteId, offsetH }].sort((a, b) => a.offsetH - b.offsetH) });
  },
  removeSlip: (siteId, offsetH) => set({ compareSlips: get().compareSlips.filter((x) => !(x.siteId === siteId && x.offsetH === offsetH)) }),
  loadConditions: async (siteId, iso) => {
    const key = `${siteId}|${iso}`;
    const site = get().sites.find((x) => x.id === siteId);
    if (!site || get().conditions[key] || condInflight.has(key)) return;
    condInflight.add(key);
    try {
      const c = await api.conditions(site.lat, site.lon, iso, 14, get().missionHours);
      set({ conditions: { ...get().conditions, [key]: c } });
    } catch {
      /* backend offline */
    } finally {
      condInflight.delete(key);
    }
  },
  loadSummaries: async (iso) => {
    const s = get();
    const hour = hourOf(iso ?? s.landingTime);
    if (s.summaries[hour] || sumInflight.has(hour)) return;
    const regions = s.sites.filter((x) => x.group !== "Historic landing").map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, half_size_m: halfSizeOf(x) }));
    if (!regions.length) return;
    sumInflight.add(hour);
    try {
      const res = await api.regionsSummary(regions, hour);
      const byId = Object.fromEntries(res.regions.map((r) => [r.id, r]));
      set({ summaries: { ...get().summaries, [hour]: byId }, lastSummaries: byId });
    } catch {
      /* AI offline */
    } finally {
      sumInflight.delete(hour);
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
    const { key, start } = aiTimelineKey(id, s.timeAnchor);
    if (s.aiTimelines[key]) return;
    try {
      const tl = await api.aiTimeline(site.lat, site.lon, start, TRACK_DAYS, 6);
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
    set({ landingTime: p.landing_time, timeAnchor: keepAnchor(p.landing_time, get().timeAnchor), profile: p.profile, divertRadius: ev.divert?.radius_m ?? get().divertRadius });
    set({ evals: { ...get().evals, [evalKey(site.id, get())]: ev } });
    void get().refreshSun();
    get().select(site.id);
  },
}));

export function useSelected() {
  return useStore((s) => s.sites.find((x) => x.id === s.selectedId) ?? null);
}

/**
 * Region summaries for the shown time, or the nearest earlier hour already loaded (never a later
 * one): during playback the colours only ever move forward in time instead of snapping back.
 */
export function useSummariesAt() {
  return useStore((s) => {
    const hour = hourOf(s.landingTime);
    const exact = s.summaries[hour];
    if (exact) return exact;
    let best: string | null = null;
    for (const k in s.summaries) if (k <= hour && (best === null || k > best)) best = k;
    return best ? s.summaries[best] : s.lastSummaries;
  });
}

export function useEval(id: string | null | undefined) {
  return useStore((s) => (id ? s.evals[evalKey(id, s)] ?? s.lastEval[id] : undefined));
}

export function useAI(id: string | null | undefined) {
  return useStore((s) => (id ? s.ai[aiKey(id, s.landingTime)] ?? s.lastAi[id] : undefined));
}

export function useAILoading(id: string | null | undefined) {
  return useStore((s) => (id ? Boolean(s.aiLoading[aiKey(id, s.landingTime)]) : false));
}

export function useRegion(id: string | null | undefined) {
  return useStore((s) => {
    const site = id ? s.sites.find((x) => x.id === id) : undefined;
    return site ? s.regions[regionKey(site.id, s.landingTime, halfSizeOf(site))] ?? s.lastRegion[`${site.id}|${halfSizeOf(site)}`] : undefined;
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
    return site ? s.regionTimelines[`${aiTimelineKey(site.id, s.timeAnchor).key}|${halfSizeOf(site)}`] : undefined;
  });
}
