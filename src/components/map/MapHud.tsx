"use client";

import { ChevronDown, ChevronUp, Crosshair, Globe2, History, Moon } from "lucide-react";
import { useCollapsed, useLayout } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/ui";
import { LAND_GRADIENT } from "../ai/palette";

/** Elevation of a body above the horizon at the south pole ≈ −(its sub-point latitude). */
const atSouthPole = (subLat: number) => -subLat;

function Elev({ label, icon, deg }: { label: string; icon: string; deg: number }) {
  const up = deg > 0;
  return (
    <span className={`flex items-center gap-1 ${up ? "text-white/85" : "text-white/40"}`}>
      <span className={up ? (icon === "☀" ? "text-amber-300" : "text-sky-300") : ""}>{icon}</span>
      {label} {up ? "up" : "down"} {Math.abs(deg).toFixed(1)}°
    </span>
  );
}

export default function MapHud() {
  const view = useStore((s) => s.view);
  const sun = useStore((s) => s.sun);
  const landingTime = useStore((s) => s.landingTime);
  const selectedId = useStore((s) => s.selectedId);
  const setPreset = useStore((s) => s.setCameraPreset);
  const showHistoric = useStore((s) => s.showHistoric);
  const toggleHistoric = useStore((s) => s.toggleHistoric);
  const showAiMap = useStore((s) => s.showAiMap);
  const folded = useCollapsed("legend");
  const toggle = useLayout((s) => s.toggle);
  if (view !== "globe") return null;
  const btn = "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white";
  return (
    <>
      <div className={`pointer-events-none absolute left-3 top-3 z-40 rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-xl ${folded ? "w-auto" : "w-[290px]"}`}>
        <button onClick={() => toggle("legend")} className="pointer-events-auto -m-1 flex w-[calc(100%+0.5rem)] items-start justify-between rounded-md p-1 text-left hover:bg-white/5" title={folded ? "Show the legend" : "Fold the legend"}>
          <span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">Touchdown</span>
            <span className="block text-[15px] font-semibold tabular-nums text-white" suppressHydrationWarning>
              {fmtTime(landingTime)}
            </span>
          </span>
          {folded ? <ChevronDown size={15} className="mt-1 text-white/50" /> : <ChevronUp size={15} className="mt-1 text-white/50" />}
        </button>
        {!folded && (
        <>
        {sun && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            <span className="text-white/45">At the south pole:</span>
            <Elev label="Sun" icon="☀" deg={atSouthPole(sun.sun_lat)} />
            <Elev label="Earth" icon="◉" deg={atSouthPole(sun.earth_lat)} />
          </div>
        )}
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-[3px] border border-white/70" style={{ background: "#10b981" }} />
            <span className="text-[11.5px] font-medium text-white/85">Candidate landing region</span>
          </div>
          <div className="mt-1.5 text-[10.5px] leading-snug text-white/55">Colour = share of the region where a landing at this time is predicted to succeed: safe touchdown (AI) with sunlight, power and an Earth link (physics).</div>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/50">
            <span>0%</span>
            <span className="h-2 flex-1 rounded-sm" style={{ background: LAND_GRADIENT }} />
            <span>100% landable</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-white/60">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-slate-200" /> Viable
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-amber-400" /> Limited
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-dashed border-red-400" /> Poor
            </span>
          </div>
          {showAiMap && <div className="mt-1.5 text-[10.5px] leading-snug text-white/45">The glow on the terrain shows the same AI map in finer detail.</div>}
          <div className="mt-2 flex items-center gap-3 text-[10.5px] text-white/55">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-cyan-300" /> selected
            </span>
            <span className="flex items-center gap-1">
              <span className="rounded bg-cyan-300 px-1 text-[9px] font-bold text-slate-950">Z1</span> landing zone
            </span>
          </div>
        </div>
        </>
        )}
      </div>

      <div className="absolute right-3 top-3 z-40 flex flex-col items-end gap-1.5">
        <div className="flex rounded-lg border border-white/10 bg-slate-950/85 p-0.5 shadow-xl">
          <button className={btn} onClick={() => setPreset("moon")} title="See the whole Moon">
            <Moon size={13} /> Whole Moon
          </button>
          <button className={btn} onClick={() => setPreset("pole")} title="All Artemis III regions around the south pole">
            <Globe2 size={13} /> South pole
          </button>
          <button className={`${btn} disabled:opacity-35`} disabled={!selectedId} onClick={() => setPreset("region")} title="Fly to the selected region">
            <Crosshair size={13} /> Selected
          </button>
        </div>
        <button onClick={toggleHistoric} className={`flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] shadow-xl ${showHistoric ? "bg-white/15 text-white" : "bg-slate-950/85 text-white/60 hover:text-white"}`}>
          <History size={13} /> Historic landings
        </button>
      </div>
    </>
  );
}
