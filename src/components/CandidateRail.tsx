"use client";

import { Crosshair, Loader2, Search, Trash2 } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { fmtLat, fmtLon } from "@/lib/geo";
import { evalKey, halfSizeOf, regionKey, useStore } from "@/lib/store";
import type { Site } from "@/lib/types";
import { scoreColor, VERDICT } from "@/lib/ui";
import { regionAssessment } from "@/lib/regionAssessment";

const ORDER = ["My candidates", "Artemis III region", "South pole", "Historic landing"];

const Row = memo(function Row({ site }: { site: Site }) {
  const selected = useStore((s) => s.selectedId === site.id);
  const inCmp = useStore((s) => s.compareIds.includes(site.id));
  const ev = useStore((s) => s.evals[evalKey(site.id, s)]);
  const region = useStore((s) => s.regions[regionKey(site.id, s.landingTime, halfSizeOf(site))]);
  const loading = useStore((s) => Boolean(s.loading[site.id]));
  const select = useStore((s) => s.select);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const removeSite = useStore((s) => s.removeSite);
  const viable = region?.available ? region.stats.viable_km2 : undefined;
  const assessment = region?.available ? regionAssessment(region) : undefined;
  return (
    <div
      onClick={() => select(site.id)}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition ${selected ? "bg-white/10 ring-1 ring-white/15" : "hover:bg-white/5"}`}
    >
      <input
        type="checkbox"
        checked={inCmp}
        onClick={(e) => e.stopPropagation()}
        onChange={() => toggleCompare(site.id)}
        title="Add to comparison"
        className="h-3.5 w-3.5 accent-sky-400"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white">
          {site.name}
          {site.approx && <span className="ml-1 text-[10px] text-white/35" title="Approximate region centre">≈</span>}
        </div>
        <div className="text-[10px] tabular-nums text-white/40">
          {fmtLat(site.lat)} · {fmtLon(site.lon)}
        </div>
      </div>
      {viable !== undefined && (
        <span
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums"
          style={{ color: VERDICT[assessment!.verdict].color, background: VERDICT[assessment!.verdict].bg }}
          title={`${assessment!.label}. ${assessment!.reasons.join(" ")}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT[assessment!.verdict].color }} />
          {viable >= 10 ? Math.round(viable) : viable} km²
        </span>
      )}
      {loading ? (
        <Loader2 size={14} className="animate-spin text-white/40" />
      ) : ev && !assessment ? (
        <span className="w-6 text-right text-[12px] font-semibold tabular-nums" style={{ color: scoreColor(ev.overall) }} title="Rule-based score at the region centre only">
          {Math.round(ev.overall)}
        </span>
      ) : null}
      {site.custom && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeSite(site.id);
          }}
          className="hidden text-white/30 hover:text-red-300 group-hover:block"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
});

export default function CandidateRail() {
  const sites = useStore((s) => s.sites);
  const placing = useStore((s) => s.placing);
  const togglePlacing = useStore((s) => s.togglePlacing);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, Site[]>();
    for (const site of sites) {
      if (q && !site.name.toLowerCase().includes(q.toLowerCase())) continue;
      m.set(site.group, [...(m.get(site.group) ?? []), site]);
    }
    return [...m.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, [sites, q]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950">
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
          <Search size={14} className="text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
        </div>
        <button
          onClick={togglePlacing}
          className={`flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${placing ? "bg-sky-400 text-slate-950" : "bg-white/[0.06] text-white/85 hover:bg-white/10"}`}
        >
          <Crosshair size={14} /> {placing ? "Click on the Moon to place…" : "Add candidate on the map"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {groups.map(([g, list]) => (
          <div key={g} className="mb-3">
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">{g}</div>
            {list.map((site) => (
              <Row key={site.id} site={site} />
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3 text-[10px] leading-relaxed text-white/35">
        Double-click the Moon to fly there. ≈ marks approximate region centres; “Best spots” searches the whole 15 × 15 km region.
      </div>
    </aside>
  );
}
