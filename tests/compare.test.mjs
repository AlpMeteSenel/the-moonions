import assert from "node:assert/strict";
import test from "node:test";
import { earthLine, fmtDuration, rankKey, runs, stayOutcome, sunLine } from "../src/lib/compare.ts";

const cond = (o = {}) => {
  const n = 337;
  const base = {
    days: 14,
    comm_mask_deg: 1,
    now: { sun_up: true, earth_up: true },
    next: { sunset: { in_hours: 249.4 }, sunrise: null, earthset: null, earthrise: null },
    stay: { hours: 156, power_ok: true, lowest_battery: 0.95, sunlit_share: 1, earth_share: 1 },
    series: { earth_above_skyline: Array(n).fill(12), battery: Array(157).fill(1) },
  };
  return { ...base, ...o, now: { ...base.now, ...o.now }, next: { ...base.next, ...o.next }, stay: { ...base.stay, ...o.stay }, series: { ...base.series, ...o.series } };
};

test("durations read naturally", () => {
  assert.equal(fmtDuration(0.5), "30 min");
  assert.equal(fmtDuration(3.77), "3 h 46 min");
  assert.equal(fmtDuration(249.4), "10 d 9 h");
  assert.equal(fmtDuration(48), "2 d");
});

test("planned Malapert: works, sun sets after the stay", () => {
  const c = cond();
  assert.equal(stayOutcome(c).tone, "go");
  assert.equal(sunLine(c), "Up · sets in 10 d 9 h");
  assert.equal(earthLine(c), "In view · stays up 14 days");
});

test("dark at touchdown: fails and says when the batteries run flat", () => {
  const battery = Array.from({ length: 157 }, (_, i) => Math.max(0, 1 - i / 50));
  const c = cond({ now: { sun_up: false }, next: { sunset: null, sunrise: { in_hours: 218.5 } }, stay: { power_ok: false, lowest_battery: 0, sunlit_share: 0 }, series: { battery } });
  const o = stayOutcome(c);
  assert.equal(o.tone, "no-go");
  assert.match(o.detail, /after 2 d 2 h: the Sun is behind the terrain/);
  assert.equal(sunLine(c), "Down · rises in 9 d 3 h");
});

test("Earth gap during the stay is a caution, too little Earth is a fail", () => {
  const gap = Array(337).fill(5).fill(-2, 10, 40);
  assert.equal(stayOutcome(cond({ series: { earth_above_skyline: gap }, stay: { earth_share: 0.8 } })).tone, "caution");
  assert.equal(stayOutcome(cond({ stay: { earth_share: 0.3 } })).tone, "no-go");
});

test("runs and ranking", () => {
  assert.deepEqual(runs([false, true, true, false, true]), [[1, 3], [4, 5]]);
  assert.ok(rankKey(cond(), 0.5) > rankKey(cond({ stay: { power_ok: false } }), 0.9));
});

test("power is fine but it is dark at touchdown: not a valid landing", () => {
  const o = stayOutcome(cond({ now: { sun_up: false }, next: { sunrise: { in_hours: 10.9 } } }));
  assert.equal(o.tone, "no-go");
  assert.equal(o.title, "Dark at touchdown");
  assert.match(o.detail, /rises in 10 h 54 min/);
});
