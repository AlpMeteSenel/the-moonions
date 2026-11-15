"use client";

import { X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStore } from "@/lib/store";
import type { PickQuality, TDMetrics } from "@/lib/types";
import { pct } from "./palette";
import Source from "./Source";

type Row = { label: string; hint: string; get: (m: TDMetrics, q?: PickQuality) => number | null | undefined; fmt: (v: number) => string; better: "max" | "min" };

const ROWS: Row[] = [
  { label: "Ranks sites by safety", hint: "Spearman correlation with the simulated safe-touchdown probability (1 = perfect order)", get: (m) => m.touchdown_spearman, fmt: (v) => v.toFixed(3), better: "max" },
  { label: "Average error", hint: "Mean absolute error of the touchdown probability", get: (m) => m.touchdown_mae, fmt: (v) => `${(v * 100).toFixed(1)} pts`, better: "min" },
  { label: "Spots truly safe sites", hint: "AUC for sites with ≥ 90% safe touchdown", get: (m) => m.safe_site_auc, fmt: (v) => v.toFixed(3), better: "max" },
  { label: "Best of 10 sites: missed by", hint: "Average gap between its pick and the truly safest of 10 random sites", get: (m) => m.pick_best_of_10_sites.mean_regret, fmt: (v) => `${(v * 100).toFixed(2)} pts`, better: "min" },
  { label: "Mission pick (viable dates): missed by", hint: "Among lit, powered, Earth-linked site-dates: gap to the safest of 10", get: (_m, q) => q?.mean_regret, fmt: (v) => `${(v * 100).toFixed(2)} pts`, better: "min" },
];

const COLS = [
  { key: "ai_model", label: "AI model", src: "ai" as const },
  { key: "physics_80m_baseline", label: "Physics on 80 m map", src: "computed" as const },
  { key: "rule_based_score", label: "Rule-based score", src: "computed" as const },
] as const;

// categorical slots 1-3 (reference palette, dark steps) for the three variants
const VARIANT_COLOR: Record<string, string> = { cnn: "#3987e5", lfm: "#d95926", both: "#199e70" };

