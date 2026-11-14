"use client";

import { FastForward, Loader2, MapPin, Play, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dwellMs, runAgents, type AgentDecision, type AgentEvent, type AgentId, type AgentInfo, type Vote } from "@/lib/agents";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/ui";
import { DESK, drawAstronaut, drawBackground, drawHologram, drawMonitor, drawPaper, FLOOR, H, HOME, TABLE_X, W, type Pose } from "./pixel";

const IDS: AgentId[] = ["scout", "terrain", "power", "chief", "comms", "timing", "safety"];
const SPECIALISTS: AgentId[] = ["terrain", "power", "comms", "timing", "safety"];
const DEFAULT_ROSTER: AgentInfo[] = [
  { id: "chief", name: "Chief", role: "Flight Director", color: "#f472b6" },
  { id: "scout", name: "Ada", role: "Site Scout", color: "#22d3ee" },
  { id: "terrain", name: "Rocco", role: "Terrain", color: "#a3e635" },
  { id: "power", name: "Sol", role: "Power", color: "#fbbf24" },
  { id: "comms", name: "Echo", role: "Comms", color: "#60a5fa" },
  { id: "timing", name: "Tempo", role: "Timing", color: "#c084fc" },
  { id: "safety", name: "Nova", role: "Safety", color: "#fb7185" },
];
const VOTE_STYLE: Record<Vote, string> = { GO: "bg-emerald-400 text-emerald-950", CAUTION: "bg-amber-300 text-amber-950", "NO-GO": "bg-red-400 text-red-950" };
const WALK = 46; // logical px per second
const CROP = 44; // docked under the map: show the habitat and horizon, not the empty upper sky

type Bubble = { text: string; kind: "say" | "tool" | "think" | "error"; until: number };
type Sim = {
  x: number;
  target: number;
  facing: 1 | -1;
  pending: number;
  bubble: Bubble | null;
  badge: { vote: Vote; until: number } | null;
  returnAt: number | null; // when at the table: time to walk back home
  cheer: boolean;
};
type Paper = { from: number; to: number; t0: number; dur: number; color: string };

const short = (s: string, n = 78) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function newSims(): Record<AgentId, Sim> {
  return Object.fromEntries(IDS.map((id) => [id, { x: HOME[id], target: HOME[id], facing: 1, pending: 0, bubble: null, badge: null, returnAt: null, cheer: false }])) as Record<AgentId, Sim>;
}

