# AI API contract (backend ↔ dashboard)

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). All times ISO-8601 UTC.
Probabilities are 0..1. The backend implements these in `the-moonions-backend`.

The AI = **mission-success model**: predicts P(landing mission succeeds) for a site + touchdown
time from NASA-derived planning data, trained on a Monte-Carlo landing simulator run on LOLA
20 m terrain. Optional terrain embeddings come from the **NASA-IBM Lunar Foundation Model**.
It has four "heads" whose product is the success probability:

| head key | UI label | meaning |
|---|---|---|
| `touchdown` | Safe touchdown | lander ends on safe ground (with onboard hazard avoidance) |
| `lit0` | Light at landing | Sun above the terrain skyline at touchdown |
| `energy_ok` | Power through the stay | battery never runs empty during the stay |
| `comms_ok` | Earth link | Earth visible ≥ 50 % of the stay |

Every value shown in the UI must carry a **provenance badge**: `NASA data`, `Computed`,
`Simulated`, `AI` (and later `Tabletop`). Fields below say which.

---

## `GET /api/ai/model-card`

```json
{
  "available": true,
  "success_model": {
    "name": "Moonions mission-success model", "version": "success_net_v1",
    "trained_at": "2026-11-14T19:00:00+00:00",
    "task": "…", "labels": "…",
    "foundation_model": {"name": "NASA-IBM Lunar Foundation Model", "repo": "nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model", "used": true},
    "data": {"samples": 32000, "train": 22000, "val": 3500, "test": 6500, "split": "geographic: …", "region": "south polar cap, latitudes -80.6..-90", "mean_true_success": 0.41},
    "results_test": {
      "ai_model":             {"success_spearman": 0.91, "success_auc": 0.95, "touchdown_spearman": 0.88, "touchdown_mae": 0.06,
                               "pick_best_of_10": {"mean_success_of_pick": 0.84, "mean_best_possible": 0.88, "mean_regret": 0.04, "near_best_rate": 0.81}},
      "rule_based_score":     {"success_spearman": 0.70, "success_auc": 0.83, "touchdown_spearman": 0.61, "touchdown_mae": null,
                               "pick_best_of_10": {"mean_success_of_pick": 0.71, "mean_best_possible": 0.88, "mean_regret": 0.17, "near_best_rate": 0.52}},
      "physics_80m_baseline": {"success_spearman": 0.85, "success_auc": 0.92, "touchdown_spearman": 0.80, "touchdown_mae": 0.11,
                               "pick_best_of_10": {"mean_success_of_pick": 0.80, "mean_best_possible": 0.88, "mean_regret": 0.08, "near_best_rate": 0.70}}
    },
    "head_auc_test": {"lit0": 0.99, "energy_ok": 0.97, "comms_ok": 0.98},
    "calibration_test": [{"bin": [0.0, 0.1], "predicted": 0.04, "actual": 0.05, "n": 1200}],
    "limitations": ["…", "…"]
  },
  "hazard_model": {"version": "hazard_cnn_v1", "val_balanced_acc": 0.85, "baseline_threshold_rule": 0.70}
}
```
`available:false` (and no `success_model`) when the model hasn't been trained yet.

## `POST /api/ai/assess`

Request: `{"lat": -85.95, "lon": 2.5, "landing_time": "2026-12-23T16:00:00Z"}`

```json
{
  "available": true,
  "in_domain": true,
  "domain_note": null,
  "success_probability": 0.87,
  "heads": {"touchdown": 0.93, "lit0": 0.99, "energy_ok": 0.98, "comms_ok": 0.97},
  "rule_score": 72.3,
  "drivers": [
    {"feature": "slope_p90_deg", "label": "Steepest ground in zone", "value": 6.2, "unit": "°", "impact": 0.08},
    {"feature": "lit_frac", "label": "Sunlit share of stay", "value": 0.92, "unit": "", "impact": 0.05},
    {"feature": "terrain_patch", "label": "Terrain texture (AI vision)", "value": null, "unit": "", "impact": -0.03}
  ],
  "model": {"version": "success_net_v1", "foundation_model": "NASA-IBM LFM"}
}
```
* `drivers`: sorted by |impact|; `impact` = signed change in success probability attributable to
  that input (positive = helps). Show the top 5 as + / − bars. Provenance: `AI`.
