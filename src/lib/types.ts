export type Verdict = "go" | "caution" | "no-go";
export type Profile = "balanced" | "safety-first" | "science-first";
export type FactorKey = "ground" | "sunlight" | "earth" | "craters" | "backups" | "science";

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  group: string;
  approx?: boolean;
  custom?: boolean;
  /** Candidates are areas: half the side of the square region, metres (Artemis III: 7500). */
  half_size_m?: number;
}

export interface Factor {
  key: FactorKey;
  label: string;
  score: number | null;
  summary: string;
  details: Record<string, unknown>;
  hard_fail: boolean;
}

export interface Divert {
  decide_by_s: number;
  hover_seconds: number;
  delta_v_mps: number;
  within_reserve: boolean;
  reserve_used_pct: number;
}

export interface Terrain {
  slope_deg: number;
  slope_p90_deg: number;
  roughness_m: number;
  unsafe_fraction: number;
  relief_m: number;
  elevation_m: number;
  resolution_m: number;
  source: string;
}

export interface BackupSite {
  id: string;
  rank: number;
  lat: number;
  lon: number;
  distance_m: number;
  bearing_deg: number;
  direction: string;
  tier: "near" | "mid" | "far";
  tier_label: string;
  divert: Divert;
  overall: number;
  verdict: Verdict;
  factors: Factor[];
  terrain: Terrain;
}

export interface Evaluation {
  id?: string;
  name?: string;
  lat: number;
  lon: number;
  landing_time: string;
  profile: Profile;
  overall: number;
  verdict: Verdict;
  verdict_reasons: string[];
  factors: Factor[];
  terrain: Terrain;
  horizon: { azimuth_step_deg: number; elevation_deg: number[] };
  backups?: BackupSite[];
  divert?: {
    radius_m: number;
    lateral_accel_mps2: number;
    hover_reserve_s: number;
    retarget_dv_budget_mps: number;
    tiers: { key: string; max_m: number | null; label: string }[];
  };
}

export interface Timeline {
  times: string[];
  score: number[];
  sun_elevation: number[];
  sun_clearance: number[];
  earth_elevation: number[];
  earth_clearance: number[];
  lit_fraction: number[];
  earth_fraction: number[];
  windows: { start: string; end: string; best: string; best_score: number }[];
  step_hours: number;
}

export interface TerrainPatch {
  lat: number;
  lon: number;
  half_size_m: number;
  resolution_m: number;
  source: string;
  source_resolution_m: number;
  size: number;
  heights: number[];
  slopes: number[];
}

export interface Proposal {
  id: string;
  name: string;
  lat: number;
  lon: number;
  landing_time: string;
  profile: Profile;
  status: "pending" | "accepted" | "rejected";
  overall: number;
  verdict: Verdict;
  notes: string;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  backups?: number;
  evaluation?: Evaluation;
}

export interface SunState {
  time: string;
  sun_lat: number;
  sun_lon: number;
  earth_lat: number;
  earth_lon: number;
}

export interface Health {
  ok: boolean;
  dem_sources: { name: string; resolution_m: number }[];
  craters: boolean;
  ai_model: boolean;
  textures: string[];
}

// ---------------------------------------------------------------- AI (see docs/AI_API.md)

export type HeadKey = "touchdown" | "lit0" | "energy_ok" | "comms_ok";
export type Heads = Record<HeadKey, number>;

export interface AIDriver {
  feature: string;
  label: string;
  value: number | null;
  unit: string;
  impact: number;
}

export interface AIAssessment {
  available: boolean;
  in_domain?: boolean;
  domain_note?: string | null;
  success_probability?: number;
  heads?: Heads;
  rule_score?: number;
  touchdown_uncertainty?: number;
  physics_prior?: number;
  checks?: { key: HeadKey; ok: boolean; label: string; detail: string }[];
  drivers?: AIDriver[];
  model?: { version: string; variant?: string; foundation_model: string | null };
}

export interface AIBackup {
  rank: number;
  lat: number;
  lon: number;
  distance_m: number;
  bearing_deg: number;
  direction: string;
  success_probability: number;
  heads: Heads;
  decide_by_s: number;
  reason: string;
}

export interface AIPlan {
  available: boolean;
  matrix: { site_ids: string[]; times: string[]; success: number[][]; best_success?: number[][]; viable_share?: number[][] };
  primary: { site_id: string; name: string; lat: number; lon: number; landing_time: string; success_probability: number; heads?: Heads; half_size_m?: number; viable_share?: number; zone?: LandingZone | null };
  backups?: AIBackup[];
  zones?: LandingZone[];
  region_stats?: RegionAnalysis["stats"];
  best_times: AIWindow[];
  site_best: { site_id: string; name: string; landing_time: string; success_probability: number; viable_slots?: number; viable_share?: number; open_slots?: number }[];
  alternatives: { site_id: string; name: string; landing_time: string; success_probability: number }[];
  explanation: string[];
  no_viable: boolean;
  model?: { version: string; variant?: string };
}

