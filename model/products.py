"""
Derived ocean products from reconstructed temperature profiles.

All functions take temperature on the 15 standard depths along axis 0, shape (D, ...), with NaN
below the seafloor, and return arrays of shape (...). Values are NaN where undefined.

  mld    Mixed-layer depth (m), ΔT = 0.5 °C below the surface value
  d26    Depth of the 26 °C isotherm (m)
  tchp   Tropical cyclone heat potential (kJ/cm²): ρ·cp·∫(T − 26) dz from the surface to D26
  sound_speed / sld
         Mackenzie (1981) sound speed and sonic layer depth (depth of the near-surface
         sound-speed maximum). Salinity below the surface is not reconstructed, so it is assumed:
         SSS in the mixed layer, relaxing to 35.0 PSU below it (e-folding 100 m). Sound speed is
         ~1.3 m/s per PSU, so treat it as indicative.
"""

from __future__ import annotations

import numpy as np

STD_DEPTHS = np.array([0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000], dtype=np.float64)
RHO, CP = 1025.0, 3993.0        # seawater density (kg/m³) and heat capacity (J/kg/K)
J_PER_M2_TO_KJ_PER_CM2 = 1e-7
TCHP_WATCH, TCHP_HIGH = 50.0, 90.0   # kJ/cm²: common thresholds for intensification risk
DEEP_SALINITY, SAL_EFOLD = 35.0, 100.0


def _first_crossing(temps: np.ndarray, threshold: np.ndarray) -> np.ndarray:
    """Depth where temps first falls below `threshold` (linear between levels); NaN if never."""
    T = np.asarray(temps, dtype=np.float64)
    out = np.full(T.shape[1:], np.nan)
    done = np.zeros(T.shape[1:], dtype=bool)
    for k in range(1, T.shape[0]):
        a, b = T[k - 1], T[k]
        hit = ~done & (b < threshold) & (a >= threshold) & np.isfinite(a) & np.isfinite(b)
        f = np.where(hit, (a - threshold) / np.where(a != b, a - b, 1.0), 0.0)
        out = np.where(hit, STD_DEPTHS[k - 1] + f * (STD_DEPTHS[k] - STD_DEPTHS[k - 1]), out)
        done |= hit
    return out


def mld(temps: np.ndarray) -> np.ndarray:
    T = np.asarray(temps, dtype=np.float64)
    return _first_crossing(T, T[0] - 0.5)


def d26(temps: np.ndarray) -> np.ndarray:
    T = np.asarray(temps, dtype=np.float64)
    out = _first_crossing(T, np.full(T.shape[1:], 26.0))
    return np.where(T[0] >= 26.0, out, np.nan)


def tchp(temps: np.ndarray) -> np.ndarray:
    """Exact integral of the piecewise-linear profile's excess over 26 °C, down to D26."""
    T = np.asarray(temps, dtype=np.float64)
    total = np.zeros(T.shape[1:])
    for k in range(1, T.shape[0]):
        a, b = T[k - 1] - 26.0, T[k] - 26.0
        dz = STD_DEPTHS[k] - STD_DEPTHS[k - 1]
        ok = np.isfinite(a) & np.isfinite(b)
        both = ok & (a > 0) & (b > 0)
        cross = ok & (a > 0) & (b <= 0)
        seg = np.where(both, 0.5 * (a + b) * dz, 0.0)
        # Only the part above the 26 °C crossing counts
        seg = np.where(cross, 0.5 * a * dz * a / np.where(a - b != 0, a - b, 1.0), seg)
        total += seg
    return np.where(T[0] >= 26.0, RHO * CP * total * J_PER_M2_TO_KJ_PER_CM2, 0.0)


def salinity_profile(sss: np.ndarray, mixed_layer: np.ndarray) -> np.ndarray:
    """Assumed salinity (D, ...): SSS in the mixed layer, relaxing to 35 PSU below."""
    sss = np.asarray(sss, dtype=np.float64)
    h = np.nan_to_num(np.asarray(mixed_layer, dtype=np.float64), nan=0.0)
    z = STD_DEPTHS.reshape((-1,) + (1,) * sss.ndim)
    below = np.clip(z - h, 0.0, None)
    return DEEP_SALINITY + (sss - DEEP_SALINITY) * np.exp(-below / SAL_EFOLD)


def sound_speed(temps: np.ndarray, salinity: np.ndarray) -> np.ndarray:
    """Mackenzie (1981), m/s. Valid 2–30 °C, 25–40 PSU, 0–8000 m."""
    T = np.asarray(temps, dtype=np.float64)
    S = np.asarray(salinity, dtype=np.float64)
    D = STD_DEPTHS.reshape((-1,) + (1,) * (T.ndim - 1))
    return (1448.96 + 4.591 * T - 5.304e-2 * T ** 2 + 2.374e-4 * T ** 3 + 1.340 * (S - 35.0)
            + 1.630e-2 * D + 1.675e-7 * D ** 2 - 1.025e-2 * T * (S - 35.0) - 7.139e-13 * T * D ** 3)


def sld(speed: np.ndarray, max_depth: float = 300.0) -> np.ndarray:
    """Sonic layer depth: depth of the sound-speed maximum within the top `max_depth` m (0 if at surface)."""
    c = np.asarray(speed, dtype=np.float64)
    top = STD_DEPTHS <= max_depth
    sub = np.where(np.isfinite(c[top]), c[top], -np.inf)
    return STD_DEPTHS[top][np.argmax(sub, axis=0)]


def profile_products(depths, temps, sss) -> dict:
    """All products for a single profile (lists in, JSON-ready dict out)."""
    T = np.array([np.nan if v is None else v for v in temps], dtype=np.float64)
    h = mld(T)
    S = salinity_profile(np.float64(sss), h)
    c = sound_speed(T, S)
    layer = float(sld(c))
    k = int(np.searchsorted(STD_DEPTHS, layer))
    below = [i for i in range(k + 1, min(k + 4, len(STD_DEPTHS))) if np.isfinite(c[i])]
    blg = (c[below[-1]] - c[k]) / (STD_DEPTHS[below[-1]] - layer) * 100 if below else None

    def num(v, nd=1):
        return None if v is None or not np.isfinite(v) else round(float(v), nd)

    return {
        "mld_m": num(h), "d26_m": num(d26(T)), "tchp_kj_cm2": num(tchp(T)),
        "sld_m": num(layer, 0),
        "below_layer_gradient_ms_per_100m": num(blg, 2),
        "sound_speed_ms": [num(v, 2) for v in c],
        "salinity_assumed_psu": [num(v, 2) for v in S],
    }
