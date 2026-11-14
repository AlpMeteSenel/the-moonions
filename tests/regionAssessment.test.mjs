import assert from "node:assert/strict";
import test from "node:test";
import { regionAssessment, sharePercent } from "../src/lib/regionAssessment.ts";

const region = (stats = {}, zones = []) => ({
  stats: { viable_share: 0, viable_km2: 0, area_km2: 225, best_success: 0, ...stats },
  zones,
});

test("a 92% isolated spot does not imply a suitable region", () => {
  const result = regionAssessment(region({ best_success: 0.92, viable_share: 0.0003, viable_km2: 0.06 }, [{ fits_ellipse: true }]));
  assert.equal(result.verdict, "no-go");
  assert.match(result.reasons.join(" "), /0.06 of 225 km².*0.03%/);
});

test("sufficient area still needs a full ellipse fit", () => {
  const result = regionAssessment(region({ best_success: 0.99, viable_share: 0.3, viable_km2: 67.5 }, [{ fits_ellipse: false }]));
  assert.equal(result.verdict, "no-go");
  assert.equal(result.fittingZones, 0);
});

test("one large continuous zone is viable without separate backup patches", () => {
  const result = regionAssessment(region({ best_success: 1, viable_share: 0.65, viable_km2: 150 }, [{ fits_ellipse: true }]));
  assert.equal(result.verdict, "go");
  assert.match(result.reasons.join(" "), /several possible targets/);
});

test("a fitting zone in only a small share of the region is limited, not viable", () => {
  const result = regionAssessment(region({ best_success: 1, viable_share: 0.06, viable_km2: 13.5 }, [{ fits_ellipse: true }, { fits_ellipse: true }]));
  assert.equal(result.verdict, "caution");
  assert.match(result.reasons.join(" "), /6%.*little room/);
});

test("a region with area and backup zones is viable for review", () => {
  assert.equal(regionAssessment(region({ best_success: 0.95, viable_share: 0.5, viable_km2: 112.5 }, [{ fits_ellipse: true }, { fits_ellipse: true }])).verdict, "go");
});

test("the 2% boundary agrees with the landing-window threshold", () => {
  assert.equal(regionAssessment(region({ best_success: 0.95, viable_share: 0.02, viable_km2: 4.5 }, [{ fits_ellipse: true }])).verdict, "no-go");
});

test("tiny nonzero areas are never displayed as zero", () => {
  assert.equal(sharePercent(0.0003), "0.03%");
  assert.equal(sharePercent(0.00001), "<0.01%");
  assert.equal(sharePercent(0), "0%");
  assert.equal(sharePercent(1), "100%");
});
