"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Bot, ClipboardCheck, Columns3, Globe2, Layers, Mountain, Settings2, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRegionTimeline, useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";

const PROFILES: { v: Profile; label: string; hint: string }[] = [
  { v: "balanced", label: "Balanced", hint: "Safety, light, comms and science weighed together" },
  { v: "safety-first", label: "Safety first", hint: "Ground and backup options dominate" },
  { v: "science-first", label: "Science first", hint: "Favour sites near water-ice regions" },
];

function shift(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3600e3).toISOString();
}

function Popover({ icon, label, children, active = false }: { icon: React.ReactNode; label: string; children: React.ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${open || active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
      >
        {icon}
        <span className="hidden xl:inline">{label}</span>
      </button>
      {open && <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-white/10 bg-slate-900 p-2 shadow-2xl">{children}</div>}
    </div>
  );
}

function Toggle({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/5">
      <span className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-sky-400" : "bg-white/15"}`}>
        <span className={`h-3 w-3 rounded-full bg-white transition ${on ? "translate-x-3" : ""}`} />
      </span>
      <span>
        <span className="block text-[12px] text-white">{title}</span>
        <span className="block text-[10.5px] leading-snug text-white/45">{hint}</span>
      </span>
    </button>
  );
}

export default function TopBar() {
  const landingTime = useStore((s) => s.landingTime);
  const setLandingTime = useStore((s) => s.setLandingTime);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const divertRadius = useStore((s) => s.divertRadius);
  const setDivertRadius = useStore((s) => s.setDivertRadius);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selectedId = useStore((s) => s.selectedId);
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  const showHazard = useStore((s) => s.showHazard);
  const toggleHazard = useStore((s) => s.toggleHazard);
  const realLighting = useStore((s) => s.realLighting);
  const toggleLighting = useStore((s) => s.toggleLighting);
  const showAiMap = useStore((s) => s.showAiMap);
  const toggleAiMap = useStore((s) => s.toggleAiMap);
  const compareCount = useStore((s) => s.compareIds.length);
  const pending = useStore((s) => s.proposals.filter((p) => p.status === "pending").length);
  const regionTimeline = useRegionTimeline(selectedId);
  const bestWindow = regionTimeline?.available ? regionTimeline.windows[0] : undefined;

  const iconBtn = "flex h-7 w-7 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white";
  const tab = (on: boolean) => `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${on ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950 px-4">
      <div className="flex items-center gap-2.5 pr-2">
        <div className="h-6 w-6 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1f5f9,#64748b_55%,#0f172a)]" />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-white">Plan Banana</div>
          <div className="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-white/45">Landing Site Navigator</div>
        </div>
      </div>

      {/* Touchdown time */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-1">
        <span className="whitespace-nowrap px-1.5 text-[10px] uppercase tracking-wider text-white/45">Touchdown</span>
        <button className={iconBtn} title="1 day earlier" onClick={() => setLandingTime(shift(landingTime, -24))}>
          <ChevronsLeft size={15} />
        </button>
        <button className={iconBtn} title="6 hours earlier" onClick={() => setLandingTime(shift(landingTime, -6))}>
          <ChevronLeft size={15} />
        </button>
        <input
          type="datetime-local"
          value={landingTime.slice(0, 16)}
          suppressHydrationWarning
          onChange={(e) => e.target.value && setLandingTime(new Date(e.target.value + ":00Z").toISOString())}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs tabular-nums text-white [color-scheme:dark]"
        />
        <span className="px-0.5 text-[10px] text-white/40">UTC</span>
        <button className={iconBtn} title="6 hours later" onClick={() => setLandingTime(shift(landingTime, 6))}>
          <ChevronRight size={15} />
        </button>
        <button className={iconBtn} title="1 day later" onClick={() => setLandingTime(shift(landingTime, 24))}>
          <ChevronsRight size={15} />
        </button>
        <button
          disabled={!bestWindow}
          onClick={() => bestWindow && setLandingTime(bestWindow.best)}
          title={bestWindow ? `Best landing window for this region (${Math.round(bestWindow.best_success * 100)}% at the best spot)` : "No region landing window identified"}
          className="ml-1 flex items-center gap-1 rounded-md bg-sky-400/15 px-2 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-400/25 disabled:opacity-35"
        >
          <Star size={12} /> Best time
        </button>
      </div>

      <button
        onClick={() => setPanel(panel === "crew" || panel === "planner" ? null : "crew")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${panel === "crew" || panel === "planner" ? "bg-sky-300 text-slate-950" : "bg-sky-400 text-slate-950 hover:bg-sky-300"}`}
        title="The agent team decides where and when to land"
      >
        <Bot size={14} /> Plan with AI agents
      </button>

      <div className="ml-auto flex items-center gap-1">
        <div className="flex rounded-lg border border-white/10 p-0.5">
          <button className={tab(view === "globe")} onClick={() => setView("globe")} title="Whole Moon">
            <Globe2 size={14} /> <span className="hidden 2xl:inline">Moon</span>
          </button>
          <button className={tab(view === "site")} onClick={() => setView("site")} disabled={!selectedId} title="3D close-up of the selected site">
            <Mountain size={14} /> <span className="hidden 2xl:inline">Site 3D</span>
          </button>
        </div>
        <Popover icon={<Layers size={14} />} label="Layers" active={showHazard || !realLighting}>
          <Toggle on={showAiMap} onClick={toggleAiMap} title="AI landing map" hint="Predicted landing success for the touchdown time: south-polar region on the Moon, terrain in Site 3D" />
          <Toggle on={showHazard} onClick={toggleHazard} title="Steep ground" hint="Global slope overlay from LOLA (474 m)" />
          <Toggle on={realLighting} onClick={toggleLighting} title="Real sunlight" hint="Light the Moon as it is at the touchdown time" />
        </Popover>
        <Popover icon={<Settings2 size={14} />} label="Mission">
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Priorities (rule check)</div>
          {PROFILES.map((p) => (
            <button key={p.v} onClick={() => setProfile(p.v)} className={`block w-full rounded-md px-2 py-1.5 text-left ${profile === p.v ? "bg-white/10" : "hover:bg-white/5"}`}>
              <span className="block text-[12px] text-white">{p.label}</span>
              <span className="block text-[10.5px] text-white/45">{p.hint}</span>
            </button>
          ))}
          <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Divert range for backups</div>
          <div className="flex gap-1 px-2 pb-1">
            {[1000, 2000, 3000, 5000].map((m) => (
              <button key={m} onClick={() => setDivertRadius(m)} className={`flex-1 rounded px-2 py-1 text-[11px] ${divertRadius === m ? "bg-white/15 text-white" : "bg-white/5 text-white/60 hover:text-white"}`}>
                {m / 1000} km
              </button>
            ))}
          </div>
        </Popover>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button className={tab(panel === "compare")} onClick={() => setPanel("compare")}>
          <Columns3 size={14} /> <span className="hidden xl:inline">Compare</span>
          {compareCount ? ` (${compareCount})` : ""}
        </button>
        <button className={tab(panel === "proposals")} onClick={() => setPanel("proposals")}>
          <ClipboardCheck size={14} /> <span className="hidden xl:inline">Proposals</span>
          {pending ? ` (${pending})` : ""}
        </button>
      </div>
    </header>
  );
}
