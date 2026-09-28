"""JS-compatible surface climatology used when a request has no satellite pixel."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Optional


def js_mod(a: float, n: float) -> float:
    """Match JavaScript remainder (`%`) for floats."""
    return math.fmod(a, n)


def day_of_year(date: Optional[str]) -> int:
    if not date:
        return 75  # 2024-03-15, inside the training window
    try:
        return datetime.fromisoformat(date[:10]).timetuple().tm_yday
    except ValueError:
        return 75


def surface_from_point(lat: float, lon: float, region: Optional[str] = None) -> dict:
    seed = math.sin(lat * 12.9898 + lon * 78.233)
    is_bob = region == "bob" if region in ("bob", "as") else lon > 77.0

    base_sst = 28.2 if is_bob else 27.8
    sst = base_sst + abs(js_mod(seed * 1000.0, 2.9))

    base_sss = 33.1 if is_bob else 35.8
    sss = base_sss + abs(js_mod(seed * 700.0, 1.2))

    sla = 0.08 + abs(js_mod(seed * 500.0, 0.16))
    current = 0.22 + abs(js_mod(seed * 300.0, 0.45))
    wind = 4.2 + abs(js_mod(seed * 900.0, 4.8))

    angle = seed * 6.283185307179586
    u_cur = current * math.cos(angle)
    v_cur = current * math.sin(angle)
    u_wind = wind * math.cos(angle * 0.7)
    v_wind = wind * math.sin(angle * 0.7)

    return {
        "sst": round(sst, 4),
        "sss": round(sss, 4),
        "sla": round(sla, 4),
        "u_cur": round(u_cur, 4),
        "v_cur": round(v_cur, 4),
        "u_wind": round(u_wind, 4),
        "v_wind": round(v_wind, 4),
        "lat": lat,
        "lon": lon,
    }
