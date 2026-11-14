import type { Verdict } from "@/lib/types";
import { VERDICT } from "@/lib/ui";

export function VerdictChip({ v, className = "" }: { v: Verdict; className?: string }) {
  const s = VERDICT[v];
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${className}`} style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}
