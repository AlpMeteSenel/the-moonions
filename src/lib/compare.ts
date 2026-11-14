import type { Conditions } from "./types";

/** "45 min", "3 h 46 min", "10 d 9 h". */
export function fmtDuration(hours: number): string {
  const m = Math.round(hours * 60);
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.round((m - d * 1440) / 60);
  return h === 24 ? `${d + 1} d` : h ? `${d} d ${h} h` : `${d} d`;
}

export type Tone = "go" | "caution" | "no-go";
export type StayOutcome = { tone: Tone; title: string; detail: string };

/** Minimum share of the stay with Earth in view for a direct-to-Earth link (same as the AI comms gate). */
export const COMMS_MIN_SHARE = 0.5;

function hoursWhere(values: number[], n: number, pred: (v: number) => boolean) {
  let k = 0;
  for (let i = 0; i < Math.min(n, values.length); i++) if (pred(values[i])) k++;
  return k; // series is hourly
}

/** Plain-language answer to "does the surface stay work?" for one option. */
export function stayOutcome(c: Conditions): StayOutcome {
  const stayH = c.stay.hours;
  const mask = c.comm_mask_deg;
  if (!c.stay.power_ok) {
    const empty = c.series.battery.findIndex((b) => b <= 0.001);
    const why = !c.now.sun_up ? "the Sun is behind the terrain at touchdown" : c.next.sunset ? `the Sun sets after ${fmtDuration(c.next.sunset.in_hours)}` : "too little sunlight";
    return { tone: "no-go", title: "Stay fails", detail: `Batteries run flat${empty > 0 ? ` after ${fmtDuration(empty)}` : ""}: ${why}.` };
  }
  if (!c.now.sun_up)
    return {
      tone: "no-go",
      title: "Dark at touchdown",
      detail: c.next.sunrise ? `The Sun is behind the terrain; it rises in ${fmtDuration(c.next.sunrise.in_hours)}. Land after that.` : "The Sun is behind the terrain for the next 14 days.",
    };
  const earthOut = hoursWhere(c.series.earth_above_skyline, stayH, (v) => v < mask);
  if (c.stay.earth_share < COMMS_MIN_SHARE)
    return { tone: "no-go", title: "No reliable Earth link", detail: `Earth is in view only ${Math.round(c.stay.earth_share * 100)}% of the stay: needs a relay.` };
  if (earthOut > 0) return { tone: "caution", title: "Stay works, with a radio gap", detail: `Earth is hidden for ${fmtDuration(earthOut)} of the stay.` };
  if (c.stay.lowest_battery < 0.3) return { tone: "caution", title: "Stay works, tight on power", detail: `Battery dips to ${Math.round(c.stay.lowest_battery * 100)}%.` };
  return { tone: "go", title: "Stay works", detail: c.stay.sunlit_share >= 0.999 ? "Sunlight and Earth contact for the whole stay." : `Earth in view throughout; battery stays above ${Math.round(c.stay.lowest_battery * 100)}%.` };
}

export function sunLine(c: Conditions): string {
  if (c.now.sun_up) return c.next.sunset ? `Up · sets in ${fmtDuration(c.next.sunset.in_hours)}` : `Up · stays up ${Math.round(c.days)} days`;
  return c.next.sunrise ? `Down · rises in ${fmtDuration(c.next.sunrise.in_hours)}` : `Down · stays down ${Math.round(c.days)} days`;
}

export function earthLine(c: Conditions): string {
  if (c.now.earth_up) return c.next.earthset ? `In view · sets in ${fmtDuration(c.next.earthset.in_hours)}` : `In view · stays up ${Math.round(c.days)} days`;
  return c.next.earthrise ? `Hidden · rises in ${fmtDuration(c.next.earthrise.in_hours)}` : `Hidden · stays hidden ${Math.round(c.days)} days`;
}

/** Runs of `true` as [start, end) index pairs, for drawing the day strips. */
export function runs(flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  flags.forEach((f, i) => {
    if (f && s < 0) s = i;
    if (!f && s >= 0) {
      out.push([s, i]);
      s = -1;
    }
  });
  if (s >= 0) out.push([s, flags.length]);
  return out;
}

const TONE_RANK: Record<Tone, number> = { go: 2, caution: 1, "no-go": 0 };

/** Order options best first: stay outcome, then landable share of the region, then sunlight + Earth over the stay. */
export function rankKey(c: Conditions, viableShare: number | undefined): number {
  return TONE_RANK[stayOutcome(c).tone] * 1000 + (viableShare ?? 0) * 100 + (c.stay.sunlit_share + c.stay.earth_share) * 10;
}
