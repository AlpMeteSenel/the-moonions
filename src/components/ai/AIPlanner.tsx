"use client";

import { AlertOctagon, CalendarClock, Check, Loader2, MapPin, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDist } from "@/lib/geo";
import { useStore } from "@/lib/store";
import type { AIPlan } from "@/lib/types";
import { fmtTime } from "@/lib/ui";
import { HEAD_META, SEQ_GRADIENT, pct, seqColor } from "./palette";
import Source from "./Source";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const shortTime = (iso: string) => `${shortDate(iso)} ${new Date(iso).toISOString().slice(11, 16)}`;

function Setup({ days, setDays, step, setStep }: { days: number; setDays: (n: number) => void; step: number; setStep: (n: number) => void }) {
  const sites = useStore((s) => s.sites);
  const planSiteIds = useStore((s) => s.planSiteIds);
  const toggle = useStore((s) => s.togglePlanSite);
  const runPlan = useStore((s) => s.runPlan);
  const planning = useStore((s) => s.planning);
  const landingTime = useStore((s) => s.landingTime);
  const polar = sites.filter((s) => s.lat <= -80 || s.custom);
  const seg = (on: boolean) => `rounded px-2 py-1 text-[11px] ${on ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`;
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] pr-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Candidate sites ({planSiteIds.length})</div>
      <div className="mt-1.5 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {polar.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-white/80 hover:bg-white/5">
            <input type="checkbox" checked={planSiteIds.includes(s.id)} onChange={() => toggle(s.id)} className="h-3.5 w-3.5 accent-sky-400" />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
        <div className="flex items-center justify-between text-[11px] text-white/50">
          From {shortDate(landingTime)}, next
          <span className="flex gap-0.5">
            {[14, 30, 60].map((d) => (
              <button key={d} className={seg(days === d)} onClick={() => setDays(d)}>
                {d} d
              </button>
            ))}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/50">
          Check every
          <span className="flex gap-0.5">
            {[6, 12, 24].map((h) => (
              <button key={h} className={seg(step === h)} onClick={() => setStep(h)}>
                {h} h
              </button>
            ))}
          </span>
        </div>
        <button
          onClick={() => runPlan(days, step)}
          disabled={planning || !planSiteIds.length}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-400 px-3 py-2 text-[12px] font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
        >
          {planning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {planning ? "AI is planning…" : "Find best site & time"}
        </button>
      </div>
    </div>
  );
}

