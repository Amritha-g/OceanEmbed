"""
OceanEmbed Production Ingest & Spatial Cache Engine
===================================================
Stack Components:
1. Non-Blocking Async Ingestion via `httpx.AsyncClient` (parallel Open-Meteo queries)
2. Microsecond 2D Spatial Indexing via `scipy.spatial.cKDTree`
3. High-Speed Caching via `redis.asyncio` (with auto-fallback to in-memory TTL cache)
4. Cloud-Native Zarr / NetCDF Grid Buffer (`data/processed/dataset.zarr`)
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

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
ZARR_PATH = ROOT / "data" / "processed" / "dataset.zarr"
NC_PATH = ROOT / "data" / "processed" / "dataset.nc"

# Spatial Index & Grid Cache
_SPATIAL_INDEX: Dict[str, Any] = {
    "loaded": False,
    "tree": None,          # cKDTree object
    "coords": None,        # Array of (lat, lon) pairs shape (N, 2)
    "grid_shape": None,    # (len(lats), len(lons))
    "lats": None,
    "lons": None,
    "X": None,             # (T, lat, lon, 7)
    "features": None,
    "backend_type": "None",
}

# Redis & In-Memory Fallback Cache
_REDIS_CLIENT = None
_REDIS_AVAILABLE: Optional[bool] = None
_LOCAL_MEM_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 600.0


async def _get_redis_client():
    """Initializes and returns an async Redis connection if reachable."""
    global _REDIS_CLIENT, _REDIS_AVAILABLE
    if _REDIS_AVAILABLE is False:
        return None
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT

    try:
        import redis.asyncio as aioredis
        client = aioredis.Redis(host="localhost", port=6379, db=0, socket_timeout=0.5)
        # Test connection with ping
        await asyncio.wait_for(client.ping(), timeout=0.5)
        _REDIS_CLIENT = client
        _REDIS_AVAILABLE = True
        logger.info("Connected to Redis cache on localhost:6379")
        return _REDIS_CLIENT
    except Exception as exc:
        _REDIS_AVAILABLE = False
        _REDIS_CLIENT = None
        logger.info("Redis server not detected on localhost:6379 (using high-speed in-memory cache)")
        return None


def _load_spatial_index() -> bool:
    """Preloads the spatial dataset (Zarr or NetCDF) and builds a 2D cKDTree spatial index."""
    if _SPATIAL_INDEX["loaded"]:
        return True

    try:
        import xarray as xr

        if ZARR_PATH.exists():
            logger.info("Loading cloud-native Zarr store from %s ...", ZARR_PATH)
            ds = xr.open_zarr(ZARR_PATH)
            _SPATIAL_INDEX["backend_type"] = "Zarr"
        elif NC_PATH.exists():
            logger.info("Loading NetCDF store from %s ...", NC_PATH)
            ds = xr.open_dataset(NC_PATH)
            _SPATIAL_INDEX["backend_type"] = "NetCDF"
        else:
            logger.warning("No dataset found at %s or %s", ZARR_PATH, NC_PATH)
            return False

        lats = ds["lat"].values
        lons = ds["lon"].values
        X = ds["X"].values  # shape: (T, lat, lon, 7)
        features = [str(f) for f in ds["feature"].values]

        # Build 2D coordinate meshgrid and construct cKDTree
        lat_grid, lon_grid = np.meshgrid(lats, lons, indexing="ij")
        coords = np.column_stack([lat_grid.ravel(), lon_grid.ravel()])
        tree = cKDTree(coords)

        _SPATIAL_INDEX["tree"] = tree
        _SPATIAL_INDEX["coords"] = coords
        _SPATIAL_INDEX["grid_shape"] = (len(lats), len(lons))
        _SPATIAL_INDEX["lats"] = lats
        _SPATIAL_INDEX["lons"] = lons
        _SPATIAL_INDEX["X"] = X
        _SPATIAL_INDEX["features"] = features
        _SPATIAL_INDEX["loaded"] = True

        logger.info(
            "Spatial Index Built: cKDTree with %d nodes (%s backend, %d lats × %d lons)",
            len(coords),
            _SPATIAL_INDEX["backend_type"],
            len(lats),
            len(lons),
        )
        return True
    except Exception as exc:
        logger.error("Failed to build spatial index: %s", exc, exc_info=True)
        return False


def query_spatial_grid(lat: float, lon: float) -> Tuple[Optional[float], Optional[float]]:
    """
    Performs sub-microsecond O(log N) nearest-neighbor spatial query
    using the precomputed cKDTree over the ocean dataset.
    """
    if not _load_spatial_index():
        return None, None

    try:
        tree = _SPATIAL_INDEX["tree"]
        lats = _SPATIAL_INDEX["lats"]
        lons = _SPATIAL_INDEX["lons"]
        X = _SPATIAL_INDEX["X"]
        feats = _SPATIAL_INDEX["features"]

        # Check bounds
        if lat < lats.min() or lat > lats.max() or lon < lons.min() or lon > lons.max():
            return None, None

        t0 = time.perf_counter()
        # cKDTree query returns (distance, flat_index) in <0.001 ms
        dist, flat_idx = tree.query([lat, lon], k=1)
        lookup_us = (time.perf_counter() - t0) * 1_000_000

        # Unravel flat index into 2D (lat_idx, lon_idx)
        lat_idx = flat_idx // len(lons)
        lon_idx = flat_idx % len(lons)

        sss_idx = feats.index("sss") if "sss" in feats else 1
        sla_idx = feats.index("sla") if "sla" in feats else 2

        sss_val = float(X[-1, lat_idx, lon_idx, sss_idx])
        sla_val = float(X[-1, lat_idx, lon_idx, sla_idx])

        if np.isnan(sss_val) or np.isnan(sla_val):
            return None, None

        logger.info(
            "cKDTree Spatial Query (%.2f µs): (%.4f°N, %.4f°E) -> nearest (%.2f, %.2f) [dist=%.3f°] -> SSS=%.2f, SLA=%.3fm",
            lookup_us, lat, lon, lats[lat_idx], lons[lon_idx], dist, sss_val, sla_val
        )
        return sss_val, sla_val
    except Exception as exc:
        logger.error("Error in cKDTree spatial query: %s", exc)
        return None, None


async def fetch_open_meteo_async(lat: float, lon: float) -> Dict[str, Any]:
    """
    Asynchronously fetches live Sea Surface Temperature, Currents, and Winds
    from Open-Meteo Marine & Weather APIs in parallel using httpx.
    """
    cache_key_str = f"ocean:live:{round(lat, 2)}:{round(lon, 2)}"
    mem_key = (round(lat, 2), round(lon, 2))
    now = time.time()

    # 1. Check Redis Cache
    redis = await _get_redis_client()
    if redis is not None:
        try:
            cached = await redis.get(cache_key_str)
            if cached:
                logger.info("Serving live surface data from Redis Cache [%s]", cache_key_str)
                return json.loads(cached)
        except Exception:
            pass

    # 2. Check In-Memory Fallback Cache
    if mem_key in _LOCAL_MEM_CACHE:
        cached_time, cached_data = _LOCAL_MEM_CACHE[mem_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            logger.info("Serving live surface data from Local Memory Cache for (%.2f, %.2f)", lat, lon)
            return cached_data

    logger.info("Querying Live Open-Meteo APIs async for (%.4f°N, %.4f°E) ...", lat, lon)
    t0 = time.time()

    marine_url = (
        f"https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={lat:.4f}&longitude={lon:.4f}&"
        f"current=sea_surface_temperature,ocean_current_velocity,ocean_current_direction"
    )
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat:.4f}&longitude={lon:.4f}&"
        f"current=wind_speed_10m,wind_direction_10m"
    )

    result: Dict[str, Any] = {}
    try:
        import httpx

        async with httpx.AsyncClient(timeout=3.5, headers={"User-Agent": "OceanEmbed-Async/2.0"}) as client:
            # Parallel async fetch
            marine_task = client.get(marine_url)
            weather_task = client.get(weather_url)
            marine_resp, weather_resp = await asyncio.gather(marine_task, weather_task, return_exceptions=True)

            # Process Marine
            if not isinstance(marine_resp, Exception) and marine_resp.status_code == 200:
                marine_json = marine_resp.json()
                curr = marine_json.get("current", {})
                sst = curr.get("sea_surface_temperature")
                c_vel = curr.get("ocean_current_velocity")
                c_dir = curr.get("ocean_current_direction")

                if sst is not None:
                    result["sst"] = float(sst)
                if c_vel is not None and c_dir is not None:
                    rad = math.radians(c_dir)
                    result["u_cur"] = round(c_vel * math.sin(rad), 3)
                    result["v_cur"] = round(c_vel * math.cos(rad), 3)

            # Process Weather
            if not isinstance(weather_resp, Exception) and weather_resp.status_code == 200:
                weather_json = weather_resp.json()
                curr = weather_json.get("current", {})
                w_spd = curr.get("wind_speed_10m")
                w_dir = curr.get("wind_direction_10m")

                if w_spd is not None and w_dir is not None:
                    spd_ms = w_spd / 3.6 if w_spd > 0 else 0.0
                    rad = math.radians(w_dir)
                    result["u_wind"] = round(-spd_ms * math.sin(rad), 2)
                    result["v_wind"] = round(-spd_ms * math.cos(rad), 2)

    except Exception as exc:
        logger.warning("Async HTTP fetch error: %s", exc)

    elapsed_ms = (time.time() - t0) * 1000.0
    logger.info("Parallel Async API fetch completed in %.1f ms", elapsed_ms)

    if result:
        _LOCAL_MEM_CACHE[mem_key] = (now, result)
        if redis is not None:
            try:
                await redis.setex(cache_key_str, int(CACHE_TTL_SECONDS), json.dumps(result))
            except Exception:
                pass

        logger.info(
            "Live surface fetch success for (%.2f°N, %.2f°E): SST=%.2f°C, Winds=(%.1f, %.1f) m/s",
            lat, lon, result.get("sst", float("nan")), result.get("u_wind", 0.0), result.get("v_wind", 0.0)
        )

    return result


async def get_live_surface_inputs(lat: float, lon: float, region: Optional[str] = None) -> Dict[str, Any]:
    """
    Main asynchronous ingestion entrypoint.
    Merges live async Open-Meteo observations with cKDTree spatial grid buffer.
    """
    from model.climatology import surface_from_point

    logger.info("Async Hybrid Ingest Pipeline triggered for (%.4f°N, %.4f°E, region=%s)", lat, lon, region)

    # 1. Baseline Climatology
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

    # 2. cKDTree Spatial Grid Lookup for SSS & SLA
    sss_val, sla_val = query_spatial_grid(lat, lon)
    backend_name = _SPATIAL_INDEX.get("backend_type", "Grid")
    if sss_val is not None:
        baseline["sss"] = round(sss_val, 2)
        lineage["sss"] = f"Copernicus Marine GLORYS12 NRT ({backend_name})"
    if sla_val is not None:
        baseline["sla"] = round(sla_val, 3)
        lineage["sla"] = f"Copernicus Marine DUACS Altimetry ({backend_name})"

    # 3. Live Async Open-Meteo Fetch
    live_data = await fetch_open_meteo_async(lat, lon)
    if live_data:
        is_live = True
        if "sst" in live_data:
            baseline["sst"] = live_data["sst"]
            lineage["sst"] = "Open-Meteo Marine Live NRT (Satellite-Blended)"
        if "u_wind" in live_data and "v_wind" in live_data:
            baseline["u_wind"] = live_data["u_wind"]
            baseline["v_wind"] = live_data["v_wind"]
            lineage["u_wind"] = "Open-Meteo 10m Atmospheric Live Feed"
            lineage["v_wind"] = "Open-Meteo 10m Atmospheric Live Feed"
        if "u_cur" in live_data and "v_cur" in live_data:
            baseline["u_cur"] = live_data["u_cur"]
            baseline["v_cur"] = live_data["v_cur"]
            lineage["u_cur"] = "Open-Meteo Ocean Surface Current Model"
            lineage["v_cur"] = "Open-Meteo Ocean Surface Current Model"

    return {
        **baseline,
        "is_live": is_live,
        "lineage": lineage,
        "source_provider": "Open-Meteo Async + Copernicus Spatial Tree" if is_live else "Ocean Climatology Engine",
    }
