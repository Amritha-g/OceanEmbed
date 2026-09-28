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
  GET  /api/v1/profile         ?lat=&lon=&date=
  POST /api/v1/reconstruct     { lat, lng, date?, surface?, region? }
  POST /predict
  POST /predict/point

Points inside the dataset domain are snapped to the nearest ocean pixel and reconstructed
from that day's real satellite inputs with the full grid as spatial context; the GLORYS12
profile at the same pixel is returned as ground truth. Points outside the domain fall back
to a uniform patch built from the supplied (or climatological) surface values.

Usage:
    python model/serve.py
    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import sys
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.climatology import day_of_year, surface_from_point  # noqa: E402
from model.data import OceanData, load  # noqa: E402
from model.ocean_embed import STD_DEPTHS, OceanEmbedNet  # noqa: E402

MODEL_PATH = ROOT / "model" / "best_model.pt"
LOG_PATH = ROOT / "model" / "train_log.json"
METRICS_PATH = ROOT / "model" / "metrics.json"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FEATURES = ["sst", "sss", "sla", "u_cur", "v_cur", "u_wind", "v_wind"]
PATCH = 16  # side of the uniform patch used for out-of-domain points

model: Optional[OceanEmbedNet] = None
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
    kwargs = {}
    ckpt = None
    if MODEL_PATH.exists():
        ckpt = torch.load(MODEL_PATH, map_location=DEVICE)
        kwargs = ckpt.get("model_kwargs", {})
    net = OceanEmbedNet(**kwargs).to(DEVICE)
    if ckpt is not None:
        net.load_state_dict(ckpt["model_state"])
        ckpt_meta.update({
            "loaded": True,
            "epoch": ckpt.get("epoch"),
            "val_rmse": ckpt.get("val_rmse"),
            "val_mae": ckpt.get("val_mae"),
        })
        print(
            f"[Serve] Loaded {MODEL_PATH} "
            f"(epoch={ckpt_meta['epoch']}, val RMSE={ckpt_meta['val_rmse']:.4f}°C)"
        )
    else:
        print(f"[Serve] WARNING: No checkpoint at {MODEL_PATH}, using untrained weights.")
    net.eval()
    model = net

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


def _require_model() -> OceanEmbedNet:
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
        "parameters": n,
        "in_channels": FEATURES,
        "pos_encoding": ["sin/cos(2π·doy/365)", "lat", "lon", "ocean mask", "seafloor depth"],
        "depths_m": STD_DEPTHS,
        "checkpoint": str(MODEL_PATH.name) if ckpt_meta["loaded"] else None,
        "epoch": ckpt_meta["epoch"],
        "val_rmse_c": ckpt_meta["val_rmse"],
        "val_mae_c": ckpt_meta["val_mae"],
        "test_rmse_c": m.get("overall", {}).get("rmse"),
        "test_mae_c": m.get("overall", {}).get("mae"),
        "trained": ckpt_meta["loaded"],
        "device": DEVICE,
    }


def _uncertainty() -> Optional[List[float]]:
    m = _test_metrics()
    return [d["rmse"] for d in m["per_depth"]] if m else None


def _day_index(date: Optional[str]) -> tuple[int, bool]:
    """Nearest dataset day to `date` (by day of year) and whether it was an exact match."""
    dates = grid["dates"]
    if date and date[:10] in dates:
        return dates.index(date[:10]), True
    doy = day_of_year(date)
    idx = int(np.argmin(np.abs(data.doy - doy)))
    return idx, False


def _nearest_ocean(lat: float, lon: float) -> Optional[tuple[int, int]]:
    """Nearest ocean pixel (i, j) for a point inside the grid bounds, else None."""
    step = float(data.lat[1] - data.lat[0])
    if not (data.lat[0] - step / 2 <= lat <= data.lat[-1] + step / 2
            and data.lon[0] - step / 2 <= lon <= data.lon[-1] + step / 2):
        return None
    ocean = data.static[0] > 0.5
    ii, jj = np.nonzero(ocean)
    d2 = (data.lat[ii] - lat) ** 2 + ((data.lon[jj] - lon) * np.cos(np.radians(lat))) ** 2
    k = int(np.argmin(d2))
    return int(ii[k]), int(jj[k])


def _run(x, lat, lon, doy, static, present):
    with torch.no_grad():
        y, emb = _require_model()(x, lat, lon, doy, static, present, return_embedding=True)
    return y[0], emb[0]


@lru_cache(maxsize=8)
def _day_inference(t: int):
    x = torch.from_numpy(data.X[t:t + 1]).to(DEVICE)
    doy = torch.tensor([data.doy[t]], device=DEVICE)
    return _run(x, grid["lat"], grid["lon"], doy, grid["static"], grid["present"])


def _surface_at(t: int, i: int, j: int) -> dict:
    return {f: round(float(data.X[t, k, i, j]), 4) for k, f in enumerate(FEATURES)}