function Heatmap({ plan }: { plan: AIPlan }) {
  const sites = useStore((s) => s.sites);
  const pick = useStore((s) => s.setLandingTimeAndSelect);
  const landingTime = useStore((s) => s.landingTime);
  const selectedId = useStore((s) => s.selectedId);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const { site_ids, times, success } = plan.matrix;
  const names = site_ids.map((id) => sites.find((s) => s.id === id)?.name ?? id);
  const primary = { i: site_ids.indexOf(plan.primary.site_id), j: times.indexOf(plan.primary.landing_time) };
  const rowBest = success.map((row) => row.indexOf(Math.max(...row)));
  const dayTicks = useMemo(() => {
    const out: { j: number; label: string }[] = [];
    let last = "";
    times.forEach((t, j) => {
      const d = shortDate(t);
      if (d !== last && new Date(t).getUTCDate() % 3 === 1) out.push({ j, label: d });
      last = d;
    });
    return out;
  }, [times]);
  const cellW = `calc((100% - 0px) / ${times.length})`;
  const h = hover ? { site: names[hover.i], time: times[hover.j], p: success[hover.i][hover.j] } : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col px-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        Predicted landing success by site and touchdown time <Source kind="ai" />
        <span className="ml-auto flex items-center gap-1.5 font-normal normal-case tracking-normal text-white/45">
          0%
          <span className="h-2 w-28 rounded-sm" style={{ background: SEQ_GRADIENT }} />
          100%
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-[2px] ring-2 ring-white" /> AI pick
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-white" /> best time per site
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[150px_1fr_74px] gap-x-2" onMouseLeave={() => setHover(null)}>
        {success.map((row, i) => (
          <div key={site_ids[i]} className="contents">
            <button
              onClick={() => pick(site_ids[i], times[rowBest[i]])}
              className={`truncate py-[3px] text-left text-[11.5px] ${site_ids[i] === selectedId ? "font-semibold text-white" : "text-white/70 hover:text-white"}`}
              title={`Go to ${names[i]} at its best time`}
            >
              {names[i]}
            </button>
            <div className="relative flex h-[22px] items-stretch gap-px py-[2px]">
              {row.map((p, j) => {
                const isPrimary = i === primary.i && j === primary.j;
                const isCurrent = site_ids[i] === selectedId && times[j] === landingTime;
                return (
                  <button
                    key={j}
                    style={{ width: cellW, background: seqColor(p) }}
                    onMouseEnter={() => setHover({ i, j })}
                    onClick={() => pick(site_ids[i], times[j])}
                    className={`relative min-w-0 rounded-[2px] ${isPrimary ? "z-10 ring-2 ring-white" : isCurrent ? "z-10 ring-1 ring-sky-200" : ""}`}
                    aria-label={`${names[i]} ${shortTime(times[j])} ${pct(p)}`}
                  >
                    {j === rowBest[i] && <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />}
                  </button>
                );
              })}
            </div>
            <div className="py-[3px] text-right text-[11px] tabular-nums text-white/60" title="Best predicted success at this site">
              {pct(Math.max(...row))}
            </div>
          </div>
        ))}
        <div />
        <div className="relative h-4 text-[10px] text-white/40">
          {dayTicks.map((t) => (
            <span key={t.j} className="absolute -translate-x-1/2" style={{ left: `${((t.j + 0.5) / times.length) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <div />
      </div>
      <div className="mt-1 h-5 text-[11px] text-white/70">
        {h ? (
          <>
            <span className="font-medium text-white">{h.site}</span> · {fmtTime(h.time)} · AI success <span className="font-semibold text-white">{pct(h.p)}</span>{" "}
            <span className="text-white/40">(click to inspect)</span>
          </>
        ) : (
          <span className="text-white/40">Hover a cell for details; click to jump to that site and time.</span>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: AIPlan }) {
  const applyPlan = useStore((s) => s.applyPlan);
  const setLandingTime = useStore((s) => s.setLandingTime);
  const selectedId = useStore((s) => s.selectedId);
  const landingTime = useStore((s) => s.landingTime);
  const applied = selectedId === plan.primary.site_id && landingTime === plan.primary.landing_time;
  const slips = plan.best_times.filter((w) => !w.is_primary).slice(0, 3);
  return (
    <div className="w-[330px] shrink-0 overflow-y-auto border-l border-white/[0.06] pl-3">
      {plan.no_viable && (
        <div className="mb-2 flex gap-2 rounded-md border border-red-400/40 bg-red-400/10 p-2 text-[11.5px] text-red-200">
          <AlertOctagon size={15} className="shrink-0" /> No viable landing confirmed in this period (nothing above 50%). Widen the period or add sites.
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        AI plan <Source kind="ai" />
      </div>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-white">{plan.primary.name}</div>
          <div className="text-[11px] text-white/55">{fmtTime(plan.primary.landing_time)}</div>
        </div>
        <div className="text-right text-2xl font-semibold tabular-nums text-white">{pct(plan.primary.success_probability)}</div>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {Object.entries(plan.primary.heads).map(([k, v]) => (
          <div key={k} className="rounded bg-white/[0.04] px-1.5 py-1">
            <div className="truncate text-[9.5px] text-white/45">{HEAD_META[k]?.short ?? k}</div>
            <div className="text-[11.5px] font-semibold tabular-nums text-white/90">{pct(v)}</div>
          </div>
        ))}
      </div>
      <button
        onClick={applyPlan}
        className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${applied ? "bg-white/10 text-white/70" : "bg-sky-400 text-slate-950 hover:bg-sky-300"}`}
      >
        {applied ? <Check size={13} /> : <MapPin size={13} />} {applied ? "Plan applied" : "Apply AI plan"}
      </button>

      {slips.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            <CalendarClock size={11} /> Backup times (if the launch slips)
          </div>
          <div className="mt-1 space-y-1">
            {slips.map((w) => (
              <button key={w.best} onClick={() => setLandingTime(w.best)} className="flex w-full items-center justify-between rounded bg-white/[0.03] px-2 py-1 text-[11px] hover:bg-white/[0.07]">
                <span className="text-white/80">{fmtTime(w.best)}</span>
                <span className="text-white/40">{Math.round(w.hours_open)} h window</span>
                <span className="font-semibold tabular-nums text-white">{pct(w.best_success)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {plan.backups.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            <MapPin size={11} /> Backup sites (if the spot is blocked)
          </div>
          <div className="mt-1 space-y-1">
            {plan.backups.map((b) => (
              <div key={b.rank} className="rounded bg-white/[0.03] px-2 py-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-white/85">
                    B{b.rank} · {fmtDist(b.distance_m)} {b.direction}
                  </span>
                  <span className="text-white/40">decide by T−{b.decide_by_s}s</span>
                  <span className="font-semibold tabular-nums text-white">{pct(b.success_probability)}</span>
                </div>
                <div className="text-[10px] text-white/45">{b.reason}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Why</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-white/65">
        {plan.explanation.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AIPlanner() {
  const plan = useStore((s) => s.plan);
  const planning = useStore((s) => s.planning);
  const planError = useStore((s) => s.planError);
  const [days, setDays] = useState(30);
  const [step, setStep] = useState(12);
  return (
    <div className="flex h-full min-h-0 p-3">
      <Setup days={days} setDays={setDays} step={step} setStep={setStep} />
      {plan?.available ? (
        <>
          <Heatmap plan={plan} />
          <PlanCard plan={plan} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-white/50">
          {planning ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Checking every site at every touchdown time…
            </span>
          ) : planError ? (
            <span className="text-red-300">Planner error: {planError.slice(0, 200)}</span>
          ) : plan && !plan.available ? (
            "The AI model isn't trained yet."
          ) : (
            <span>
              Pick candidate sites and a period, then let the AI find the best <b className="text-white/80">site</b>, the best <b className="text-white/80">touchdown time</b>, backup
              times in case the launch slips and backup sites in case the spot is blocked.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
