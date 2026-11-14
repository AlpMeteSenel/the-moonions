"use client";

import { CheckCircle2, FilePlus2, Loader2, Mountain, Sparkles } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { fmtLat, fmtLon } from "@/lib/geo";
import { useEval, useRegion, useRegionLoading, useSelected, useStore } from "@/lib/store";
import type { Evaluation, Factor, Timeline } from "@/lib/types";
import { fmtTime, scoreColor } from "@/lib/ui";
import { VerdictChip } from "./Chip";
import AIVerdict from "./ai/AIVerdict";
import RegionVerdict from "./ai/RegionVerdict";
import Source from "./ai/Source";

type Tab = "region" | "ai" | "score" | "windows";

function FactorRow({ f }: { f: Factor }) {
  const col = f.hard_fail ? "#f87171" : scoreColor(f.score);
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 font-medium text-white/85">
          {f.label} <Source kind="computed" />
        </span>
        <span className="font-semibold tabular-nums" style={{ color: col }}>
          {f.hard_fail ? "FAIL" : Math.round(f.score)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(3, f.score)}%`, background: col }} />
      </div>
      <div className="mt-1 text-[11px] leading-snug text-white/55">{f.summary}</div>
    </div>
  );
}

function ScoreTab({ ev }: { ev: Evaluation }) {
  const order = ["ground", "sunlight", "earth", "backups", "craters", "science"];
  const factors = [...ev.factors].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const ai = (ev.factors.find((f) => f.key === "ground")?.details.ai ?? null) as { p_safe: number } | null;
  return (
    <div>
      <div className="divide-y divide-white/[0.06]">{factors.map((f) => <FactorRow key={f.key} f={f} />)}</div>
      <div className="mt-3 rounded-md bg-white/[0.03] p-2.5 text-[10px] leading-relaxed text-white/40">
        Terrain: {ev.terrain.source} ({Math.round(ev.terrain.resolution_m)} m detail) · tilt {ev.terrain.slope_deg.toFixed(1)}° · relief{" "}
        {Math.round(ev.terrain.relief_m)} m
        {ai && <> · AI ground check {Math.round(ai.p_safe * 100)}% safe</>}
      </div>
    </div>
  );
}

function WindowsTab({ tl, landingTime }: { tl?: Timeline; landingTime: string }) {
  const setLandingTime = useStore((s) => s.setLandingTime);
  if (!tl) return <div className="flex items-center gap-2 text-sm text-white/50"><Loader2 size={14} className="animate-spin" /> Computing 30 days of sunlight and Earth visibility…</div>;
  const data = tl.times.map((t, i) => ({
    t: new Date(t).getTime(),
    score: tl.score[i],
    sun: tl.sun_clearance[i],
    earth: tl.earth_clearance[i],
  }));
  const lt = new Date(landingTime).getTime();
  return (
    <div>
      <div className="mb-1 text-[11px] text-white/55">Landing quality by touchdown time (lighting + Earth contact over the stay). Click to pick a time.</div>
      <div className="h-40">
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 6, right: 4, left: -28, bottom: 0 }}
            onClick={(e) => {
              const p = (e as unknown as { activePayload?: { payload: { t: number } }[] })?.activePayload?.[0]?.payload;
              if (p) setLandingTime(new Date(p.t).toISOString());
            }}
          >
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" minTickGap={30} />
            <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
              labelFormatter={(v) => fmtTime(new Date(v as number).toISOString())}
              formatter={(v, n) => [Math.round(Number(v) * 10) / 10, n === "score" ? "Landing quality" : String(n)]}
            />
            <ReferenceLine y={60} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <ReferenceLine x={lt} stroke="#22d3ee" strokeWidth={2} />
            <Area type="monotone" dataKey="score" stroke="#34d399" fill="url(#sg)" strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 h-20">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <ReferenceLine x={lt} stroke="#22d3ee" strokeWidth={2} />
            <Line type="monotone" dataKey="sun" stroke="#fbbf24" dot={false} strokeWidth={1.2} isAnimationActive={false} />
            <Line type="monotone" dataKey="earth" stroke="#60a5fa" dot={false} strokeWidth={1.2} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-2 flex gap-3 text-[10px] text-white/45">
        <span><span className="text-amber-300">━</span> Sun above skyline (°)</span>
        <span><span className="text-sky-400">━</span> Earth above skyline (°)</span>
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Best windows</div>
      <div className="mt-1 space-y-1">
        {tl.windows.length === 0 && <div className="text-[11px] text-white/50">No good window in this period.</div>}
        {tl.windows.slice(0, 5).map((w) => (
          <button key={w.best} onClick={() => setLandingTime(w.best)} className="flex w-full items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5 text-left text-[11px] hover:bg-white/[0.07]">
            <span className="text-white/80">{fmtTime(w.best)}</span>
            <span className="text-white/40">
              open {Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 3600e3)} h
            </span>
            <span className="font-semibold tabular-nums" style={{ color: scoreColor(w.best_score) }}>
              {Math.round(w.best_score)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HeaderMetrics({ siteId, ev, loading }: { siteId: string; ev?: Evaluation; loading: boolean }) {
  const region = useRegion(siteId);
  const aiLoading = useRegionLoading(siteId);
  const p = region?.available ? region.stats.best_success : null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-lg bg-sky-400/[0.07] p-2.5 ring-1 ring-sky-300/20">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
          Best spot · viable area <Source kind="ai" />
        </div>
        <div className="mt-0.5 flex items-baseline gap-1 text-[26px] font-semibold leading-none tabular-nums text-white">
          {p !== null ? Math.round(p * 100) : aiLoading ? <Loader2 size={18} className="animate-spin text-white/40" /> : "—"}
          {p !== null && <span className="text-sm text-white/55">%</span>}
          {region?.available && <span className="ml-1.5 text-[13px] font-medium text-white/70">· {region.stats.viable_km2} km²</span>}
        </div>
      </div>
      <div className="rounded-lg bg-white/[0.03] p-2.5 ring-1 ring-white/10">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
          Rule check <Source kind="computed" />
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: ev ? scoreColor(ev.overall) : undefined }}>
            {ev ? Math.round(ev.overall) : loading ? <Loader2 size={18} className="animate-spin text-white/40" /> : "—"}
          </span>
          {ev && <VerdictChip v={ev.verdict} />}
        </div>
      </div>
    </div>
  );
}

export default function SitePanel() {
  const site = useSelected();
  const ev = useEval(site?.id);
  const landingTime = useStore((s) => s.landingTime);
  const missionHours = useStore((s) => s.missionHours);
  const timelines = useStore((s) => s.timelines);
  const loading = useStore((s) => (site ? Boolean(s.loading[site.id]) : false));
  const err = useStore((s) => (site ? s.errors[site.id] : undefined));
  const suggesting = useStore((s) => s.suggesting);
  const propose = useStore((s) => s.propose);
  const setView = useStore((s) => s.setView);
  const suggestAround = useStore((s) => s.suggestAround);
  const [tab, setTab] = useState<Tab>("region");
  const [proposed, setProposed] = useState<string | null>(null);

  if (!site) {
    return (
      <aside className="flex w-[400px] shrink-0 flex-col items-center justify-center gap-3 border-l border-white/10 bg-slate-950 p-8 text-center">
        <Sparkles className="text-sky-300/70" />
        <div className="text-sm text-white/80">Pick a candidate region on the left, click the Moon to add your own, or let the AI plan.</div>
        <div className="text-xs leading-relaxed text-white/40">
          Candidates are regions, as in NASA planning. For each region and touchdown time the AI maps where a landing would succeed, finds the landing zones that fit the landing ellipse, and shows when the region is open.
        </div>
      </aside>
    );
  }

  const start = new Date(landingTime);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 2);
  const tl = timelines[`${site.id}|${start.toISOString().slice(0, 10)}|${missionHours}`];

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-white/10 bg-slate-950">
      <div className="border-b border-white/10 p-4 pb-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">{site.group}</div>
        <div className="mt-0.5 text-lg font-semibold leading-tight text-white">{site.name}</div>
        <div className="text-[11px] tabular-nums text-white/45">
          {fmtLat(site.lat)} · {fmtLon(site.lon)} · touchdown {fmtTime(landingTime)}
        </div>
        <HeaderMetrics siteId={site.id} ev={ev} loading={loading} />
        {err && !ev && <div className="mt-2 text-xs text-red-300">Backend error: {err.slice(0, 140)}</div>}
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <button
            disabled={!ev}
            onClick={async () => {
              const p = await propose(site.id);
              if (p) setProposed(p.id);
            }}
            className="flex items-center justify-center gap-1 rounded-md bg-white/[0.08] px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.14] disabled:opacity-40"
          >
            {proposed ? <CheckCircle2 size={13} /> : <FilePlus2 size={13} />} Propose
          </button>
          <button onClick={() => setView("site")} className="flex items-center justify-center gap-1 rounded-md bg-white/[0.08] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-white/[0.14]">
            <Mountain size={13} /> Inspect 3D
          </button>
          <button
            onClick={() => suggestAround(site.id)}
            disabled={suggesting}
            title="Search the surrounding 15 × 15 km region for the best independent landing targets"
            className="flex items-center justify-center gap-1 rounded-md bg-white/[0.08] px-2 py-1.5 text-[11px] font-medium text-white hover:bg-white/[0.14] disabled:opacity-50"
          >
            {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Best spots
          </button>
        </div>
      </div>
      <div className="flex border-b border-white/10 px-2">
        {(
          [
            ["region", "Region"],
            ["ai", "Spot AI"],
            ["score", "Rules"],
            ["windows", "Sun & Earth"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`border-b-2 px-2.5 py-2 text-[12px] font-medium transition ${tab === k ? "border-sky-400 text-white" : "border-transparent text-white/50 hover:text-white/80"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "region" ? (
          <RegionVerdict site={site} />
        ) : tab === "ai" ? (
          <AIVerdict site={site} />
        ) : tab === "windows" ? (
          <WindowsTab tl={tl} landingTime={landingTime} />
        ) : !ev ? (
          <div className="text-sm text-white/40">{loading ? "Evaluating…" : ""}</div>
        ) : (
          <ScoreTab ev={ev} />
        )}
      </div>
    </aside>
  );
}
