"""
Download ARGO float profiles for the dataset domain and period from the Ifremer ERDDAP server,
keep good-QC measurements, and interpolate each profile to the 15 standard depths.

Output: data/processed/argo_profiles.json
  [{platform, cycle, time, lat, lon, data_mode, temp: [15 x °C|null], psal: [15 x PSU|null]}, ...]

No credentials needed. Usage:
    python scripts/fetch_argo.py
    python scripts/fetch_argo.py --start 2024-02-01 --end 2024-03-31
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "processed" / "argo_profiles.json"
ERDDAP = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv"
STD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
BOUNDS = dict(lat=(8.0, 22.0), lon=(80.0, 100.0))
GOOD_QC = {1, 2}          # Argo QC: 1 good, 2 probably good
GOOD_POS_QC = {1, 2, 5, 8}  # position/time may also be changed (5) or estimated (8)
MAX_GAP_M = {0: 6.0}      # surface value allowed from the shallowest sample within 6 m
DEFAULT_GAP_M = 60.0      # otherwise only interpolate between samples less than this far apart


def pressure_to_depth(p_dbar: np.ndarray, lat: float) -> np.ndarray:
    """UNESCO 1983 (Saunders & Fofonoff) depth from pressure."""
    x = np.sin(np.radians(lat)) ** 2
    g = 9.780318 * (1.0 + (5.2788e-3 + 2.36e-5 * x) * x) + 1.092e-6 * p_dbar
    return ((((-1.82e-15 * p_dbar + 2.279e-10) * p_dbar - 2.2512e-5) * p_dbar + 9.72659) * p_dbar) / g


def to_std_depths(z: np.ndarray, v: np.ndarray) -> list:
    """Linear interpolation onto STD_DEPTHS; None where the profile does not cover a level."""
    out = []
    for target in STD_DEPTHS:
        if target <= z[0]:
            out.append(round(float(v[0]), 3) if z[0] - target <= MAX_GAP_M.get(target, 0.0) + 1e-9 else None)
            continue
        k = np.searchsorted(z, target)
        if k >= len(z):
            out.append(None)
            continue
        z0, z1 = z[k - 1], z[k]
        if z1 - z0 > DEFAULT_GAP_M:
            out.append(None)
            continue
        f = (target - z0) / (z1 - z0) if z1 > z0 else 0.0
        out.append(round(float(v[k - 1] + f * (v[k] - v[k - 1])), 3))
    return out


def fetch(start: str, end: str) -> pd.DataFrame:
    query = (
        "platform_number,cycle_number,time,latitude,longitude,pres,temp,psal,"
        "pres_qc,temp_qc,psal_qc,position_qc,time_qc,data_mode"
        f"&latitude>={BOUNDS['lat'][0]}&latitude<={BOUNDS['lat'][1]}"
        f"&longitude>={BOUNDS['lon'][0]}&longitude<={BOUNDS['lon'][1]}"
        f"&time>={start}T00:00:00Z&time<={end}T23:59:59Z&pres<=1100"
    )
    r = requests.get(f"{ERDDAP}?{query}", timeout=300)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text), skiprows=[1])
    # QC columns arrive as text with blanks for missing values
    for c in ["pres_qc", "temp_qc", "psal_qc", "position_qc", "time_qc"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2024-02-01")
    ap.add_argument("--end", default="2024-03-31")
    args = ap.parse_args()

    df = fetch(args.start, args.end)
    print(f"Fetched {len(df)} measurements, {df.groupby(['platform_number', 'cycle_number']).ngroups} profiles")

    profiles = []
    for (platform, cycle), g in df.groupby(["platform_number", "cycle_number"]):
        first = g.iloc[0]
        if first.position_qc not in GOOD_POS_QC or first.time_qc not in GOOD_POS_QC:
            continue
        ok_t = g.pres_qc.isin(GOOD_QC) & g.temp_qc.isin(GOOD_QC) & g.temp.notna()
        t = g[ok_t].sort_values("pres")
        if len(t) < 5:
            continue
        z = pressure_to_depth(t.pres.to_numpy(float), first.latitude)
        z, idx = np.unique(z, return_index=True)
        temp = to_std_depths(z, t.temp.to_numpy(float)[idx])

        ok_s = g.pres_qc.isin(GOOD_QC) & g.psal_qc.isin(GOOD_QC) & g.psal.notna()
        s = g[ok_s].sort_values("pres")
        psal = [None] * len(STD_DEPTHS)
        if len(s) >= 5:
            zs, ids = np.unique(pressure_to_depth(s.pres.to_numpy(float), first.latitude), return_index=True)
            psal = to_std_depths(zs, s.psal.to_numpy(float)[ids])

        if sum(v is not None for v in temp) < 3:
            continue
        profiles.append({
            "platform": str(int(platform)),
            "cycle": int(cycle),
            "time": str(first.time),
            "lat": round(float(first.latitude), 4),
            "lon": round(float(first.longitude), 4),
            "data_mode": str(first.data_mode),
            "temp": temp,
            "psal": psal,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(profiles, indent=1))
    floats = len({p["platform"] for p in profiles})
    print(f"Kept {len(profiles)} good-QC profiles from {floats} floats -> {OUT}")


if __name__ == "__main__":
    main()
