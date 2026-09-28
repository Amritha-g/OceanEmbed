"""
OceanEmbed Live Hybrid Marine Data Ingest Engine
=================================================
Combines:
1. Live Open-Meteo Marine & Weather API (instant real-time SST, Winds U/V, Currents U/V)
2. In-Memory Copernicus Marine Grid Buffer (data/processed/dataset.nc for Salinity & Sea Level Anomaly)
3. Regional Climatology Fallback (graceful degradation if offline)

Includes detailed structured logging for debugging and auditability.
"""

from __future__ import annotations

import json
import logging
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np

# Configure dedicated logger
logger = logging.getLogger("OceanEmbed.LiveFeed")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [LiveFeed] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "data" / "processed" / "dataset.nc"

# In-memory grid cache for Copernicus NetCDF dataset
_GRID_CACHE: Dict[str, Any] = {
    "loaded": False,
    "lats": None,
    "lons": None,
    "X": None,  # (time, lat, lon, 7)
    "features": None,
}

# In-memory TTL cache for live API calls (10 minute expiry)
_API_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 600.0


def _load_copernicus_grid_cache() -> bool:
    """Preloads dataset.nc into memory if present."""
    if _GRID_CACHE["loaded"]:
        return True
    if not DATASET_PATH.exists():
        logger.warning("dataset.nc not found at %s. Grid buffer unavailable.", DATASET_PATH)
        return False
    try:
        import xarray as xr

        logger.info("Loading Copernicus Marine grid buffer from %s ...", DATASET_PATH)
        ds = xr.open_dataset(DATASET_PATH)
        _GRID_CACHE["lats"] = ds["lat"].values
        _GRID_CACHE["lons"] = ds["lon"].values
        _GRID_CACHE["X"] = ds["X"].values  # shape: (T, lat, lon, 7)
        _GRID_CACHE["features"] = [str(f) for f in ds["feature"].values]
        _GRID_CACHE["loaded"] = True
        logger.info(
            "Copernicus grid buffer loaded successfully: %d lats × %d lons, features: %s",
            len(_GRID_CACHE["lats"]),
            len(_GRID_CACHE["lons"]),
            _GRID_CACHE["features"],
        )
        return True
    except Exception as exc:
        logger.error("Failed to load Copernicus grid buffer: %s", exc, exc_info=True)
        return False


def sample_copernicus_grid(lat: float, lon: float) -> Tuple[Optional[float], Optional[float]]:
    """
    Samples Sea Surface Salinity (sss) and Sea Level Anomaly (sla) from dataset.nc
    using nearest-neighbor spatial interpolation.
    """
    if not _load_copernicus_grid_cache():
        return None, None

    try:
        lats = _GRID_CACHE["lats"]
        lons = _GRID_CACHE["lons"]
        X = _GRID_CACHE["X"]
        feats = _GRID_CACHE["features"]

        # Check domain bounding box
        if lat < lats.min() or lat > lats.max() or lon < lons.min() or lon > lons.max():
            logger.debug("Point (%.4f, %.4f) outside Copernicus grid bounds.", lat, lon)
            return None, None

        lat_idx = int(np.abs(lats - lat).argmin())
        lon_idx = int(np.abs(lons - lon).argmin())

        sss_idx = feats.index("sss") if "sss" in feats else 1
        sla_idx = feats.index("sla") if "sla" in feats else 2

        # Use latest available day
        sss_val = float(X[-1, lat_idx, lon_idx, sss_idx])
        sla_val = float(X[-1, lat_idx, lon_idx, sla_idx])

        if np.isnan(sss_val) or np.isnan(sla_val):
            return None, None

        logger.info(
            "Copernicus Grid sample at (%.2f°N, %.2f°E) -> nearest (%.2f, %.2f): SSS=%.2f PSU, SLA=%.3fm",
            lat, lon, lats[lat_idx], lons[lon_idx], sss_val, sla_val
        )
        return sss_val, sla_val
    except Exception as exc:
        logger.error("Error sampling Copernicus grid: %s", exc)
        return None, None