export default function MissionControl({ visible }: { visible: boolean }) {
  const landingTime = useStore((s) => s.landingTime);
  const missionHours = useStore((s) => s.missionHours);
  const sites = useStore((s) => s.sites);
  const applyPlan = useStore((s) => s.setLandingTimeAndSelect);
  const applyRef = useRef(applyPlan);
  applyRef.current = applyPlan;

  const [start, setStart] = useState(() => landingTime.slice(0, 10));
  const [days, setDays] = useState(14);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<AgentInfo[]>(DEFAULT_ROSTER);
  const [llm, setLlm] = useState<string | null | undefined>(undefined);
  const [log, setLog] = useState<AgentEvent[]>([]);
  const [votes, setVotes] = useState<Record<string, Partial<Record<AgentId, Vote>>>>({});
  const [decision, setDecision] = useState<AgentDecision | null | undefined>(undefined);
  const [, setFrame] = useState(0);

  const canvas = useRef<HTMLCanvasElement>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);
  const sims = useRef(newSims());
  const papers = useRef<Paper[]>([]);
  const queue = useRef<AgentEvent[]>([]);
  const nextAt = useRef(0);
  const speedRef = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  speedRef.current = speed;
  const decisionRef = useRef(decision);
  decisionRef.current = decision;
  const runningRef = useRef(running);
  runningRef.current = running;

  const info = useMemo(() => Object.fromEntries(roster.map((r) => [r.id, r])) as Record<AgentId, AgentInfo>, [roster]);
  const infoRef = useRef(info);
  infoRef.current = info;
  const siteName = useCallback((id?: string) => sites.find((s) => s.id === id)?.name ?? id ?? "", [sites]);

  // ---------------------------------------------------------------- events -> stage
  const apply = useCallback((e: AgentEvent, now: number) => {
    const S = sims.current;
    const a = S[e.agent];
    const sp = speedRef.current;
    const hold = (ms: number) => now + (ms * 1.5) / sp;
    const fly = (from: AgentId, to: AgentId) =>
      papers.current.push({ from: S[from].x, to: S[to].x, t0: now, dur: 700 / sp, color: infoRef.current[from]?.color ?? "#fff" });
    switch (e.kind) {
      case "roster":
        if (e.roster) setRoster(e.roster);
        setLlm(e.llm ?? null);
        return;
      case "tool":
        a.pending++;
        a.bubble = { text: short(e.text, 46), kind: "tool", until: hold(900) };
        break;
      case "tool_done":
        a.pending = Math.max(0, a.pending - 1);
        return;
      case "say":
      case "report":
        a.bubble = { text: short(e.text), kind: "say", until: hold(dwellMs(e)) };
        if (e.kind === "report" && e.agent !== "chief") {
          a.target = TABLE_X - 16;
          a.returnAt = null;
        }
        if (e.to && e.to !== e.agent) fly(e.agent, e.to);
        break;
      case "handoff":
        a.bubble = { text: short(e.text), kind: "say", until: hold(1100) };
        if (e.to) fly(e.agent, e.to);
        break;
      case "vote":
        if (e.vote) a.badge = { vote: e.vote, until: hold(1600) };
        a.bubble = { text: short(e.text.replace(/^[^:]+: /, ""), 60), kind: "say", until: hold(900) };
        fly(e.agent, "chief");
        if (e.vote && e.site_id) setVotes((v) => ({ ...v, [e.site_id!]: { ...v[e.site_id!], [e.agent]: e.vote } }));
        break;
      case "think":
        a.bubble = { text: short(e.text), kind: "think", until: hold(60000) };
        break;
      case "error":
        a.bubble = { text: short(e.text), kind: "error", until: hold(6000) };
        setError(e.text);
        break;
      case "decision": {
        S.chief.bubble = { text: e.decision ? (e.decision.go ? "GO for landing!" : "NO-GO") : "NO-GO", kind: "say", until: hold(5000) };
        setDecision(e.decision ?? null);
        // show the team's pick on the map above straight away
        if (e.decision) applyRef.current(e.decision.primary.site_id, e.decision.primary.landing_time);
        const go = !!e.decision?.go;
        IDS.filter((id) => id !== "chief").forEach((id, i) => {
          const side = i < 3 ? -1 : 1;
          const k = i < 3 ? 3 - i : i - 2;
          S[id].target = TABLE_X + side * (12 + k * 11);
          S[id].returnAt = null;
          S[id].cheer = go;
          S[id].pending = 0;
        });
        S.chief.cheer = go;
        break;
      }
    }
    setLog((l) => [...l, e]);
  }, []);

  const start_ = useCallback(async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    sims.current = newSims();
    papers.current = [];
    queue.current = [];
    nextAt.current = 0;
    setLog([]);
    setVotes({});
    setDecision(undefined);
    setError(null);
    setStreamDone(false);
    setRunning(true);
    try {
      await runAgents(`${start}T00:00:00Z`, days, missionHours, (e) => queue.current.push(e), ctl.signal);
    } catch (err) {
      if (!ctl.signal.aborted) {
        const msg = String((err as Error).message ?? err);
        setError(msg);
        queue.current.push({ seq: -1, t: 0, agent: "chief", kind: "error", text: msg });
      }
    } finally {
      if (!ctl.signal.aborted) setStreamDone(true);
    }
  }, [start, days, missionHours]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (running && streamDone && queue.current.length === 0 && decision !== undefined) setRunning(false);
  }, [running, streamDone, decision, log]);

  // ---------------------------------------------------------------- layout
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(1, Math.min(el.clientWidth / W, el.clientHeight / (H - CROP)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------------------------------------------------------------- animation loop
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // play the next queued event once the current one has had its time on stage
      while (queue.current.length && now >= nextAt.current) {
        const e = queue.current.shift()!;
        apply(e, now);
        nextAt.current = now + dwellMs(e) / speedRef.current;
      }
      const S = sims.current;
      for (const id of IDS) {
        const a = S[id];
        if (a.returnAt === null && a.target !== HOME[id] && Math.abs(a.x - a.target) < 0.5 && !a.cheer && id !== "chief" && decisionRef.current === undefined) a.returnAt = now + 900 / speedRef.current;
        if (a.returnAt !== null && now >= a.returnAt) {
          a.target = HOME[id];
          a.returnAt = null;
        }
        const d = a.target - a.x;
        if (Math.abs(d) > 0.5) {
          a.x += Math.sign(d) * Math.min(Math.abs(d), WALK * speedRef.current * dt);
          a.facing = d > 0 ? 1 : -1;
        } else if (id !== "chief" && a.x === HOME[id]) a.facing = 1;
        if (a.bubble && now > a.bubble.until) a.bubble = null;
        if (a.badge && now > a.badge.until) a.badge = null;
      }
      papers.current = papers.current.filter((p) => now < p.t0 + p.dur);
      draw(now / 1000);
      if (now - lastUi > 80) {
        lastUi = now;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible, apply]);

  function draw(t: number) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (!bg.current) {
      bg.current = document.createElement("canvas");
      bg.current.width = W;
      bg.current.height = H;
      drawBackground(bg.current.getContext("2d")!);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg.current, 0, 0);
    const S = sims.current;
    const inf = infoRef.current;
    const busy = runningRef.current && decisionRef.current === undefined;
    const verdict = decisionRef.current === undefined ? null : decisionRef.current?.go ? "GO" : "NO";
    drawHologram(ctx, t, busy, verdict === null ? null : verdict === "GO" ? "GO" : "NO");
    for (const id of IDS) if (id !== "chief") drawMonitor(ctx, id, inf[id]?.color ?? "#fff", S[id].pending > 0 || (busy && id === "scout" && S.scout.pending > 0), t);
    for (const id of IDS) {
      const a = S[id];
      const moving = Math.abs(a.target - a.x) > 0.5;
      let pose: Pose = "stand";
      let y = FLOOR;
      if (moving) pose = Math.floor(t * 8) % 2 ? "walk1" : "walk2";
      else if (a.cheer) {
        pose = "cheer";
        y = FLOOR - (Math.floor(t * 4 + IDS.indexOf(id)) % 2 ? 3 : 0);
      } else if (a.pending > 0) pose = Math.floor(t * 7) % 2 ? "type1" : "type2";
      else if (Math.floor(t * 1.2 + IDS.indexOf(id) * 0.7) % 7 === 0) y = FLOOR - 1;
      drawAstronaut(ctx, a.x, y, inf[id]?.color ?? "#fff", pose, a.facing, id === "chief");
    }
    for (const p of papers.current) {
      const k = Math.min(1, Math.max(0, (t * 1000 - p.t0) / p.dur));
      const x = p.from + (p.to - p.from) * k;
      const y = FLOOR - 18 - Math.sin(Math.PI * k) * 14;
      drawPaper(ctx, x, y, p.color);
    }
  }

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  // ---------------------------------------------------------------- UI
  const sceneW = W * scale;
  const sceneH = H * scale;
  const options = Object.keys(votes);
  const S = sims.current;

  return (
    <div className="h-full min-h-0 bg-[#03040a]" style={{ display: visible ? "flex" : "none" }}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 whitespace-nowrap border-b border-white/5 px-3 py-1.5 text-[12px]">
          <label className="flex items-center gap-1.5 text-white/55">
            From
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={running} className="w-[124px] rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-white [color-scheme:dark]" />
          </label>
          <label className="flex items-center gap-1.5 text-white/55">
            for
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={running} className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-white">
              {[7, 14, 21, 28].map((d) => (
                <option key={d} value={d} className="bg-slate-900">
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button onClick={start_} disabled={running} className="flex items-center gap-1.5 rounded-md bg-cyan-400 px-2.5 py-1 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">
            {running ? <Loader2 size={13} className="animate-spin" /> : log.length ? <RotateCcw size={13} /> : <Play size={13} />}
            {running ? "Agents at work…" : log.length ? "Run again" : "Start the team"}
          </button>
          <div className="ml-auto flex items-center gap-1 text-white/50">
            <FastForward size={13} />
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`rounded px-1.5 py-0.5 tabular-nums ${speed === s ? "bg-white/15 text-white" : "hover:text-white"}`}>
                {s}×
              </button>
            ))}

          </div>
        </div>

        <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden" style={{ width: sceneW, height: (H - CROP) * scale }}>
          <div className="absolute inset-x-0" style={{ top: -CROP * scale, height: sceneH }}>
            <canvas ref={canvas} width={W} height={H} className="block h-full w-full" style={{ imageRendering: "pixelated" }} />
            {/* name plates on the regolith below each station */}
            {IDS.map((id) => (
              <div key={id} title={info[id]?.role} className="absolute -translate-x-1/2 whitespace-nowrap text-center text-[10.5px] font-bold leading-none" style={{ left: DESK[id] * scale, top: 172 * scale, color: info[id]?.color }}>
                {info[id]?.name}
              </div>
            ))}
            {/* speech bubbles and vote badges */}
            {IDS.map((id, i) => {
              const a = S[id];
              const lift = (id === "chief" ? 34 : i % 2 ? 30 : 20) * scale;
              return (
                <div key={id} className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: Math.min(sceneW - 98, Math.max(98, a.x * scale)), bottom: (H - FLOOR) * scale + lift }}>
                  {a.bubble && (
                    <div
                      className={`max-w-[190px] rounded-lg border px-2 py-1 text-[11px] leading-snug shadow-lg ${
                        a.bubble.kind === "tool" ? "border-white/10 bg-slate-900/95 font-mono text-[10px] text-white/70" : a.bubble.kind === "think" ? "border-pink-300/40 bg-slate-900/95 italic text-pink-100" : a.bubble.kind === "error" ? "border-red-400/50 bg-red-950/90 text-red-100" : "border-white/20 bg-white text-slate-900"
                      }`}
                    >
                      {a.bubble.text}
                    </div>
                  )}
                  {a.badge && <div className={`rounded px-1.5 py-px text-[10px] font-black ${VOTE_STYLE[a.badge.vote]}`}>{a.badge.vote}</div>}
                </div>
              );
            })}
            {decision && (
              <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-lg border px-4 py-2 text-center shadow-2xl ${decision.go ? "border-emerald-300/60 bg-emerald-950/90" : "border-red-300/60 bg-red-950/90"}`} style={{ top: (CROP + 6) * scale }}>
                <div className={`text-[18px] font-black tracking-wide ${decision.go ? "text-emerald-300" : "text-red-300"}`}>{decision.go ? "GO FOR LANDING" : "NO-GO"}</div>
                <div className="text-[12px] text-white">
                  {decision.primary.name}
                  {decision.primary.zone ? ` · ${decision.primary.zone.id}` : ""} · {fmtTime(decision.primary.landing_time)}
                </div>
              </div>
            )}
          </div>
          </div>
          {!log.length && !running && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <button onClick={start_} className="flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-[13px] font-semibold text-slate-950 shadow-xl hover:bg-cyan-300">
                <Play size={14} /> Start the team
              </button>
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/10 bg-slate-950">
        <div className="border-b border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Vote board
            <span className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10.5px] normal-case tracking-normal text-white/60" title={llm ? `The Flight Director reasons with ${llm}; its pick is checked against the specialists' vetoes` : "Rule-based Flight Director"}>
              <Sparkles size={12} className="text-pink-300" />
              {llm ? llm.split("/").pop() : llm === null ? "rules" : "LLM"}
            </span>
          </div>
          {options.length ? (
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  <th />
                  {SPECIALISTS.map((id) => (
                    <th key={id} className="pb-1 text-center font-semibold" style={{ color: info[id]?.color }} title={info[id]?.role}>
                      {info[id]?.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((sid) => (
                  <tr key={sid}>
                    <td className="max-w-[110px] truncate py-0.5 pr-2 text-white/80" title={siteName(sid)}>
                      {siteName(sid)}
                    </td>
                    {SPECIALISTS.map((id) => {
                      const v = votes[sid]?.[id];
                      return (
                        <td key={id} className="px-0.5 py-0.5 text-center">
                          {v ? <span className={`inline-block w-full rounded px-1 text-[9.5px] font-bold ${VOTE_STYLE[v]}`}>{v === "CAUTION" ? "WARN" : v}</span> : <span className="text-white/20">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-[11px] text-white/35">Votes from the specialists appear here as each finalist is checked.</div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {log
            .filter((e) => e.kind !== "tool_done")
            .map((e) => (
              <div key={`${e.seq}-${e.kind}`} className={`flex gap-2 text-[11.5px] leading-snug ${e.kind === "tool" ? "text-white/40" : "text-white/85"}`}>
                <span className="mt-[3px] h-2 w-2 shrink-0 rounded-sm" style={{ background: info[e.agent]?.color }} />
                <div className="min-w-0">
                  <span className="font-semibold" style={{ color: info[e.agent]?.color }}>
                    {info[e.agent]?.name}
                  </span>{" "}
                  {e.kind === "decision" ? <span className="font-semibold">{e.headline ?? e.text}</span> : e.kind === "tool" ? <span className="font-mono text-[10.5px]">▸ {e.text}</span> : e.kind === "vote" && e.vote ? <><span className={`mr-1 rounded px-1 text-[9.5px] font-bold ${VOTE_STYLE[e.vote]}`}>{e.vote}</span>{e.text.replace(/: (GO|CAUTION|NO-GO), /, ": ")}</> : e.text}
                </div>
              </div>
            ))}
          {error && <div className="rounded-md border border-red-400/40 bg-red-950/50 p-2 text-[11px] text-red-200">{error}</div>}
          <div ref={logEnd} />
        </div>

        {decision && (
          <div className={`border-t p-3 ${decision.go ? "border-emerald-400/30 bg-emerald-950/30" : "border-red-400/30 bg-red-950/30"}`}>
            <div className={`text-[13px] font-bold ${decision.go ? "text-emerald-300" : "text-red-300"}`}>
              {decision.go ? "GO" : "NO-GO"} · {decision.primary.name}
              {decision.primary.zone ? ` · zone ${decision.primary.zone.id}` : ""}
            </div>
            <div className="text-[11px] text-white/60">{fmtTime(decision.primary.landing_time)}</div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-white/85">{decision.rationale}</p>
            {decision.backup_zones.length > 0 && (
              <div className="mt-1.5 text-[11px] text-white/60">
                Divert targets: {decision.backup_zones.map((z) => `${z.id} ${(z.distance_m / 1000).toFixed(1)} km ${z.direction}`).join(" · ")}
              </div>
            )}
            {decision.backup_regions.length > 0 && <div className="text-[11px] text-white/60">Backup regions: {decision.backup_regions.map((r) => r.name).join(", ")}</div>}
            {decision.concerns.length > 0 && <div className="mt-1 text-[11px] text-amber-200/80">Watch: {decision.concerns.join(" · ")}</div>}
            <div className="mt-1 text-[10px] text-white/35">Decided by {decision.decided_by === "rules" ? "the rule check" : `${decision.decided_by}, checked against the vetoes`}</div>
            <button
              onClick={() => {
                applyPlan(decision.primary.site_id, decision.primary.landing_time);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/15"
            >
              <MapPin size={13} /> Shown on the map above
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
