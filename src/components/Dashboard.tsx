"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRegion, useRegionLoading, useSelected, useStore } from "@/lib/store";
import type { Health } from "@/lib/types";
import AIPlanner from "./ai/AIPlanner";
import { LAND_GRADIENT } from "./ai/palette";
import ModelCardModal from "./ai/ModelCardModal";
import CandidateAssessment from "./ai/CandidateAssessment";
import CandidateRail from "./CandidateRail";
import MapHud from "./map/MapHud";
import TimeScrubber from "./map/TimeScrubber";
import ComparePanel from "./ComparePanel";
import MissionControl from "./crew/MissionControl";
import ProposalsPanel from "./ProposalsPanel";
import SitePanel from "./SitePanel";
import TopBar from "./TopBar";

const MoonScene = dynamic(() => import("./MoonScene"), { ssr: false });

function StatusLine({ health, error }: { health: Health | null; error: string | null }) {
  const view = useStore((s) => s.view);
  const sun = useStore((s) => s.sun);
  const card = useStore((s) => s.modelCard);
  const setShowModelCard = useStore((s) => s.setShowModelCard);
  return (
    <div className="pointer-events-none absolute bottom-[104px] left-3 flex flex-wrap gap-2 text-[10px] text-white/45">
      {error ? (
        <span className="rounded bg-red-500/20 px-2 py-1 text-red-200">Backend offline: {error}</span>
      ) : health ? (
        <>
          <span className="rounded bg-black/40 px-2 py-1">Terrain: {health.dem_sources.map((d) => `${d.name}`).join(" · ")}</span>
          <span className="rounded bg-black/40 px-2 py-1">Craters: {health.craters ? "Robbins 2018 (1.3 M)" : "not loaded"}</span>
          <button onClick={() => setShowModelCard(true)} className="pointer-events-auto rounded bg-sky-400/15 px-2 py-1 text-sky-200 hover:bg-sky-400/25">
            AI: {card?.success_model ? `${card.success_model.version} · model card →` : "not trained yet"}
          </button>
        </>
      ) : null}
      {sun && view === "globe" && (
        <span className="rounded bg-black/40 px-2 py-1">
          Sun overhead at {sun.sun_lat.toFixed(1)}°, {sun.sun_lon.toFixed(1)}°
        </span>
      )}
    </div>
  );
}

function SiteHint() {
  const view = useStore((s) => s.view);
  const status = useStore((s) => s.siteStatus);
  const aiMapStatus = useStore((s) => s.aiMapStatus);
  const site = useSelected();
  const region = useRegion(site?.id);
  const loading = useRegionLoading(site?.id);
  if (view !== "site") return null;
  return (
    <>
    {status && (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-lg bg-black/50 px-4 py-2 text-sm text-white/70">{status}</div>
      </div>
    )}
    <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-xs rounded-lg border border-white/10 bg-slate-950/85 p-3 text-[11px] leading-relaxed text-white/60">
      <div className="mb-1 font-semibold text-white/85">Site close-up</div>
      {site && <CandidateAssessment region={region} loading={loading} compact />}
      <div className="mt-3">
      Real LOLA terrain, height ×2.{" "}
      {aiMapStatus === "ready" ? (
        <>
          Colour = predicted landing success, including light, power and Earth contact:
          <div className="mt-1.5 flex items-center gap-1.5">
            <span>0%</span>
            <span className="h-2 w-24 rounded" style={{ background: LAND_GRADIENT }} />
            <span>100%</span>
          </div>
          <div className="mt-1 text-[10px] text-white/50">Green shows higher success estimated under the generic lander simulation. Grey can mean low estimates or unavailable coverage.</div>
        </>
      ) : (
        <>
          Colour shows ground tilt{aiMapStatus === "loading" ? " (AI map loading…)" : ""}:
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-2 w-10 rounded bg-gradient-to-r from-[#8a9596] via-[#d6b45a] to-[#c0392b]" />
            <span>flat → too steep</span>
          </div>
        </>
      )}
      </div>
      <div className="mt-1.5">
        Dashed outline: candidate region. {region?.available && region.zones.length === 0 ? "No landing zone fits the ellipse." : "Z1, Z2… mark individual zones; their scores apply only there."}
      </div>
    </div>
    </>
  );
}

export default function Dashboard() {
  const init = useStore((s) => s.init);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    init().catch((e) => setError(String(e.message ?? e)));
    api.health().then(setHealth).catch((e) => setError(String(e.message ?? e)));
  }, [init]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#02030a] text-white">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <CandidateRail />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <MoonScene />
            <MapHud />
            <SiteHint />
            <TimeScrubber />
            <StatusLine health={health} error={error} />
          </div>
          {/* docked panel under the map; the agent team stays mounted so a run survives closing it */}
          <section
            className={`${panel === "crew" ? "h-[400px]" : panel === "planner" ? "h-[360px]" : panel === "compare" ? "h-[372px]" : "h-[300px]"} shrink-0 flex-col overflow-hidden border-t border-white/10 bg-slate-950`}
            style={{ display: panel ? "flex" : "none" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-1.5">
              {panel === "crew" || panel === "planner" ? (
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
                  {(["crew", "planner"] as const).map((p) => (
                    <button key={p} onClick={() => panel !== p && setPanel(p)} className={`rounded px-2 py-1 ${panel === p ? "bg-white/10 text-white" : "text-white/45 hover:text-white"}`}>
                      {p === "crew" ? "AI agent team" : "Region × time heatmap"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">{panel === "compare" ? "Compare options: Sun, Earth and the stay" : "Landing proposals"}</div>
              )}
              <button onClick={() => setPanel(null)} className="text-white/40 hover:text-white" aria-label="Close panel">
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1" style={{ display: panel === "crew" ? "block" : "none" }}>
              <MissionControl visible={panel === "crew"} />
            </div>
            {panel && panel !== "crew" && <div className="min-h-0 flex-1 overflow-y-auto">{panel === "planner" ? <AIPlanner /> : panel === "compare" ? <ComparePanel /> : <ProposalsPanel />}</div>}
          </section>
        </main>
        <SitePanel />
      </div>
      <ModelCardModal />
    </div>
  );
}