def _http_get_json(url: str, timeout: float = 3.5) -> Optional[Dict[str, Any]]:
    """Helper to perform fast HTTP GET and parse JSON with timeout."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "OceanEmbed-LiveFeed/1.0 (MoES SIH-26066)"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                data = resp.read().decode("utf-8")
                return json.loads(data)
    except urllib.error.URLError as err:
        logger.warning("HTTP request failed for %s: %s", url, err)
    except Exception as exc:
        logger.warning("HTTP error for %s: %s", url, exc)
    return None


def fetch_open_meteo_live(lat: float, lon: float) -> Dict[str, Any]:
    """
    Fetches real-time Sea Surface Temperature, Ocean Currents, and 10m Winds
    from Open-Meteo Marine & Weather APIs.
    """
    # Round coordinates to 2 decimals for cache key (~1km)
    cache_key = (round(lat, 2), round(lon, 2))
    now = time.time()
    if cache_key in _API_CACHE:
        cached_time, cached_data = _API_CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            logger.info("Serving live surface data from in-memory cache for (%.2f, %.2f)", lat, lon)
            return cached_data

    logger.info("Querying Live Open-Meteo Marine & Weather APIs for (%.4f°N, %.4f°E) ...", lat, lon)
    t0 = time.time()

    # 1. Marine API (SST + Ocean Currents)
    marine_url = (
        f"https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={lat:.4f}&longitude={lon:.4f}&"
        f"current=sea_surface_temperature,ocean_current_velocity,ocean_current_direction"
    )
    marine_res = _http_get_json(marine_url)

    # 2. Weather API (10m Winds)
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat:.4f}&longitude={lon:.4f}&"
        f"current=wind_speed_10m,wind_direction_10m"
    )
    weather_res = _http_get_json(weather_url)

    elapsed_ms = (time.time() - t0) * 1000.0
    logger.info("Open-Meteo API response received in %.1f ms", elapsed_ms)

    result: Dict[str, Any] = {}

    # Extract Marine Data
    if marine_res and "current" in marine_res:
        curr = marine_res["current"]
        sst = curr.get("sea_surface_temperature")
        curr_vel = curr.get("ocean_current_velocity")
        curr_dir = curr.get("ocean_current_direction")

        if sst is not None:
            result["sst"] = float(sst)

        if curr_vel is not None and curr_dir is not None:
            # Ocean current direction is the direction towards which current flows
            rad = math.radians(curr_dir)
            result["u_cur"] = round(curr_vel * math.sin(rad), 3)
            result["v_cur"] = round(curr_vel * math.cos(rad), 3)

    # Extract Weather Data (Winds)
    if weather_res and "current" in weather_res:
        curr = weather_res["current"]
        w_spd = curr.get("wind_speed_10m")  # km/h or m/s depending on config
        w_dir = curr.get("wind_direction_10m")

        if w_spd is not None and w_dir is not None:
            # Convert km/h to m/s if needed (Open-Meteo default is km/h)
            spd_ms = w_spd / 3.6 if w_spd > 0 else 0.0
            # Meteorological wind direction is where the wind blows FROM
            rad = math.radians(w_dir)
            result["u_wind"] = round(-spd_ms * math.sin(rad), 2)
            result["v_wind"] = round(-spd_ms * math.cos(rad), 2)

    if result:
        _API_CACHE[cache_key] = (now, result)
        logger.info(
            "Live surface fetch success for (%.2f°N, %.2f°E): SST=%.2f°C, Winds=(%.1f, %.1f) m/s, Currents=(%.2f, %.2f) m/s",
            lat, lon,
            result.get("sst", float("nan")),
            result.get("u_wind", 0.0), result.get("v_wind", 0.0),
            result.get("u_cur", 0.0), result.get("v_cur", 0.0)
        )

    return result


def get_live_surface_inputs(lat: float, lon: float, region: Optional[str] = None) -> Dict[str, Any]:
    """
    Fuses Live Open-Meteo observations with Copernicus Marine spatial buffer and climatology fallback.
    Returns complete 7-variable dictionary with explicit provenance and data lineage metadata.
    """
    from model.climatology import surface_from_point

    logger.info("Executing Live Hybrid Ingest Pipeline for (%.4f°N, %.4f°E, region=%s)", lat, lon, region)

    # 1. Start with regional climatology baseline
    baseline = surface_from_point(lat, lon, region)
    lineage = {
        "sst": "Regional Ocean Climatology",
        "sss": "Regional Ocean Climatology",
        "sla": "Regional Ocean Climatology",
        "u_cur": "Regional Ocean Climatology",
        "v_cur": "Regional Ocean Climatology",
        "u_wind": "Regional Ocean Climatology",
        "v_wind": "Regional Ocean Climatology",
    }
    is_live = False

    # 2. Query Copernicus Grid Buffer for SSS & SLA
    sss_grid, sla_grid = sample_copernicus_grid(lat, lon)
    if sss_grid is not None:
        baseline["sss"] = round(sss_grid, 2)
        lineage["sss"] = "Copernicus Marine GLORYS12 NRT Grid"
    if sla_grid is not None:
        baseline["sla"] = round(sla_grid, 3)
        lineage["sla"] = "Copernicus Marine DUACS Altimetry Grid"

    # 3. Query Live Open-Meteo for SST, Winds, and Ocean Dynamics
    live_open_meteo = fetch_open_meteo_live(lat, lon)
    if live_open_meteo:
        is_live = True
        if "sst" in live_open_meteo:
            baseline["sst"] = live_open_meteo["sst"]
            lineage["sst"] = "Open-Meteo Marine Live NRT (Satellite-Blended)"
        if "u_wind" in live_open_meteo and "v_wind" in live_open_meteo:
            baseline["u_wind"] = live_open_meteo["u_wind"]
            baseline["v_wind"] = live_open_meteo["v_wind"]
            lineage["u_wind"] = "Open-Meteo 10m Atmospheric Live Feed"
            lineage["v_wind"] = "Open-Meteo 10m Atmospheric Live Feed"
        if "u_cur" in live_open_meteo and "v_cur" in live_open_meteo:
            baseline["u_cur"] = live_open_meteo["u_cur"]
            baseline["v_cur"] = live_open_meteo["v_cur"]
            lineage["u_cur"] = "Open-Meteo Ocean Surface Current Model"
            lineage["v_cur"] = "Open-Meteo Ocean Surface Current Model"

    logger.info("Hybrid Pipeline Complete. Status: %s. Lineage: %s", "LIVE_HYBRID" if is_live else "CLIMATOLOGY", lineage)

    return {
        **baseline,
        "is_live": is_live,
        "lineage": lineage,
        "source_provider": "Open-Meteo Marine + Copernicus NRT Grid" if is_live else "Ocean Climatology Engine",
    }
