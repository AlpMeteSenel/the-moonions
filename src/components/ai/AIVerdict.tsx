"use client";

import { AlertTriangle, BatteryCharging, Brain, Loader2, Mountain, Radio, Sun } from "lucide-react";
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiTimelineKey, useAI, useAILoading, useStore } from "@/lib/store";
import type { AIDriver, AITimeline, HeadKey, Site } from "@/lib/types";
import { fmtTime } from "@/lib/ui";
import { DIVERGING, HEAD_META, landSolid, pct } from "./palette";
import Source from "./Source";

const HEAD_ICON: Record<HeadKey, typeof Sun> = { touchdown: Mountain, lit0: Sun, energy_ok: BatteryCharging, comms_ok: Radio };

function verdictText(p: number) {
  if (p >= 0.8) return { text: "Strong candidate", tone: "text-sky-200" };
  if (p >= 0.5) return { text: "Viable, with risks", tone: "text-slate-200" };
  return { text: "Not recommended at this time", tone: "text-red-300" };
}

function SectionTitle({ children, source }: { children: React.ReactNode; source?: React.ComponentProps<typeof Source>["kind"] }) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
      {children}
      {source && <Source kind={source} />}
    </div>
  );
}

function HeadRow({ k, p }: { k: HeadKey; p: number }) {
  const Icon = HEAD_ICON[k];
  return (
    <div className="flex items-center gap-2.5 py-1">
      <Icon size={14} className="shrink-0 text-white/50" />
      <span className="w-40 shrink-0 text-[12px] text-white/80">{HEAD_META[k].label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, p * 100)}%`, background: landSolid(0.5 + p * 0.5) }} />
      </div>
      <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-white/90">{pct(p)}</span>
    </div>
  );
}

function Drivers({ drivers }: { drivers: AIDriver[] }) {
  const top = drivers.slice(0, 6);
  const max = Math.max(0.02, ...top.map((d) => Math.abs(d.impact)));
  const fmtVal = (d: AIDriver) => {
    if (d.value === null) return "";
    const v = d.unit === "" && Math.abs(d.value) <= 1 ? `${Math.round(d.value * 100)}%` : `${Number(d.value.toFixed(d.value < 10 ? 1 : 0))}${d.unit ? ` ${d.unit}` : ""}`;
    return v;
  };
  return (
    <div className="space-y-1.5">
      {top.map((d) => {
        const w = (Math.abs(d.impact) / max) * 50;
        const pos = d.impact >= 0;
        return (
          <div key={d.feature} className="grid grid-cols-[1fr_120px_44px] items-center gap-2" title={`Resetting this input to a typical value changes predicted touchdown safety by ${(-d.impact * 100).toFixed(1)} points`}>
            <div className="min-w-0">
              <div className="truncate text-[11.5px] text-white/80">{d.label}</div>
              <div className="text-[10px] tabular-nums text-white/40">{fmtVal(d)}</div>
            </div>
            <div className="relative h-3">
              <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: DIVERGING.mid }} />
              <div
                className="absolute inset-y-0 rounded-sm"
                style={{ background: pos ? DIVERGING.pos : DIVERGING.neg, width: `${Math.max(w, 1.5)}%`, left: pos ? "50%" : `${50 - Math.max(w, 1.5)}%` }}
              />
            </div>
            <div className="text-right text-[11px] font-medium tabular-nums text-white/75">
              {pos ? "+" : "−"}
              {Math.abs(d.impact * 100).toFixed(1)}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between pt-1 text-[10px] text-white/40">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ background: DIVERGING.neg }} /> lowers success
        </span>
        <span>points of touchdown probability</span>
        <span className="flex items-center gap-1">
          raises success <span className="h-2 w-2 rounded-sm" style={{ background: DIVERGING.pos }} />
        </span>
      </div>
    </div>
  );
}

function BestTimes({ tl, landingTime, onPick }: { tl?: AITimeline; landingTime: string; onPick: (iso: string) => void }) {
  if (!tl) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/45">
        <Loader2 size={12} className="animate-spin" /> Scanning a month of touchdown times…
      </div>
    );
  }
  if (!tl.available) return null;
  const data = tl.times.map((t, i) => ({ t: new Date(t).getTime(), p: tl.success[i] }));
  const lt = new Date(landingTime).getTime();
  return (
    <div>
      <div className="h-28">
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: -30, bottom: 0 }}
            onClick={(e) => {
              const p = (e as unknown as { activePayload?: { payload: { t: number } }[] })?.activePayload?.[0]?.payload;
              if (p) onPick(new Date(p.t).toISOString());
            }}
          >
            <defs>
              <linearGradient id="aig" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            {tl.windows.map((w) => (
              <ReferenceArea key={w.start} x1={new Date(w.start).getTime()} x2={new Date(w.end).getTime()} fill="#10b981" fillOpacity={0.08} stroke="none" />
            ))}
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              stroke="rgba(255,255,255,0.1)"
              minTickGap={34}
            />
            <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${v * 100}%`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.3)" }}
              contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
              labelFormatter={(v) => fmtTime(new Date(v as number).toISOString())}
              formatter={(v) => [pct(Number(v)), "AI success"]}
            />
            <ReferenceLine y={0.5} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
            <ReferenceLine x={lt} stroke="#e2e8f0" strokeWidth={1.5} />
            <Area type="monotone" dataKey="p" stroke="#10b981" strokeWidth={2} fill="url(#aig)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 space-y-1">
        {tl.windows.length === 0 && <div className="text-[11px] text-red-300">No viable touchdown time at this site in the next month.</div>}
        {tl.windows.slice(0, 4).map((w, i) => {
          const active = Math.abs(new Date(w.best).getTime() - lt) < 3600e3;
          return (
            <button
              key={w.best}
              onClick={() => onPick(w.best)}
              className={`grid w-full grid-cols-[18px_1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition ${active ? "bg-sky-400/15 ring-1 ring-sky-300/40" : "bg-white/[0.03] hover:bg-white/[0.07]"}`}
            >
              <span className="text-[10px] font-bold text-white/40">{i === 0 ? "★" : i + 1}</span>
              <span className="text-white/85">{fmtTime(w.best)}</span>
              <span className="text-[10px] text-white/40">open {Math.round(w.hours_open)} h</span>
              <span className="w-10 text-right font-semibold tabular-nums text-white">{pct(w.best_success)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AIVerdict({ site }: { site: Site }) {
  const ai = useAI(site.id);
  const loading = useAILoading(site.id);
  const landingTime = useStore((s) => s.landingTime);
  const tl = useStore((s) => s.aiTimelines[aiTimelineKey(site.id, s.timeAnchor).key]);
  const setLandingTime = useStore((s) => s.setLandingTime);
  const setShowModelCard = useStore((s) => s.setShowModelCard);

  if (!ai) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-white/50">
        <Loader2 size={14} className="animate-spin" /> {loading ? "AI is assessing this site…" : "Waiting for the AI…"}
      </div>
    );
  }
  if (!ai.available) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12px] text-white/60">
        <Brain size={16} className="mb-2 text-white/40" />
        The AI model isn&apos;t trained yet. Scores in the Scorecard tab use the rule-based method.
      </div>
    );
  }
  const p = ai.success_probability ?? 0;
  const v = verdictText(p);
  return (
    <div>
      <p className="mb-3 rounded-md bg-white/5 p-2.5 text-[11px] leading-relaxed text-white/60">This assessment is for the region centre, not Z1 or the whole region. Conditions can differ between landing zones.</p>
      <div className="flex items-end gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Success at region centre <Source kind="ai" />
          </div>
          <div className="mt-0.5 text-[44px] font-semibold leading-none tabular-nums text-white">
            {Math.round(p * 100)}
            <span className="text-2xl text-white/60">%</span>
          </div>
          <div className={`mt-1 text-[12px] font-medium ${v.tone}`}>{v.text}</div>
        </div>
        <div className="mb-1 ml-auto text-right">
          <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
            Rule-based <Source kind="computed" />
          </div>
          <div className="text-lg font-semibold tabular-nums text-white/70">
            {Math.round(ai.rule_score ?? 0)}
            <span className="text-xs text-white/40">/100</span>
          </div>
        </div>
      </div>

      {ai.in_domain === false && (
        <div className="mt-3 flex gap-2 rounded-md border border-amber-300/30 bg-amber-300/[0.07] p-2 text-[11px] text-amber-100">
          <AlertTriangle size={14} className="mt-px shrink-0" /> {ai.domain_note}
        </div>
      )}

      <SectionTitle source="ai">Safe touchdown</SectionTitle>
      {ai.heads && <HeadRow k="touchdown" p={ai.heads.touchdown} />}
      {ai.touchdown_uncertainty !== undefined && (
        <div className="pl-[22px] text-[10.5px] text-white/45">
          ± {pct(ai.touchdown_uncertainty, 1)} ensemble spread · physics on the 80 m map alone says {pct(ai.physics_prior)}
        </div>
      )}

      <SectionTitle source="simulated">Checks under the generic mission model</SectionTitle>
      <div className="space-y-1">
        {ai.checks?.map((c) => {
          const Icon = HEAD_ICON[c.key];
          return (
            <div key={c.key} className="flex items-center gap-2.5 text-[12px]">
              <Icon size={14} className="shrink-0 text-white/50" />
              <span className="w-40 shrink-0 text-white/80">{c.label}</span>
              <span className="flex-1 truncate text-[11px] text-white/45">{c.detail}</span>
              <span className={`w-10 text-right font-semibold ${c.ok ? "text-white/90" : "text-red-300"}`}>{c.ok ? "✓ OK" : "✗ No"}</span>
            </div>
          );
        })}
      </div>

      <SectionTitle source="ai">What drives touchdown safety</SectionTitle>
      {ai.drivers && <Drivers drivers={ai.drivers} />}

      <SectionTitle source="ai">Best touchdown times here</SectionTitle>
      <BestTimes tl={tl} landingTime={landingTime} onPick={setLandingTime} />

      <button onClick={() => setShowModelCard(true)} className="mt-4 w-full rounded-md bg-white/[0.03] px-3 py-2 text-left text-[10.5px] leading-relaxed text-white/45 hover:bg-white/[0.06]">
        Model {ai.model?.version}
        {ai.model?.foundation_model && <> · terrain features from the {ai.model.foundation_model}</>} · trained on simulated landings over NASA LOLA 20 m terrain with
        GRAIL gravity and low-gravity tip-over physics.{" "}
        <span className="text-sky-300">How accurate is it? →</span>
      </button>
    </div>
  );
}
