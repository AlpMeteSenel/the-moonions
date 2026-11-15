export type SourceKind = "nasa" | "computed" | "simulated" | "ai" | "tabletop";

const STYLE: Record<SourceKind, { label: string; cls: string; title: string }> = {
  nasa: { label: "NASA data", cls: "text-slate-300 ring-slate-400/30", title: "Directly from NASA / JPL / USGS datasets" },
  computed: { label: "Computed", cls: "text-slate-300 ring-slate-400/30", title: "Calculated from source data; planning scores also use application-defined thresholds and weights" },
  simulated: { label: "Simulated", cls: "text-amber-200 ring-amber-300/30", title: "From the landing simulation (model assumptions)" },
  ai: { label: "AI estimate", cls: "text-sky-200 ring-sky-300/40", title: "Neural-network estimate trained on simulated landings over real LOLA terrain; not observed landing outcomes" },
  tabletop: { label: "Tabletop", cls: "text-fuchsia-200 ring-fuchsia-300/30", title: "Measured on the physical model" },
};

/** Provenance badge: every number on screen says where it comes from. */
export default function Source({ kind, className = "" }: { kind: SourceKind; className?: string }) {
  const s = STYLE[kind];
  return (
    <span title={s.title} className={`inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider ring-1 ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}
