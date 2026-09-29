"""
OceanEmbed Inference API
==========================
FastAPI server exposing the trained OceanEmbedNet model.

  GET  /health
  GET  /depths
  GET  /api/v1/health
  GET  /api/v1/depths
  GET  /api/v1/dataset
  GET  /api/v1/metrics
  GET  /api/v1/profile         ?lat=&lon=&date=&source=archive|live
  GET  /api/v1/products        ?date=&var=tchp|d26|mld|sld|sigma100   (daily grid map)
  GET  /api/v1/argo            real ARGO float matchups (model vs float vs GLORYS)
  GET  /api/v1/bulletin        ?date=   printable daily bulletin (HTML)
  GET  /api/v1/bulletin/point  ?lat=&lon=&date=&format=pdf|png   one-page bulletin for a location
  POST /api/v1/transect        { points: [{lat, lng}, ...], n?, date?, format? }   depth-vs-distance section
  POST /api/v1/reconstruct     { lat, lng, date?, surface?, region? }
  POST /predict
  POST /predict/point

Points inside the dataset domain are snapped to the nearest ocean pixel and reconstructed
from that day's real satellite inputs with the full grid as spatial context; the GLORYS12
profile at the same pixel is returned as ground truth. Points outside the domain fall back
to a uniform patch built from the supplied (or climatological) surface values.

source=live (experimental) replaces SST, currents and winds with current Open-Meteo readings
(model/live_feed.py). Salinity and sea level have no live source and stay at the latest dataset
day. Every response carries per-field lineage so clients can label each value's origin.

Usage:
    python model/serve.py
    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.climatology import day_of_year, surface_from_point  # noqa: E402
from model.data import OceanData, load, nearest_ocean  # noqa: E402
from model.ensemble import Ensemble  # noqa: E402
from model import bulletin, products, transect  # noqa: E402
from model.live_feed import fetch_live  # noqa: E402
from model.ocean_embed import STD_DEPTHS  # noqa: E402

LOG_PATH = ROOT / "model" / "train_log.json"
METRICS_PATH = ROOT / "model" / "metrics.json"
MATCHUPS_PATH = ROOT / "model" / "argo_matchups.json"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FEATURES = ["sst", "sss", "sla", "u_cur", "v_cur", "u_wind", "v_wind"]
PATCH = 16  # side of the uniform patch used for out-of-domain points
ARCHIVE_SOURCES = {
    "sst": "OSTIA L4 (Copernicus)",
    "sss": "GLORYS12 (Copernicus)",
    "sla": "DUACS L4 (Copernicus)",
    "u_cur": "GLORYS12 (Copernicus)",
    "v_cur": "GLORYS12 (Copernicus)",
    "u_wind": "CCMP V3.1 (NASA)",
    "v_wind": "CCMP V3.1 (NASA)",
}
CLIMATOLOGY = "Synthetic climatology"
logger = logging.getLogger("OceanEmbed.Serve")

model: Optional[Ensemble] = None
data: Optional[OceanData] = None
grid: dict = {}
ckpt_meta = {
    "loaded": False,
    "epoch": None,
    "val_rmse": None,
    "val_mae": None,
}


def load_model() -> None:
    global model, data
    model = Ensemble(DEVICE)
    ckpt = model.checkpoints[0]
    ckpt_meta.update({
        "loaded": True,
        "epoch": ckpt.get("epoch"),
        "val_rmse": ckpt.get("val_rmse"),
        "val_mae": ckpt.get("val_mae"),
    })
    print(f"[Serve] Loaded {len(model)} model(s): {[p.name for p in model.paths]}"
          f"{'' if model.scale is not None else ' (uncalibrated: run model/eval.py)'}")

    data = load()
    H, W = len(data.lat), len(data.lon)
    grid.update(
        lat=torch.from_numpy(np.broadcast_to(data.lat[:, None], (H, W)).copy()).to(DEVICE).unsqueeze(0),
        lon=torch.from_numpy(np.broadcast_to(data.lon[None, :], (H, W)).copy()).to(DEVICE).unsqueeze(0),
        static=torch.from_numpy(data.static).to(DEVICE).unsqueeze(0),
        present=torch.from_numpy(data.x_present).to(DEVICE).unsqueeze(0),
        dates=[str(t)[:10] for t in data.times],
    )
    _day_inference.cache_clear()
    print(f"[Serve] Dataset: {len(grid['dates'])} days {grid['dates'][0]}..{grid['dates'][-1]}, grid {H}x{W}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(
    title="OceanEmbed Inference API",
    description="Subsurface ocean temperature reconstruction via satellite embeddings",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

v1 = APIRouter(prefix="/api/v1")


class SurfaceInput(BaseModel):
    sst: float
    sss: float
    sla: float
    u_cur: float
    v_cur: float
    u_wind: float
    v_wind: float
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(90.0, ge=-180, le=180)
    doy: int = Field(75, ge=1, le=366)


class PointPredictionRequest(BaseModel):
    inputs: List[SurfaceInput]


class PointPredictionResponse(BaseModel):
    depths_m: List[int]
    temperatures: List[List[float]]
    lat: List[float]


class GridPredictionRequest(BaseModel):
    sst: List[List[float]]
    sss: List[List[float]]
    sla: List[List[float]]
    u_cur: List[List[float]]
    v_cur: List[List[float]]
    u_wind: List[List[float]]
    v_wind: List[List[float]]
    lat_grid: Optional[List[List[float]]] = None
    lon_grid: Optional[List[List[float]]] = None
    doy: int = 75


class GridPredictionResponse(BaseModel):
    depths_m: List[int]
    temperature: List[List[List[float]]]
    shape: List[int]


class SurfaceFields(BaseModel):
    sst: Optional[float] = None
    sss: Optional[float] = None
    sla: Optional[float] = None
    u_cur: Optional[float] = None
    v_cur: Optional[float] = None
    u_wind: Optional[float] = None
    v_wind: Optional[float] = None


class ReconstructRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    lon: Optional[float] = Field(None, ge=-180, le=180)
    date: Optional[str] = None
    region: Optional[str] = None
    sst: Optional[float] = None
    sss: Optional[float] = None
    sla: Optional[float] = None
    u_cur: Optional[float] = None
    v_cur: Optional[float] = None
    u_wind: Optional[float] = None
    v_wind: Optional[float] = None
    surface: Optional[SurfaceFields] = None
    source: str = Field("archive", pattern="^(archive|live)$")


class LatLng(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class TransectRequest(BaseModel):
    points: List[LatLng] = Field(..., min_length=2, max_length=50)
    n: int = Field(150, ge=2, le=500)
    date: Optional[str] = None
    format: str = Field("json", pattern="^(json|png|pdf)$")


MEDIA = {"pdf": "application/pdf", "png": "image/png"}


def _file(content: bytes, fmt: str, name: str) -> Response:
    return Response(content, media_type=MEDIA[fmt],
                    headers={"Content-Disposition": f'attachment; filename="{name}.{fmt}"'})


def _require_model() -> Ensemble:
    if model is None or data is None:
        raise HTTPException(500, "Model not loaded")
    return model


def _test_metrics() -> Optional[dict]:
    if METRICS_PATH.exists():
        return json.loads(METRICS_PATH.read_text())
    return None


def _model_card() -> dict:
    n = sum(p.numel() for p in _require_model().parameters())
    m = _test_metrics() or {}
    return {
        "name": "OceanEmbedNet",
        "architecture": "Residual U-Net satellite encoder + 1x1 MLP depth decoder",
        "ensemble_members": len(_require_model()),
        "uncertainty": "calibrated ensemble spread" if _require_model().scale is not None else "uncalibrated",
        "parameters": n,
        "in_channels": FEATURES,
        "pos_encoding": ["sin/cos(2π·doy/365)", "lat", "lon", "ocean mask", "seafloor depth"],
        "depths_m": STD_DEPTHS,
        "checkpoint": ", ".join(p.name for p in _require_model().paths),
        "epoch": ckpt_meta["epoch"],
        "val_rmse_c": ckpt_meta["val_rmse"],
        "val_mae_c": ckpt_meta["val_mae"],
        "test_rmse_c": m.get("overall", {}).get("rmse"),
        "test_mae_c": m.get("overall", {}).get("mae"),
        "trained": ckpt_meta["loaded"],
        "device": DEVICE,
    }


def _day_index(date: Optional[str]) -> tuple[int, bool]:
    """Nearest dataset day to `date` (by day of year) and whether it was an exact match."""
    dates = grid["dates"]
    if date and date[:10] in dates:
        return dates.index(date[:10]), True
    doy = day_of_year(date)
    idx = int(np.argmin(np.abs(data.doy - doy)))
    return idx, False


def _run(x, lat, lon, doy, static, present):
    """Ensemble mean (°C), calibrated σ (°C) and embedding for the first sample, each (C, H, W)."""
    y, sigma, emb = _require_model().predict(x, lat, lon, doy, static, present)
    return y[0], sigma[0], emb[0]


@lru_cache(maxsize=8)
def _day_inference(t: int):
    x = torch.from_numpy(data.X[t:t + 1]).to(DEVICE)
    doy = torch.tensor([data.doy[t]], device=DEVICE)
    return _run(x, grid["lat"], grid["lon"], doy, grid["static"], grid["present"])


PRODUCT_INFO = {
    "tchp": ("Tropical cyclone heat potential", "kJ/cm²"),
    "d26": ("Depth of the 26 °C isotherm", "m"),
    "mld": ("Mixed-layer depth", "m"),
    "sld": ("Sonic layer depth", "m"),
    "sigma100": ("Model uncertainty (±1σ) at 100 m", "°C"),
}


@lru_cache(maxsize=8)
def _day_products(t: int) -> dict:
    """All derived product grids for dataset day t, NaN on land."""
    y, sigma, _ = _day_inference(t)
    T = y.cpu().numpy().astype(np.float64)
    T[~data.y_valid] = np.nan
    ocean = data.static[0] > 0.5
    h = products.mld(T)
    c = products.sound_speed(T, products.salinity_profile(data.X[t, 1], h))
    out = {
        "tchp": products.tchp(T),
        "d26": products.d26(T),
        "mld": h,
        "sld": products.sld(c).astype(np.float64),
        "sigma100": sigma[STD_DEPTHS.index(100)].cpu().numpy().astype(np.float64),
    }
    return {k: np.where(ocean, v, np.nan) for k, v in out.items()}


def _surface_at(t: int, i: int, j: int) -> dict:
    return {f: round(float(data.X[t, k, i, j]), 4) for k, f in enumerate(FEATURES)}


def _lineage(source: str, date: Optional[str], live: bool = False) -> dict:
    return {"source": source, "date": date, "live": live}


def _client_lineage(overrides: dict) -> dict:
    return {f: _lineage("Client-supplied", None) for f in overrides}


def _finish(payload: dict, t0: float) -> dict:
    payload["surface_synthesized"] = any(v["source"] == CLIMATOLOGY for v in payload["lineage"].values())
    payload["inference_latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    return payload


def _profile_payload(lat, lon, date, region, overrides: dict, override_lineage: Optional[dict] = None) -> dict:
    _require_model()
    t0 = time.perf_counter()
    override_lineage = override_lineage or _client_lineage(overrides)
    cell = nearest_ocean(data, lat, lon)
    if cell is None:
        return _out_of_domain_payload(lat, lon, date, region, overrides, override_lineage, t0)

    t, exact = _day_index(date)
    i, j = cell
    if overrides:
        x = torch.from_numpy(data.X[t:t + 1].copy()).to(DEVICE)
        for k, f in enumerate(FEATURES):
            if f in overrides:
                x[0, k, i, j] = overrides[f]
        doy = torch.tensor([data.doy[t]], device=DEVICE)
        y, sigma, emb = _run(x, grid["lat"], grid["lon"], doy, grid["static"], grid["present"])
    else:
        y, sigma, emb = _day_inference(t)

    valid = data.y_valid[:, i, j]
    truth = [round(float(v), 3) if ok else None for v, ok in zip(data.Y[t, :, i, j], valid)]
    temps = y[:, i, j].cpu().tolist()
    sig = sigma[:, i, j].cpu().tolist()
    vec = emb[:, i, j].cpu().tolist()
    glat, glon = float(data.lat[i]), float(data.lon[j])
    snap_km = float(np.hypot(glat - lat, (glon - lon) * np.cos(np.radians(lat))) * 111.2)
    surface = {**_surface_at(t, i, j), **overrides}
    seafloor = max((z for z, ok in zip(STD_DEPTHS, valid) if ok), default=0)
    day = grid["dates"][t]
    lineage = {f: override_lineage.get(f) or _lineage(ARCHIVE_SOURCES[f], day) for f in FEATURES}

    return _finish({
        "depths_m": STD_DEPTHS,
        "temperatures": [round(v, 3) for v in temps],
        "truth": truth,
        "valid_depths": [bool(v) for v in valid],
        "seafloor_depth_m": int(seafloor),
        "uncertainty_c": [round(v, 3) for v in sig],
        "products": products.profile_products(
            STD_DEPTHS, [v if ok else None for v, ok in zip(temps, valid)], surface["sss"]),
        "embedding": [round(v, 5) for v in vec],
        "embedding_dim": len(vec),
        "surface": {**surface, "lat": glat, "lng": glon, "doy": int(data.doy[t])},
        "date": grid["dates"][t],
        "date_exact": exact,
        "region": region,
        "source": "neural",
        "in_domain": True,
        "source_mode": "archive",
        "lineage": lineage,
        "grid_point": {"lat": glat, "lng": glon, "snap_km": round(snap_km, 1)},
        "model": _model_card(),
    }, t0)


def _out_of_domain_payload(lat, lon, date, region, overrides: dict, override_lineage: dict, t0: float) -> dict:
    clim = surface_from_point(lat, lon, region)
    fields = {f: overrides.get(f, clim[f]) for f in FEATURES}
    doy = day_of_year(date)
    x = torch.tensor([fields[f] for f in FEATURES], dtype=torch.float32, device=DEVICE)
    x = x.view(1, 7, 1, 1).expand(1, 7, PATCH, PATCH).contiguous()
    lat_t = torch.full((1, PATCH, PATCH), lat, device=DEVICE)
    lon_t = torch.full((1, PATCH, PATCH), lon, device=DEVICE)
    doy_t = torch.tensor([doy], device=DEVICE)
    y, sigma, emb = _run(x, lat_t, lon_t, doy_t, None, None)
    c = PATCH // 2
    temps = y[:, c, c].cpu().tolist()
    sig = sigma[:, c, c].cpu().tolist()
    vec = emb[:, c, c].cpu().tolist()
    lineage = {f: override_lineage.get(f) or _lineage(CLIMATOLOGY, None) for f in FEATURES}
    return _finish({
        "depths_m": STD_DEPTHS,
        "temperatures": [round(v, 3) for v in temps],
        "truth": None,
        "valid_depths": [True] * len(STD_DEPTHS),
        "seafloor_depth_m": None,
        "uncertainty_c": [round(v, 3) for v in sig],
        "products": products.profile_products(STD_DEPTHS, temps, fields["sss"]),
        "embedding": [round(v, 5) for v in vec],
        "embedding_dim": len(vec),
        "surface": {**fields, "lat": lat, "lng": lon, "doy": doy},
        "date": date,
        "date_exact": False,
        "region": region,
        "source": "neural",
        "in_domain": False,
        "source_mode": "archive",
        "lineage": lineage,
        "grid_point": None,
        "model": _model_card(),
    }, t0)


def _health_payload() -> dict:
    return {
        "status": "ok",
        "device": DEVICE,
        "model_loaded": model is not None,
        "checkpoint_loaded": ckpt_meta["loaded"],
        "val_rmse_c": ckpt_meta["val_rmse"],
        "epoch": ckpt_meta["epoch"],
    }


@app.get("/health")
def health():
    return _health_payload()


@v1.get("/health")
def health_v1():
    return _health_payload()


@app.get("/depths")
def get_depths():
    return {"depths_m": STD_DEPTHS, "n_depths": len(STD_DEPTHS)}


@v1.get("/depths")
def get_depths_v1():
    return {"depths_m": STD_DEPTHS, "n_depths": len(STD_DEPTHS)}


@v1.get("/dataset")
def dataset_info():
    _require_model()
    return {
        "dates": grid["dates"],
        "lat_range": [float(data.lat[0]), float(data.lat[-1])],
        "lon_range": [float(data.lon[0]), float(data.lon[-1])],
        "resolution_deg": float(data.lat[1] - data.lat[0]),
        "shape": [len(data.lat), len(data.lon)],
        "ocean_pixels": int(data.static[0].sum()),
    }


@v1.get("/metrics")
def metrics():
    payload = {"model": _model_card()}
    if LOG_PATH.exists():
        payload["train_log"] = json.loads(LOG_PATH.read_text())
        log = payload["train_log"]
        payload["best_val_rmse"] = min(log.get("val_rmse", [None]))
        payload["final_val_rmse"] = (log.get("val_rmse") or [None])[-1]
        payload["epochs"] = len(log.get("train_loss") or [])
    m = _test_metrics()
    if m:
        payload["validation"] = m
    return payload


async def _live_payload(lat, lon, region, overrides: dict) -> dict:
    """Reconstruct from current Open-Meteo readings; SSS/SLA fall back to the latest dataset day."""
    live = await fetch_live(lat, lon)
    observed = live["observed_at"] or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    lineage = {f: _lineage("Open-Meteo", observed, live=True) for f in live["values"]}
    lineage.update(_client_lineage(overrides))
    # Blocking torch inference runs off the event loop
    payload = await run_in_threadpool(
        _profile_payload, lat, lon, grid["dates"][-1], region, {**live["values"], **overrides}, lineage)
    payload.update({
        "source_mode": "live",
        "date": observed[:10],
        "date_exact": False,
        # GLORYS truth belongs to the archive day, not to today
        "truth": None,
        "live_fields": sorted(live["values"]),
        "warning": ("Experimental: Open-Meteo inputs differ from the training sources and the model has only "
                    "seen Feb-Mar 2024. Salinity and sea level are from the latest archive day."),
    })
    return payload


@v1.get("/products")
def product_grid(
    date: Optional[str] = None,
    var: str = Query("tchp", pattern="^(tchp|d26|mld|sld|sigma100)$"),
):
    _require_model()
    t, exact = _day_index(date)
    grid_v = _day_products(t)[var]
    finite = grid_v[np.isfinite(grid_v)]
    name, units = PRODUCT_INFO[var]
    stats = {"min": None, "max": None, "mean": None}
    if finite.size:
        stats = {"min": round(float(finite.min()), 2), "max": round(float(finite.max()), 2),
                 "mean": round(float(finite.mean()), 2)}
    return {
        "var": var, "name": name, "units": units,
        "date": grid["dates"][t], "date_exact": exact,
        "lat": [float(v) for v in data.lat], "lon": [float(v) for v in data.lon],
        "values": [[None if not np.isfinite(v) else round(float(v), 2) for v in row] for row in grid_v],
        "stats": stats,
        "thresholds": {"watch": products.TCHP_WATCH, "high": products.TCHP_HIGH} if var == "tchp" else None,
    }


@v1.get("/bulletin", response_class=HTMLResponse)
def daily_bulletin(date: Optional[str] = None):
    _require_model()
    t, _ = _day_index(date)
    return bulletin.render(grid["dates"][t], _day_products(t), data.lat, data.lon, _test_metrics())


@v1.get("/bulletin/point")
def point_bulletin(
    lat: float = Query(..., ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    date: Optional[str] = None,
    region: Optional[str] = None,
    format: str = Query("pdf", pattern="^(pdf|png)$"),
):
    lon = lon if lon is not None else lng
    if lon is None:
        raise HTTPException(400, "lon or lng is required")
    p = _profile_payload(lat, lon, date, region, {})
    t, _ = _day_index(date)
    content = bulletin.render_point(p, format, _test_metrics(), _day_products(t)["tchp"], data.lat, data.lon)
    s = p["surface"]
    return _file(content, format, f"oceanembed_bulletin_{s['lat']:.2f}N_{s['lng']:.2f}E_{p['date']}")


def _nan_list(a: np.ndarray, nd: int = 3) -> list:
    return [None if not np.isfinite(v) else round(float(v), nd) for v in a]


def _transect_payload(req: TransectRequest) -> dict:
    _require_model()
    t0 = time.perf_counter()
    t, exact = _day_index(req.date)
    y, sigma, _ = _day_inference(t)
    Y, S = y.cpu().numpy(), sigma.cpu().numpy()
    prods = _day_products(t)

    wlat = [p.lat for p in req.points]
    wlon = [p.lng for p in req.points]
    lat_s, lon_s, dist, cum = transect.sample_path(wlat, wlon, req.n)
    res = float(data.lat[1] - data.lat[0])
    i = np.abs(data.lat[:, None] - lat_s[None]).argmin(0)
    j = np.abs(data.lon[:, None] - lon_s[None]).argmin(0)
    inside = ((lat_s >= data.lat[0] - res / 2) & (lat_s <= data.lat[-1] + res / 2)
              & (lon_s >= data.lon[0] - res / 2) & (lon_s <= data.lon[-1] + res / 2))
    ocean = inside & (data.static[0][i, j] > 0.5)
    valid = data.y_valid[:, i, j] & ocean[None]                        # (D, N)
    model_s = np.where(valid, Y[:, i, j], np.nan)
    truth_s = np.where(valid, data.Y[t][:, i, j], np.nan)
    sigma_s = np.where(valid, S[:, i, j], np.nan)
    depths = np.asarray(STD_DEPTHS, float)
    seafloor = np.where(valid.any(0), depths[np.where(valid, np.arange(len(depths))[:, None], 0).max(0)], np.nan)

    def along(name):
        return np.where(ocean, prods[name][i, j], np.nan)

    mld_s, d26_s, tchp_s = along("mld"), along("d26"), along("tchp")
    err = model_s - truth_s

    def stat(a, fn, nd=1):
        f = a[np.isfinite(a)]
        return round(float(fn(f)), nd) if f.size else None

    return {
        "date": grid["dates"][t],
        "date_exact": exact,
        "depths_m": STD_DEPTHS,
        "waypoints": [{"lat": a, "lng": b} for a, b in zip(wlat, wlon)],
        "waypoint_distance_km": [round(float(v), 2) for v in cum],
        "distance_km": [round(float(v), 2) for v in dist],
        "lat": [round(float(v), 4) for v in lat_s],
        "lon": [round(float(v), 4) for v in lon_s],
        "cell_lat": [float(data.lat[k]) for k in i],
        "cell_lon": [float(data.lon[k]) for k in j],
        "in_domain": inside.tolist(),
        "ocean": ocean.tolist(),
        "seafloor_depth_m": _nan_list(seafloor, 0),
        "model": [_nan_list(r) for r in model_s],
        "truth": [_nan_list(r) for r in truth_s],
        "sigma": [_nan_list(r) for r in sigma_s],
        "mld_m": _nan_list(mld_s, 1),
        "d26_m": _nan_list(d26_s, 1),
        "tchp_kj_cm2": _nan_list(tchp_s, 1),
        "summary": {
            "length_km": round(float(cum[-1]), 1),
            "n_ocean": int(ocean.sum()),
            "sst_min": stat(model_s[0], np.min), "sst_max": stat(model_s[0], np.max),
            "mld_mean": stat(mld_s, np.mean, 0), "d26_mean": stat(d26_s, np.mean, 0),
            "tchp_max": stat(tchp_s, np.max, 0),
            "rmse_vs_glorys": stat(err, lambda e: np.sqrt(np.mean(e ** 2)), 3),
            "sigma_mean": stat(sigma_s, np.mean, 2),
        },
        "inference_latency_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


@v1.post("/transect")
def transect_section(req: TransectRequest):
    p = _transect_payload(req)
    if req.format == "json":
        return p
    content = transect.render(p, req.format, data.static[0] > 0.5, data.lat, data.lon)
    a, b = p["waypoints"][0], p["waypoints"][-1]
    return _file(content, req.format,
                 f"oceanembed_transect_{a['lat']:.1f}N{a['lng']:.1f}E_{b['lat']:.1f}N{b['lng']:.1f}E_{p['date']}")


@v1.get("/argo")
def argo_matchups():
    if not MATCHUPS_PATH.exists():
        raise HTTPException(404, "No ARGO matchups; run scripts/fetch_argo.py then model/eval.py")
    matchups = json.loads(MATCHUPS_PATH.read_text())
    summary = (_test_metrics() or {}).get("argo")
    return {"summary": summary, "profiles": matchups}


@v1.get("/profile")
async def profile(
    lat: float = Query(..., ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    date: Optional[str] = None,
    region: Optional[str] = None,
    source: str = Query("archive", pattern="^(archive|live)$"),
):
    lon = lon if lon is not None else lng
    if lon is None:
        raise HTTPException(400, "lon or lng is required")
    if source == "live":
        return await _live_payload(lat, lon, region, {})
    return await run_in_threadpool(_profile_payload, lat, lon, date, region, {})


@v1.post("/reconstruct")
async def reconstruct(req: ReconstructRequest):
    lon = req.lng if req.lng is not None else req.lon
    if lon is None:
        raise HTTPException(400, "lng or lon is required")
    src = req.surface.model_dump(exclude_none=True) if req.surface else {}
    top = {f: getattr(req, f) for f in FEATURES if getattr(req, f) is not None}
    overrides = {**src, **top}
    if req.source == "live":
        return await _live_payload(req.lat, lon, req.region, overrides)
    return await run_in_threadpool(_profile_payload, req.lat, lon, req.date, req.region, overrides)


@app.post("/predict/point", response_model=PointPredictionResponse)
def predict_point(req: PointPredictionRequest):
    out = []
    for i in req.inputs:
        fields = {f: getattr(i, f) for f in FEATURES}
        out.append(_profile_payload(i.lat, i.lon, None, None, fields)["temperatures"])
    return PointPredictionResponse(depths_m=STD_DEPTHS, temperatures=out, lat=[i.lat for i in req.inputs])


@app.post("/predict", response_model=GridPredictionResponse)
def predict_grid(req: GridPredictionRequest):
    fields = [req.sst, req.sss, req.sla, req.u_cur, req.v_cur, req.u_wind, req.v_wind]
    arrs = [np.array(f, dtype=np.float32) for f in fields]
    H, W = arrs[0].shape
    x_t = torch.from_numpy(np.stack(arrs, axis=0)).unsqueeze(0).to(DEVICE)
    if req.lat_grid is not None:
        lat_np = np.array(req.lat_grid, dtype=np.float32)
    else:
        lat_np = np.broadcast_to(np.linspace(8.0, 22.0, H, dtype=np.float32)[:, None], (H, W)).copy()
    if req.lon_grid is not None:
        lon_np = np.array(req.lon_grid, dtype=np.float32)
    else:
        lon_np = np.broadcast_to(np.linspace(80.0, 100.0, W, dtype=np.float32)[None, :], (H, W)).copy()
    lat_t = torch.from_numpy(lat_np).unsqueeze(0).to(DEVICE)
    lon_t = torch.from_numpy(lon_np).unsqueeze(0).to(DEVICE)
    doy_t = torch.tensor([req.doy], device=DEVICE)
    y, _, _ = _run(x_t, lat_t, lon_t, doy_t, None, None)
    return GridPredictionResponse(depths_m=STD_DEPTHS, temperature=y.cpu().numpy().tolist(), shape=[len(STD_DEPTHS), H, W])


app.include_router(v1)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("model.serve:app", host="0.0.0.0", port=8000, reload=False)