export interface AISiteMap {
  available: boolean;
  half_size_m: number;
  cells: number;
  success: number[];
  touchdown: number[];
  uncertainty?: number[];
  model?: string;
}

export interface PickQuality {
  mean_success_of_pick: number;
  mean_best_possible: number;
  mean_regret: number;
  near_best_rate: number;
  n_sets: number;
}

export interface TDMetrics {
  touchdown_spearman: number;
  touchdown_mae: number | null;
  touchdown_brier: number | null;
  safe_site_auc: number;
  pick_best_of_10_sites: PickQuality;
}

export interface ModelCard {
  available: boolean;
  success_model?: {
    name: string;
    version: string;
    variant: string;
    trained_at: string;
    task: string;
    labels: string;
    design: string;
    foundation_model?: { name: string; repo: string; license?: string; used: boolean };
    simulator: Record<string, number>;
    data: { samples: number; train: number; val: number; test: number; split: string; region: string; mean_true_touchdown: number };
    results_test: { ai_model: TDMetrics & { uncertainty_error_spearman?: number }; physics_80m_baseline: TDMetrics; rule_based_score: TDMetrics };
    mission_test: { ai_model: PickQuality; physics_80m_baseline: PickQuality; rule_based_score: PickQuality; share_of_site_dates_viable: number };
    variants_test: Record<string, TDMetrics & { val_mae: number; val_spearman: number; label: string; uncertainty_error_spearman: number }>;
    calibration_test: { bin: [number, number]; predicted: number; actual: number; n: number }[];
    training_curves: Record<string, { epoch: number; train_loss: number; val_mae: number; val_spearman: number }[]>;
    limitations: string[];
    training?: {
      optimizer: string;
      schedule: string;
      batch_size: number;
      max_epochs: number;
      early_stopping_patience: number;
      selection: string;
      loss: string;
      augmentation: string;
      precision: string;
      ensemble_members: Record<string, number>;
      parameters: Record<string, number>;
      architecture: Record<string, string>;
    };
  };
}

export interface AIWindow {
  start: string;
  end: string;
  best: string;
  best_success: number;
  hours_open: number;
  is_primary?: boolean;
}

export interface AITimeline {
  available: boolean;
  times: string[];
  success: number[];
  heads: Record<HeadKey, number[]>;
  windows: AIWindow[];
  step_hours: number;
}

export interface LandingZone {
  id: string;
  rank: number;
  lat: number;
  lon: number;
  east_m: number;
  north_m: number;
  area_km2: number;
  margin_m: number;
  mean_success: number;
  target_success: number;
  fits_ellipse: boolean;
  from_primary?: { distance_m: number; direction: string; decide_by_s: number };
}

export interface RegionAnalysis {
  available: boolean;
  lat: number;
  lon: number;
  half_size_m: number;
  cells: number;
  resolution_m: number;
  landing_time: string;
  ellipse_radius_m: number;
  success: number[];
  touchdown: number[];
  uncertainty: number[];
  gate: number[];
  stats: {
    area_km2: number;
    safe_ground_km2: number;
    safe_ground_share: number;
    lit_share: number;
    comms_share: number;
    power_share: number;
    viable_share: number;
    viable_km2: number;
    best_success: number;
    zones: number;
  };
  zones: LandingZone[];
}

export interface RegionTimeline {
  available: boolean;
  times: string[];
  viable_share: number[];
  best_success: number[];
  score: number[];
  windows: AIWindow[];
  step_hours: number;
}

export interface RegionSummary {
  id: string;
  available: boolean;
  viable_share?: number;
  viable_km2?: number;
  best_success?: number;
  shares?: { terrain: number; sunlight: number; power: number; earth_link: number };
  limiting?: "terrain" | "sunlight" | "power" | "earth_link";
}

export interface SkyEvent {
  in_hours: number;
  at: string;
}

/** /api/conditions: Sun & Earth relative to the local skyline over the next days (validated physics). */
export interface Conditions {
  site: { lat: number; lon: number; elevation_m: number };
  start: string;
  days: number;
  comm_mask_deg: number;
  now: {
    sun_elevation_deg: number;
    sun_azimuth_deg: number;
    sun_above_skyline_deg: number;
    sun_visible_fraction: number;
    earth_elevation_deg: number;
    earth_azimuth_deg: number;
    earth_above_skyline_deg: number;
    sun_up: boolean;
    earth_up: boolean;
  };
  next: { sunset: SkyEvent | null; sunrise: SkyEvent | null; earthset: SkyEvent | null; earthrise: SkyEvent | null };
  period: {
    sunlit_hours: number;
    sunlit_share: number;
    longest_darkness_hours: number;
    max_sun_elevation_deg: number;
    earth_hours: number;
    earth_share: number;
    longest_earth_gap_hours: number;
  };
  stay: { hours: number; power_ok: boolean; lowest_battery: number; sunlit_share: number; earth_share: number };
  eclipses: { start: string; end: string; max_covered: number }[];
  series: {
    times: string[];
    sun_elevation: number[];
    sun_above_skyline: number[];
    sun_visible_fraction: number[];
    earth_above_skyline: number[];
    battery: number[];
  };
}
