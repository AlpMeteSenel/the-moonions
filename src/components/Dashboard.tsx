"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Health } from "@/lib/types";
import AIPlanner from "./ai/AIPlanner";
import { SEQ_GRADIENT } from "./ai/palette";
import ModelCardModal from "./ai/ModelCardModal";
import CandidateRail from "./CandidateRail";
import ComparePanel from "./ComparePanel";
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
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 text-[10px] text-white/45">
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
  if (view !== "site") return null;
  return (
    <>
    {status && (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="rounded-lg bg-black/50 px-4 py-2 text-sm text-white/70">{status}</div>
      </div>
    )}
    <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-lg border border-white/10 bg-slate-950/85 p-3 text-[11px] leading-relaxed text-white/60">
      <div className="mb-1 font-semibold text-white/85">Site close-up</div>
      Real LOLA terrain, height ×2.{" "}
      {aiMapStatus === "ready" ? (
        <>
          Colour = <b className="text-sky-200">AI landing success</b> at the touchdown time:
          <div className="mt-1.5 flex items-center gap-1.5">
            <span>0%</span>
            <span className="h-2 w-24 rounded" style={{ background: SEQ_GRADIENT }} />
            <span>100%</span>
          </div>
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
      <div className="mt-1.5">
        Dashed square: the candidate region · <span className="text-cyan-300">Z1</span>: primary landing zone with the landing ellipse · white Z2…: backup zones and
        divert paths. Shadows follow the real Sun.
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
            <SiteHint />
            <StatusLine health={health} error={error} />
          </div>
          {panel && (
            <section className={`${panel === "planner" ? "h-[360px]" : "h-[300px]"} flex shrink-0 flex-col overflow-hidden border-t border-white/10 bg-slate-950`}>
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
                  {panel === "planner" ? "AI mission planner" : panel === "compare" ? "Candidate comparison" : "Landing proposals"}
                </div>
                <button onClick={() => setPanel(panel)} className="text-white/40 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{panel === "planner" ? <AIPlanner /> : panel === "compare" ? <ComparePanel /> : <ProposalsPanel />}</div>
            </section>
          )}
        </main>
        <SitePanel />
      </div>
      <ModelCardModal />
    </div>
  );
}
