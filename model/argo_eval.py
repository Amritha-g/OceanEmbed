"""
Benchmark against real ARGO float profiles (independent in-situ observations).

Each profile from data/processed/argo_profiles.json (scripts/fetch_argo.py) is matched to the
nearest ocean grid cell and the same UTC day. At every depth where both ARGO and the grid have
a value, four predictors are scored:
  - model:       ensemble mean
  - glorys:      the GLORYS12 reanalysis the model is trained on (the target's own error vs ARGO)
  - climatology: per-pixel mean of the training days
  - persistence: the last training day
Results are reported for the held-out test days and for all days. On training days the model has
seen GLORYS for that day, so only the test-day numbers measure generalisation.

Writes model/argo_matchups.json (one entry per profile, for the Truth Check page).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from model.data import TEST_DAYS, TRAIN_DAYS, nearest_ocean
from model.ensemble import Z90
from model.ocean_embed import STD_DEPTHS

ROOT = Path(__file__).resolve().parent.parent
PROFILES = ROOT / "data" / "processed" / "argo_profiles.json"
MATCHUPS = ROOT / "model" / "argo_matchups.json"
PREDICTORS = ["model", "glorys", "climatology", "persistence"]


def _stats(err: np.ndarray) -> dict:
    if err.size == 0:
        return {"n": 0, "rmse": None, "mae": None, "bias": None}
    return {"n": int(err.size), "rmse": round(float(np.sqrt((err ** 2).mean())), 4),
            "mae": round(float(np.abs(err).mean()), 4), "bias": round(float(err.mean()), 4)}


def _summary(rows: list) -> dict:
    """rows: dicts with depth index, argo value and predictor values."""
    out = {"overall": {}, "per_depth": []}
    for p in PREDICTORS:
        out["overall"][p] = _stats(np.array([r[p] - r["argo"] for r in rows]))
    for d, z in enumerate(STD_DEPTHS):
        sub = [r for r in rows if r["d"] == d]
        out["per_depth"].append({"depth_m": z, **{p: _stats(np.array([r[p] - r["argo"] for r in sub]))
                                                  for p in PREDICTORS}})
    return out


@torch.no_grad()
def argo_benchmark(data, t, ens) -> dict | None:
    if not PROFILES.exists():
        print(f"[ARGO] {PROFILES} not found; run scripts/fetch_argo.py")
        return None
    profiles = json.loads(PROFILES.read_text())
    dates = [str(x)[:10] for x in data.times]
    train_y = t.y[list(TRAIN_DAYS)].cpu().numpy()
    clim, persist = train_y.mean(0), train_y[-1]
    test_set = set(TEST_DAYS)

    cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    matchups, rows = [], []
    for p in profiles:
        day = p["time"][:10]
        if day not in dates:
            continue
        ti = dates.index(day)
        cell = nearest_ocean(data, p["lat"], p["lon"])
        if cell is None:
            continue
        i, j = cell
        if ti not in cache:
            b = t.batch([ti])
            mean, sigma, _ = ens.predict(b["x"], b["lat"], b["lon"], b["doy"], b["static"], b["present"])
            cache[ti] = (mean[0].cpu().numpy(), sigma[0].cpu().numpy())
        mean, sigma = cache[ti]
        split = "test" if ti in test_set else ("train" if ti in TRAIN_DAYS else "val")
        m = {
            "platform": p["platform"], "cycle": p["cycle"], "time": p["time"], "data_mode": p["data_mode"],
            "lat": p["lat"], "lon": p["lon"], "date": day, "split": split,
            "grid_point": {"lat": float(data.lat[i]), "lng": float(data.lon[j])},
            "depths_m": STD_DEPTHS, "argo": p["temp"], "argo_psal": p["psal"],
            "model": [], "sigma": [], "glorys": [],
        }
        for d in range(len(STD_DEPTHS)):
            ok = bool(data.y_valid[d, i, j])
            m["model"].append(round(float(mean[d, i, j]), 3) if ok else None)
            m["sigma"].append(round(float(sigma[d, i, j]), 3) if ok else None)
            m["glorys"].append(round(float(data.Y[ti, d, i, j]), 3) if ok else None)
            if ok and p["temp"][d] is not None:
                rows.append({"d": d, "split": split, "argo": p["temp"][d], "model": float(mean[d, i, j]),
                             "sigma": float(sigma[d, i, j]), "glorys": float(data.Y[ti, d, i, j]),
                             "climatology": float(clim[d, i, j]), "persistence": float(persist[d, i, j])})
        matchups.append(m)

    MATCHUPS.write_text(json.dumps(matchups))
    test_rows = [r for r in rows if r["split"] == "test"]
    inside = [abs(r["model"] - r["argo"]) <= Z90 * r["sigma"] for r in rows]
    inside_test = [abs(r["model"] - r["argo"]) <= Z90 * r["sigma"] for r in test_rows]
    summary = {
        "source": "Argo GDAC via Ifremer ERDDAP, QC flags 1-2",
        "n_profiles": len(matchups),
        "n_floats": len({m["platform"] for m in matchups}),
        "n_profiles_test": sum(m["split"] == "test" for m in matchups),
        "test": _summary(test_rows),
        "all_days": _summary(rows),
        "coverage": {
            "nominal": 0.9,
            "all_days": round(float(np.mean(inside)), 4) if inside else None,
            "test": round(float(np.mean(inside_test)), 4) if inside_test else None,
        },
    }
    summary["overall"] = summary["test"]["overall"]
    print(f"[ARGO] {len(matchups)} profiles from {summary['n_floats']} floats "
          f"({summary['n_profiles_test']} on test days) -> {MATCHUPS}")
    return {"summary": summary, "matchups": matchups}
