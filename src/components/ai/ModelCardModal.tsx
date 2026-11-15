"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ReferenceLine } from "recharts";
import { useStore } from "@/lib/store";
import type { ModelCard } from "@/lib/types";

type M = NonNullable<ModelCard["success_model"]>;

// categorical slots 1-3 of the validated reference palette (dark steps), fixed order
const VARIANT = [
  { key: "cnn", label: "Terrain CNN", color: "#3987e5" },
  { key: "lfm", label: "Foundation model", color: "#d95926" },
  { key: "both", label: "CNN + foundation", color: "#199e70" },
] as const;
const AI = "#3987e5";
const BASE = "#64748b";
const AXIS = { fill: "rgba(255,255,255,0.45)", fontSize: 10 };
const TIP = { background: "#0b1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 11 };

const pts = (v: number, d = 1) => `${(v * 100).toFixed(d)}`;
const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : `${Math.round(n / 1e3)} k`);

function Kpi({ value, unit, label, vs }: { value: string; unit?: string; label: string; vs?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-baseline gap-1">
        <span className="text-[30px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</span>
        {unit && <span className="text-sm text-white/50">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[12px] text-white/70">{label}</div>
      {vs && <div className="mt-0.5 text-[11px] text-white/40">{vs}</div>}
    </div>
  );
}

function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-white/90">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Validation error per epoch for each variant, best epoch marked. */
function TrainingChart({ m, metric }: { m: M; metric: "val_mae" | "train_loss" | "val_spearman" }) {
  const variants = VARIANT.filter((v) => m.training_curves[v.key]);
  const n = Math.max(...variants.map((v) => m.training_curves[v.key].length));
  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { epoch: i + 1 };
    for (const v of variants) {
      const c = m.training_curves[v.key][i];
      if (c) row[v.key] = metric === "val_mae" ? c.val_mae * 100 : c[metric];
    }
    return row;
  });
  const best = variants.map((v) => {
    const c = m.training_curves[v.key];
    const b = c.reduce((a, x) => (x.val_mae < a.val_mae ? x : a), c[0]);
    return { ...v, epoch: b.epoch, y: metric === "val_mae" ? b.val_mae * 100 : b[metric] };
  });
  const fmt = (v: number) => (metric === "val_mae" ? `${v.toFixed(2)} pts` : v.toFixed(metric === "val_spearman" ? 3 : 4));
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="epoch" type="number" domain={[1, "dataMax"]} allowDecimals={false} minTickGap={24} tick={AXIS} stroke="rgba(255,255,255,0.12)" tickLine={false} label={{ value: "epoch", position: "insideBottomRight", offset: -2, fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
        <YAxis tick={AXIS} stroke="rgba(255,255,255,0.12)" tickLine={false} domain={["auto", "auto"]} width={46} tickFormatter={(v) => (metric === "val_mae" ? v.toFixed(1) : v.toFixed(metric === "val_spearman" ? 2 : 3))} />
        <Tooltip contentStyle={TIP} labelFormatter={(v) => `Epoch ${v}`} formatter={(v, k) => [fmt(Number(v)), VARIANT.find((x) => x.key === k)?.label ?? String(k)]} />
        {variants.map((v) => (
          <Line key={v.key} dataKey={v.key} stroke={v.color} strokeWidth={v.key === m.variant ? 2.5 : 1.5} strokeOpacity={v.key === m.variant ? 1 : 0.7} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
        {best.map((b) => (
          <ReferenceDot key={b.key} x={b.epoch} y={b.y} r={5} fill={b.color} stroke="#020617" strokeWidth={2} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** One metric, three methods: horizontal bars, best highlighted. */
function Compare({ label, values, lowerBetter, fmt }: { label: string; values: { name: string; v: number | null; ai?: boolean }[]; lowerBetter?: boolean; fmt: (v: number) => string }) {
  values = values.filter((x) => x.v !== null);
  const nums = values.map((x) => x.v as number);
  const max = Math.max(...nums);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11.5px]">
        <span className="text-white/80">{label}</span>
        <span className="text-[10px] text-white/35">{lowerBetter ? "lower is better" : "higher is better"}</span>
      </div>
      <div className="space-y-1">
        {values.map((x) => (
          <div key={x.name} className="grid grid-cols-[92px_1fr_64px] items-center gap-2 text-[11px]">
            <span className={x.ai ? "font-medium text-white" : "text-white/50"}>{x.name}</span>
            <div className="h-2.5 rounded-sm bg-white/[0.04]">
              {x.v !== null && <div className="h-full rounded-sm" style={{ width: `${Math.max(2, (x.v / max) * 100)}%`, background: x.ai ? AI : BASE }} />}
            </div>
            <span className={`text-right tabular-nums ${x.ai ? "font-semibold text-white" : "text-white/50"}`}>{x.v === null ? "n/a" : fmt(x.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** South-polar cap seen from above, longitude sectors coloured by data split. */
function SplitDisc({ m }: { m: M }) {
  const R = 70;
  const c = 80;
  // lon → angle: 0° at the top, east clockwise (as on the map HUD)
  const pt = (lon: number, r = R) => {
    const a = ((lon - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const wedge = (a: number, b: number) => {
    const [x0, y0] = pt(a);
    const [x1, y1] = pt(b);
    return `M${c},${c} L${x0},${y0} A${R},${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x1},${y1} Z`;
  };
  const SPLIT = [
    { key: "train", label: "Train", n: m.data.train, color: "#3987e5" },
    { key: "val", label: "Validation", n: m.data.val, color: "#d95926" },
    { key: "test", label: "Test", n: m.data.test, color: "#199e70" },
  ];
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="-14 -6 188 172" className="h-40 w-44 shrink-0" role="img" aria-label="Data split by longitude">
        <circle cx={c} cy={c} r={R} fill="#3987e5" opacity={0.85} />
        <path d={wedge(300, 330)} fill="#d95926" stroke="#020617" strokeWidth={2} />
        <path d={wedge(60, 120)} fill="#199e70" stroke="#020617" strokeWidth={2} />
        <circle cx={c} cy={c} r={3} fill="#020617" />
        {[0, 90, 180, 270].map((l) => {
          const [x, y] = pt(l, R + 7);
          return (
            <text key={l} x={x} y={y + 3} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.45)">
              {l === 0 ? "0°" : l === 180 ? "180°" : l === 90 ? "90°E" : "90°W"}
            </text>
          );
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex h-3 overflow-hidden rounded-sm">
          {SPLIT.map((s) => (
            <div key={s.key} style={{ width: `${(s.n / m.data.samples) * 100}%`, background: s.color }} className="border-r-2 border-[#020617] last:border-r-0" />
          ))}
        </div>
        {SPLIT.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-white/75">{s.label}</span>
            <span className="ml-auto tabular-nums text-white/55">{s.n.toLocaleString()}</span>
          </div>
        ))}
        <div className="border-t border-white/10 pt-1.5 text-[11px] text-white/45">Split by longitude: no test terrain is seen in training</div>
      </div>
    </div>
  );
}

function Pipeline({ m }: { m: M }) {
  const params = m.training?.parameters[m.variant];
  const members = m.training?.ensemble_members[m.variant] ?? 5;
  const steps = [
    { k: "Input", v: "80 m terrain patch + 13 terrain features + physics estimate" },
    { k: "Network", v: params ? `${fmtK(params)} parameters, corrects the physics estimate` : "corrects the physics estimate" },
    { k: "Ensemble", v: `${members} networks → probability + uncertainty` },
    { k: "Mission", v: "× sunlight × power × Earth link at the chosen time" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <div key={s.k} className="relative rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/80">
            {i + 1} · {s.k}
          </div>
          <div className="mt-1 text-[12px] leading-snug text-white/80">{s.v}</div>
          {i < steps.length - 1 && <span className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 text-white/30">›</span>}
        </div>
      ))}
    </div>
  );
}

const METRIC_TABS = [
  { key: "val_mae", label: "Validation error" },
  { key: "train_loss", label: "Training loss" },
  { key: "val_spearman", label: "Validation ranking" },
] as const;

export default function ModelCardModal() {
  const open = useStore((s) => s.showModelCard);
  const setOpen = useStore((s) => s.setShowModelCard);
  const card = useStore((s) => s.modelCard);
  const [metric, setMetric] = useState<(typeof METRIC_TABS)[number]["key"]>("val_mae");
  const m = card?.success_model;

  const calib = useMemo(() => (m ? m.calibration_test.map((b) => ({ x: b.predicted * 100, y: b.actual * 100, n: b.n })) : []), [m]);
  if (!open) return null;

  const ai = m?.results_test.ai_model;
  const phys = m?.results_test.physics_80m_baseline;
  const rule = m?.results_test.rule_based_score;
  const curve = m ? m.training_curves[m.variant] ?? [] : [];
  const bestEp = curve.length ? curve.reduce((a, x) => (x.val_mae < a.val_mae ? x : a), curve[0]) : null;
  const deployed = VARIANT.find((v) => v.key === m?.variant);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#050816] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/80">Model card</div>
            <h2 className="mt-0.5 text-xl font-semibold text-white">{m?.name ?? "Landing-success model"}</h2>
            {m && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                {[m.version, deployed ? `Deployed: ${deployed.label}` : null, `${m.training?.ensemble_members[m.variant] ?? 5}-network ensemble`, `Trained ${new Date(m.trained_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`]
                  .filter(Boolean)
                  .map((t) => (
                    <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-white/70">
                      {t}
                    </span>
                  ))}
              </div>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {!m || !ai || !phys || !rule ? (
          <div className="p-6 text-sm text-white/60">Model card unavailable.</div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi value={pts(ai.touchdown_mae ?? 0)} unit="pts" label="Average error" vs={`Physics alone: ${pts(phys.touchdown_mae ?? 0)} pts`} />
              <Kpi value={ai.touchdown_spearman.toFixed(3)} label="Ranking accuracy (ρ)" vs={`Rule-based score: ${rule.touchdown_spearman.toFixed(3)}`} />
              <Kpi value={ai.safe_site_auc.toFixed(3)} label="Finds safe sites (AUC)" vs={`Physics alone: ${phys.safe_site_auc.toFixed(3)}`} />
              <Kpi value={(m.data.samples / 1000).toFixed(0)} unit="k" label="Simulated landing sites" vs={`${m.data.test.toLocaleString()} held out for testing`} />
            </div>

            <Pipeline m={m} />

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Panel
                title="Training"
                right={
                  <div className="flex rounded-md border border-white/10 p-0.5 text-[11px]">
                    {METRIC_TABS.map((t) => (
                      <button key={t.key} onClick={() => setMetric(t.key)} className={`rounded px-2 py-0.5 ${metric === t.key ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="h-60">
                  <TrainingChart m={m} metric={metric} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/60">
                  {VARIANT.filter((v) => m.training_curves[v.key]).map((v) => (
                    <span key={v.key} className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ background: v.color, height: v.key === m.variant ? 3 : 2 }} />
                      {v.label}
                      {v.key === m.variant && <span className="text-white/40">(deployed)</span>}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-[#020617] bg-white/70" /> best epoch
                  </span>
                </div>
              </Panel>

              <Panel title="Run">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-[12px]">
                  {[
                    ["Epochs run", `${curve.length}`, `of ${m.training?.max_epochs ?? 60} max`],
                    ["Best epoch", bestEp ? `${bestEp.epoch}` : "—", bestEp ? `${pts(bestEp.val_mae, 2)} pts error` : ""],
                    ["Parameters", m.training ? fmtK(m.training.parameters[m.variant]) : "—", "per network"],
                    ["Early stop", m.training ? `${m.training.early_stopping_patience}` : "—", "epochs patience"],
                    ["Batch size", m.training ? `${m.training.batch_size}` : "—", "AdamW · one-cycle"],
                    ["Peak LR", "3e-3", "mixed precision"],
                  ].map(([k, v, s]) => (
                    <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2">
                      <dt className="text-[10.5px] text-white/45">{k}</dt>
                      <dd className="text-[18px] font-semibold tabular-nums text-white">{v}</dd>
                      <dd className="text-[10.5px] text-white/40">{s}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="vs. baselines on unseen terrain">
                <div className="space-y-3.5">
                  <Compare
                    label="Average error"
                    lowerBetter
                    fmt={(v) => `${pts(v)} pts`}
                    values={[
                      { name: "AI model", v: ai.touchdown_mae, ai: true },
                      { name: "Physics 80 m", v: phys.touchdown_mae },
                      { name: "Rule score", v: rule.touchdown_mae },
                    ]}
                  />
                  <Compare
                    label="Missed vs. safest of 10"
                    lowerBetter
                    fmt={(v) => `${pts(v, 2)} pts`}
                    values={[
                      { name: "AI model", v: ai.pick_best_of_10_sites.mean_regret, ai: true },
                      { name: "Physics 80 m", v: phys.pick_best_of_10_sites.mean_regret },
                      { name: "Rule score", v: rule.pick_best_of_10_sites.mean_regret },
                    ]}
                  />
                  <Compare
                    label="Ranking accuracy (ρ)"
                    fmt={(v) => v.toFixed(3)}
                    values={[
                      { name: "AI model", v: ai.touchdown_spearman, ai: true },
                      { name: "Physics 80 m", v: phys.touchdown_spearman },
                      { name: "Rule score", v: rule.touchdown_spearman },
                    ]}
                  />
                </div>
              </Panel>

              <Panel title="Calibration" right={<span className="text-[10.5px] text-white/40">on the line = honest %</span>}>
                <div className="h-56">
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 6, right: 10, left: -10, bottom: 4 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} stroke="rgba(255,255,255,0.12)" tickLine={false} label={{ value: "predicted %", position: "insideBottomRight", offset: -2, fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
                      <YAxis type="number" dataKey="y" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={AXIS} stroke="rgba(255,255,255,0.12)" tickLine={false} width={40} />
                      <ZAxis type="number" dataKey="n" range={[30, 260]} />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                      <Tooltip contentStyle={TIP} cursor={false} formatter={(v, k) => [k === "n" ? `${v} sites` : `${Number(v).toFixed(1)}%`, k === "x" ? "predicted" : k === "y" ? "actual" : "bin size"]} />
                      <Scatter data={calib} fill={AI} stroke="#020617" strokeWidth={1.5} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Data">
                <SplitDisc m={m} />
              </Panel>
            </div>

            <Panel title="Architectures tried">
              <div className="grid gap-2 md:grid-cols-3">
                {VARIANT.filter((v) => m.variants_test[v.key]).map((v) => {
                  const r = m.variants_test[v.key];
                  const on = v.key === m.variant;
                  return (
                    <div key={v.key} className={`rounded-lg border p-3 ${on ? "border-white/25 bg-white/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
                      <div className="flex items-center gap-2 text-[12.5px] font-medium text-white">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
                        {v.label}
                        {on && <span className="ml-auto rounded-full bg-sky-400/15 px-2 py-px text-[10px] text-sky-200">deployed</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        {[
                          ["error", r.touchdown_mae !== null ? `${pts(r.touchdown_mae, 2)}` : "—"],
                          ["ρ", r.touchdown_spearman.toFixed(3)],
                          ["params", m.training ? fmtK(m.training.parameters[v.key] ?? 0) : "—"],
                        ].map(([k, val]) => (
                          <div key={k}>
                            <div className="text-[15px] font-semibold tabular-nums text-white/90">{val}</div>
                            <div className="text-[10px] text-white/40">{k}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