export default function ModelCardModal() {
  const open = useStore((s) => s.showModelCard);
  const setOpen = useStore((s) => s.setShowModelCard);
  const card = useStore((s) => s.modelCard);
  if (!open) return null;
  const m = card?.success_model;
  const curveData = m
    ? (m.training_curves[Object.keys(m.training_curves)[0]] ?? []).map((_, i) => {
        const row: Record<string, number> = { epoch: i + 1 };
        for (const [v, c] of Object.entries(m.training_curves)) if (c[i]) row[v] = c[i].val_mae;
        return row;
      })
    : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setOpen(false)}>
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">Model card</div>
            <div className="text-lg font-semibold text-white">{m?.name ?? "AI model"}</div>
            {m && (
              <div className="text-[11px] text-white/45">
                {m.version} · trained {new Date(m.trained_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
              </div>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>
        {!m ? (
          <div className="mt-4 text-sm text-white/60">The AI model hasn&apos;t been trained yet.</div>
        ) : (
          <>
            <p className="mt-3 text-[12px] leading-relaxed text-white/75">{m.task}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
              <b className="text-white/70">Ground truth:</b> {m.labels}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
              <b className="text-white/70">Design:</b> {m.design}
            </p>

            <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              Accuracy on unseen terrain · {m.data.test.toLocaleString()} sites, {m.data.split}
            </div>
            <table className="mt-1.5 w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-white/45">
                  <th className="py-1 font-normal" />
                  {COLS.map((c) => (
                    <th key={c.key} className="py-1 text-right font-normal">
                      <span className="inline-flex items-center gap-1">
                        {c.label} <Source kind={c.src} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const vals = COLS.map((c) => r.get(m.results_test[c.key], m.mission_test[c.key]));
                  const nums = vals.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
                  const best = r.better === "max" ? Math.max(...nums) : Math.min(...nums);
                  return (
                    <tr key={r.label} className="border-t border-white/[0.06]" title={r.hint}>
                      <td className="py-1.5 text-white/70">{r.label}</td>
                      {vals.map((v, i) => (
                        <td key={COLS[i].key} className={`py-1.5 text-right tabular-nums ${v === best ? "font-semibold text-white" : "text-white/55"}`}>
                          {typeof v === "number" && !Number.isNaN(v) ? r.fmt(v) : "—"}
                          {v === best && nums.length > 1 && <span className="ml-1 text-[10px] text-sky-300">best</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1 text-[10.5px] text-white/40">
              Light and Earth visibility are computed from ephemerides and sampled terrain; power uses generic panel, load and battery assumptions. The comparison isolates simulated touchdown safety. Only{" "}
              {pct(m.mission_test.share_of_site_dates_viable, 1)} of random polar site-dates pass those checks: timing matters as much as place.
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Training: validation error by epoch</div>
                <div className="mt-1 h-48">
                  <ResponsiveContainer>
                    <LineChart data={curveData} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="epoch" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                      <YAxis tickFormatter={(v) => `${(v * 100).toFixed(1)}`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} formatter={(v, n) => [`${(Number(v) * 100).toFixed(2)} pts`, m.variants_test[String(n)]?.label ?? String(n)]} labelFormatter={(v) => `epoch ${v}`} />
                      <Legend formatter={(v) => <span className="text-[10.5px] text-white/60">{m.variants_test[String(v)]?.label ?? v}</span>} />
                      {Object.keys(m.training_curves).map((v) => (
                        <Line key={v} dataKey={v} stroke={VARIANT_COLOR[v] ?? "#888"} strokeWidth={2} dot={false} isAnimationActive={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[10.5px] text-white/40">Mean absolute error (points of probability) on the validation region; first ensemble member of each variant.</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Is “80%” really 80%? (calibration)</div>
                <div className="mt-1 h-48">
                  <ResponsiveContainer>
                    <LineChart data={m.calibration_test.map((c) => ({ x: c.predicted, y: c.actual, n: c.n }))} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${v * 100}%`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                      <YAxis dataKey="y" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${v * 100}%`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                      <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} formatter={(v) => [pct(Number(v)), "actual"]} labelFormatter={(v) => `predicted ${pct(Number(v))}`} />
                      <Line dataKey="y" stroke="#3987e5" strokeWidth={2} dot={{ r: 4, fill: "#3987e5", stroke: "#020617", strokeWidth: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[10.5px] text-white/40">Dots on the dashed line = the predicted probabilities mean what they say.</div>
              </div>
            </div>

            <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">How the AI sees terrain · variants (5-network ensembles each)</div>
            <table className="mt-1.5 w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] text-white/45">
                  <th className="py-1 font-normal">Terrain input</th>
                  <th className="py-1 text-right font-normal">Val error</th>
                  <th className="py-1 text-right font-normal">Test error</th>
                  <th className="py-1 text-right font-normal">Test ranking</th>
                  <th className="py-1 text-right font-normal" title="Does the ensemble's disagreement track its real error? (Spearman)">Knows when unsure</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.variants_test).map(([k, v]) => (
                  <tr key={k} className="border-t border-white/[0.06]">
                    <td className="py-1.5 text-white/75">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: VARIANT_COLOR[k] }} />
                      {v.label}
                      {m.variant === k && <span className="ml-1.5 rounded bg-sky-400/15 px-1 text-[10px] text-sky-200">deployed</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-white/70">{(v.val_mae * 100).toFixed(2)} pts</td>
                    <td className="py-1.5 text-right tabular-nums text-white/70">{v.touchdown_mae !== null ? `${(v.touchdown_mae * 100).toFixed(2)} pts` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-white/70">{v.touchdown_spearman.toFixed(3)}</td>
                    <td className="py-1.5 text-right tabular-nums text-white/70">{v.uncertainty_error_spearman.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-[10.5px] text-white/40">The deployed variant is chosen on the validation region only; test numbers are reported, never used for selection.</div>

            <div className="mt-4 grid gap-4 text-[11.5px] leading-relaxed text-white/60 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Simulated lander &amp; landing</div>
                <ul className="mt-1 space-y-0.5">
                  <li>Navigation scatter ±{m.simulator.nav_sigma_m} m (1σ), hazard-avoidance range {m.simulator.hda_hop_m} m, {pct(m.simulator.hda_reliability)} reliable</li>
                  <li>
                    Footpad radius {m.simulator.footpad_radius_m} m, centre of gravity {m.simulator.cg_height_m} m high, sideways touchdown speed ±{m.simulator.lateral_sigma_mps} m/s
                  </li>
                  <li>Crew-operations slope limit {m.simulator.gear_max_slope_deg}°, slopes measured against the GRAIL gravity field</li>
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Limitations</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {m.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
            {m.foundation_model && (
              <div className="mt-3 rounded-md bg-white/[0.03] p-2 text-[10.5px] text-white/50">
                Terrain features: <b className="text-white/70">{m.foundation_model.name}</b> (NASA &amp; IBM, {m.foundation_model.license ?? "Apache-2.0"}), {m.foundation_model.repo} —{" "}
                {m.foundation_model.used ? "used by the deployed model." : "evaluated; not used by the deployed model."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