* `in_domain:false` + `domain_note` outside the south polar training region → show a warning.
* `available:false` → hide AI widgets, show "AI model not trained yet".

## `POST /api/ai/recommend`

Request:
```json
{"sites": [{"id": "malapert", "name": "Malapert Massif", "lat": -85.95, "lon": 2.5}, …],
 "start": "2026-12-01T00:00:00Z", "days": 30, "step_hours": 12,
 "divert_radius_m": 3000, "n_backups": 4}
```
Response:
```json
{
  "matrix": {"site_ids": ["malapert", "…"], "times": ["2026-12-01T00:00:00Z", "…"],
             "success": [[0.12, 0.85, …], …]},
  "primary": {"site_id": "malapert", "name": "Malapert Massif", "lat": -85.95, "lon": 2.5,
              "landing_time": "2026-12-09T12:00:00Z", "success_probability": 0.91,
              "heads": {"touchdown": 0.95, "lit0": 1.0, "energy_ok": 0.97, "comms_ok": 0.99}},
  "backups": [
    {"rank": 1, "lat": -85.96, "lon": 2.4, "distance_m": 1100, "bearing_deg": 190, "direction": "S",
     "success_probability": 0.89, "heads": {…}, "decide_by_s": 73, "reason": "Flatter ground, same sunlight"}
  ],
  "best_times": [{"start": "…", "end": "…", "best": "2026-12-09T12:00:00+00:00", "best_success": 0.91, "hours_open": 96, "is_primary": true},
                 {"start": "…", "end": "…", "best": "2027-01-08T00:00:00+00:00", "best_success": 0.86, "hours_open": 72, "is_primary": false}],
  "site_best": [{"site_id": "malapert", "name": "Malapert Massif", "landing_time": "…", "success_probability": 0.91, "viable_slots": 23}],
  "alternatives": [{"site_id": "…", "name": "…", "landing_time": "…", "success_probability": 0.88}],
  "explanation": ["Malapert on 9 Dec 12:00 UTC has the highest predicted success (91%).", "…"],
  "no_viable": false
}
```
`matrix.success[i][j]` = site i at time j. `best_times` = the primary site's landing windows
(contiguous runs ≥ 50 %); the non-primary ones are **backup times** if the launch slips. `no_viable:true` when nothing exceeds 0.5 → show it
prominently ("No viable landing confirmed in this period").

## `GET /api/ai/timeline?lat=&lon=&start=&days=30&step_hours=6`

AI success over a range of touchdown times for one site → best landing times.
```json
{"available": true, "times": ["…"], "success": [0.1, …], "heads": {"touchdown": […], "lit0": […], "energy_ok": […], "comms_ok": […]},
 "windows": [{"start": "…", "end": "…", "best": "…", "best_success": 0.9, "hours_open": 84}], "step_hours": 6}
```

## `GET /api/ai/site-map?lat=&lon=&landing_time=&half_size_m=3000&cells=41`

Dense AI landing map around a site for the 3D site view.
```json
{"half_size_m": 3000, "cells": 41, "success": [0.8, …], "touchdown": [0.9, …]}
```
Row-major, **row 0 = northern edge**, column 0 = western edge (same layout as `/api/terrain`).

## `GET /api/ai/polar-map.png?time=`

RGBA PNG in the **same polar-stereographic layout as `cap_s_*` textures** (see
`/static/textures/textures.json` → `caps.cap_s.half_size_m`), colour = predicted success
(transparent where no data; covers latitudes ≤ −84.5°, 1.5 km grid, sequential blue ramp
dark = 0 % → light = 100 %). Hourly granularity, cached.
