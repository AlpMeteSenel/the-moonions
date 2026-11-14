"use client";

import { Check, ExternalLink, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { fmtLat, fmtLon } from "@/lib/geo";
import { useStore } from "@/lib/store";
import type { Proposal } from "@/lib/types";
import { fmtTime, scoreColor } from "@/lib/ui";
import { VerdictChip } from "./Chip";

const STATUS: Record<Proposal["status"], string> = {
  pending: "bg-white/10 text-white/70",
  accepted: "bg-emerald-400/15 text-emerald-300",
  rejected: "bg-red-400/15 text-red-300",
};

function Row({ p }: { p: Proposal }) {
  const s = useStore();
  const [notes, setNotes] = useState(p.notes ?? "");
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS[p.status]}`}>{p.status}</span>
          <span className="truncate text-[13px] font-semibold text-white">{p.name}</span>
          <VerdictChip v={p.verdict} />
          <span className="text-sm font-semibold tabular-nums" style={{ color: scoreColor(p.overall) }}>
            {Math.round(p.overall)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-white/45">
          {fmtLat(p.lat)} · {fmtLon(p.lon)} · touchdown {fmtTime(p.landing_time)} · {p.backups ?? 0} backups · {p.profile}
          {p.decided_at && <> · decided {fmtTime(p.decided_at)}</>}
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== p.notes && s.decide(p.id, p.status, notes)}
          placeholder="Decision notes…"
          className="mt-2 w-full rounded-md bg-white/5 px-2 py-1 text-[12px] text-white outline-none placeholder:text-white/25 focus:ring-1 focus:ring-cyan-400/40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <button
            onClick={() => {
              if (p.verdict === "no-go" && !window.confirm(`${p.name} is rated NO-GO. Accept anyway?`)) return;
              s.decide(p.id, "accepted", notes);
            }} className="flex items-center gap-1 rounded-md bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-400/25">
            <Check size={13} /> Accept
          </button>
          <button onClick={() => s.decide(p.id, "rejected", notes)} className="flex items-center gap-1 rounded-md bg-red-400/15 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-400/25">
            <X size={13} /> Reject
          </button>
        </div>
        <div className="flex justify-end gap-1">
          <button onClick={() => s.openProposal(p)} title="Open on map" className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white">
            <ExternalLink size={13} />
          </button>
          {p.status !== "pending" && (
            <button onClick={() => s.decide(p.id, "pending", notes)} title="Reopen" className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white">
              <RotateCcw size={13} />
            </button>
          )}
          <button onClick={() => s.deleteProposal(p.id)} title="Delete" className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-red-300">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProposalsPanel() {
  const proposals = useStore((s) => s.proposals);
  const [filter, setFilter] = useState<"all" | Proposal["status"]>("all");
  const list = proposals.filter((p) => filter === "all" || p.status === filter);
  return (
    <div className="p-3">
      <div className="mb-2 flex gap-1">
        {(["all", "pending", "accepted", "rejected"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 text-[11px] capitalize ${filter === f ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>
            {f} ({f === "all" ? proposals.length : proposals.filter((p) => p.status === f).length})
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="p-4 text-sm text-white/50">No proposals yet. Select a candidate and press “Propose” to submit it for review.</div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">{list.map((p) => <Row key={p.id} p={p} />)}</div>
      )}
    </div>
  );
}