def _profile_payload(lat, lon, date, region, overrides: dict) -> dict:
    _require_model()
    cell = _nearest_ocean(lat, lon)
    if cell is None:
        return _out_of_domain_payload(lat, lon, date, region, overrides)

    t, exact = _day_index(date)
    i, j = cell
    if overrides:
        x = torch.from_numpy(data.X[t:t + 1].copy()).to(DEVICE)
        for k, f in enumerate(FEATURES):
            if f in overrides:
                x[0, k, i, j] = overrides[f]
        doy = torch.tensor([data.doy[t]], device=DEVICE)
        y, emb = _run(x, grid["lat"], grid["lon"], doy, grid["static"], grid["present"])
    else:
        y, emb = _day_inference(t)

    valid = data.y_valid[:, i, j]
    truth = [round(float(v), 3) if ok else None for v, ok in zip(data.Y[t, :, i, j], valid)]
    temps = y[:, i, j].cpu().tolist()
    vec = emb[:, i, j].cpu().tolist()
    glat, glon = float(data.lat[i]), float(data.lon[j])
    snap_km = float(np.hypot(glat - lat, (glon - lon) * np.cos(np.radians(lat))) * 111.2)
    surface = {**_surface_at(t, i, j), **overrides}
    seafloor = max((z for z, ok in zip(STD_DEPTHS, valid) if ok), default=0)

    return {
        "depths_m": STD_DEPTHS,
        "temperatures": [round(v, 3) for v in temps],
        "truth": truth,
        "valid_depths": [bool(v) for v in valid],
        "seafloor_depth_m": int(seafloor),
        "uncertainty_c": _uncertainty(),
        "embedding": [round(v, 5) for v in vec],
        "embedding_dim": len(vec),
        "surface": {**surface, "lat": glat, "lng": glon, "doy": int(data.doy[t])},
        "date": grid["dates"][t],
        "date_exact": exact,
        "region": region,
        "source": "neural",
        "in_domain": True,
        "surface_synthesized": False,
        "grid_point": {"lat": glat, "lng": glon, "snap_km": round(snap_km, 1)},
        "model": _model_card(),
    }


def _out_of_domain_payload(lat, lon, date, region, overrides: dict) -> dict:
    clim = surface_from_point(lat, lon, region)
    fields = {f: overrides.get(f, clim[f]) for f in FEATURES}
    doy = day_of_year(date)
    x = torch.tensor([fields[f] for f in FEATURES], dtype=torch.float32, device=DEVICE)
    x = x.view(1, 7, 1, 1).expand(1, 7, PATCH, PATCH).contiguous()
    lat_t = torch.full((1, PATCH, PATCH), lat, device=DEVICE)
    lon_t = torch.full((1, PATCH, PATCH), lon, device=DEVICE)
    doy_t = torch.tensor([doy], device=DEVICE)
    y, emb = _run(x, lat_t, lon_t, doy_t, None, None)
    c = PATCH // 2
    temps = y[:, c, c].cpu().tolist()
    vec = emb[:, c, c].cpu().tolist()
    return {
        "depths_m": STD_DEPTHS,
        "temperatures": [round(v, 3) for v in temps],
        "truth": None,
        "valid_depths": [True] * len(STD_DEPTHS),
        "seafloor_depth_m": None,
        "uncertainty_c": _uncertainty(),
        "embedding": [round(v, 5) for v in vec],
        "embedding_dim": len(vec),
        "surface": {**fields, "lat": lat, "lng": lon, "doy": doy},
        "date": date,
        "date_exact": False,
        "region": region,
        "source": "neural",
        "in_domain": False,
        "surface_synthesized": len(overrides) < len(FEATURES),
        "grid_point": None,
        "model": _model_card(),
    }


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


@v1.get("/profile")
def profile(
    lat: float = Query(..., ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    date: Optional[str] = None,
    region: Optional[str] = None,
):
    lon = lon if lon is not None else lng
    if lon is None:
        raise HTTPException(400, "lon or lng is required")
    return _profile_payload(lat, lon, date, region, {})


@v1.post("/reconstruct")
def reconstruct(req: ReconstructRequest):
    lon = req.lng if req.lng is not None else req.lon
    if lon is None:
        raise HTTPException(400, "lng or lon is required")
    src = req.surface.model_dump(exclude_none=True) if req.surface else {}
    top = {f: getattr(req, f) for f in FEATURES if getattr(req, f) is not None}
    return _profile_payload(req.lat, lon, req.date, req.region, {**src, **top})


@app.post("/predict/point", response_model=PointPredictionResponse)
def predict_point(req: PointPredictionRequest):
    out = []
    for i in req.inputs:
        fields = {f: getattr(i, f) for f in FEATURES}
        out.append(_out_of_domain_payload(i.lat, i.lon, None, None, fields)["temperatures"])
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
    y, _ = _run(x_t, lat_t, lon_t, doy_t, None, None)
    return GridPredictionResponse(depths_m=STD_DEPTHS, temperature=y.cpu().numpy().tolist(), shape=[len(STD_DEPTHS), H, W])


app.include_router(v1)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("model.serve:app", host="0.0.0.0", port=8000, reload=False)
