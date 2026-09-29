"""
Live surface inputs from Open-Meteo (experimental).

Open-Meteo provides current SST, surface currents and 10 m winds. It has no salinity or
sea-level anomaly, so serve.py keeps those two channels from the latest dataset day and
labels them as stale. Every field carries its own lineage entry so the UI never credits
a live source for a value that came from somewhere else.

Caveat: Open-Meteo values are model/analysis products, not the OSTIA/GLORYS/CCMP inputs
the network was trained on, and the network has only seen Feb–Mar 2024. Treat live
reconstructions as indicative until the model is retrained on matching multi-year data.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from typing import Dict, Optional

import httpx

logger = logging.getLogger("OceanEmbed.LiveFeed")

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT_S = 3.5
CACHE_TTL_S = 600.0

# Conversions to SI; unknown units are dropped rather than guessed
_TO_MS = {"m/s": 1.0, "km/h": 1 / 3.6, "kn": 0.514444, "mph": 0.44704}

_cache: Dict[tuple, tuple] = {}


def _speed_ms(value, unit: Optional[str]) -> Optional[float]:
    if value is None or unit not in _TO_MS:
        if value is not None:
            logger.warning("Unrecognised speed unit %r; dropping value", unit)
        return None
    return float(value) * _TO_MS[unit]


def _parse_marine(body: dict) -> Dict[str, float]:
    cur, units = body.get("current", {}), body.get("current_units", {})
    out: Dict[str, float] = {}
    if cur.get("sea_surface_temperature") is not None and units.get("sea_surface_temperature") == "°C":
        out["sst"] = float(cur["sea_surface_temperature"])
    speed = _speed_ms(cur.get("ocean_current_velocity"), units.get("ocean_current_velocity"))
    direction = cur.get("ocean_current_direction")
    if speed is not None and direction is not None:
        # Oceanographic convention: direction the current flows towards
        rad = math.radians(direction)
        out["u_cur"] = speed * math.sin(rad)
        out["v_cur"] = speed * math.cos(rad)
    return out


def _parse_weather(body: dict) -> Dict[str, float]:
    cur, units = body.get("current", {}), body.get("current_units", {})
    out: Dict[str, float] = {}
    speed = _speed_ms(cur.get("wind_speed_10m"), units.get("wind_speed_10m"))
    direction = cur.get("wind_direction_10m")
    if speed is not None and direction is not None:
        # Meteorological convention: direction the wind blows from
        rad = math.radians(direction)
        out["u_wind"] = -speed * math.sin(rad)
        out["v_wind"] = -speed * math.cos(rad)
    return out


async def fetch_live(lat: float, lon: float) -> dict:
    """
    Current Open-Meteo readings at a point.

    Returns {"values": {field: float}, "observed_at": iso str | None}. `values` only
    contains fields Open-Meteo actually returned (e.g. no SST over land cells).
    """
    key = (round(lat, 2), round(lon, 2))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]

    marine_params = {
        "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}",
        "current": "sea_surface_temperature,ocean_current_velocity,ocean_current_direction",
    }
    weather_params = {
        "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}",
        "current": "wind_speed_10m,wind_direction_10m", "wind_speed_unit": "ms",
    }
    values: Dict[str, float] = {}
    observed_at = None
    async with httpx.AsyncClient(timeout=TIMEOUT_S, headers={"User-Agent": "OceanEmbed/2.0"}) as client:
        marine, weather = await asyncio.gather(
            client.get(MARINE_URL, params=marine_params),
            client.get(WEATHER_URL, params=weather_params),
            return_exceptions=True,
        )
    for resp, parse in ((marine, _parse_marine), (weather, _parse_weather)):
        if isinstance(resp, Exception):
            logger.warning("Open-Meteo request failed: %s", resp)
            continue
        if resp.status_code != 200:
            logger.warning("Open-Meteo returned HTTP %s", resp.status_code)
            continue
        body = resp.json()
        values.update(parse(body))
        observed_at = observed_at or body.get("current", {}).get("time")

    result = {"values": {k: round(v, 4) for k, v in values.items()}, "observed_at": observed_at}
    if values:
        _cache[key] = (time.time(), result)
    return result
