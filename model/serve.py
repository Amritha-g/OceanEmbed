"""
OceanEmbed Inference API
==========================
FastAPI server exposing the trained OceanEmbedNet model.

  GET  /health
  GET  /depths
  GET  /api/v1/health
  GET  /api/v1/depths
  GET  /api/v1/metrics
  POST /api/v1/reconstruct     { lat, lng, date?, surface?, region? }
  POST /predict
  POST /predict/point

Usage:
    python model/serve.py
    uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import numpy as np
import torch
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import logging

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from model.climatology import day_of_year, surface_from_point  # noqa: E402
from model.live_feed import get_live_surface_inputs  # noqa: E402
from model.ocean_embed import STD_DEPTHS, OceanEmbedNet  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [Serve] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("OceanEmbed.Serve")

MODEL_PATH = ROOT / "model" / "best_model.pt"
LOG_PATH = ROOT / "model" / "train_log.json"
METRICS_PATH = ROOT / "model" / "metrics.json"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
LAT_MIN, LAT_MAX = 8.0, 22.0
LON_MIN, LON_MAX = 80.0, 100.0

model: Optional[OceanEmbedNet] = None
ckpt_meta = {
    "loaded": False,
    "epoch": None,
    "val_rmse": None,
    "val_mae": None,
}


def load_model() -> None:
    global model
    net = OceanEmbedNet().to(DEVICE)
    if MODEL_PATH.exists():
        ckpt = torch.load(MODEL_PATH, map_location=DEVICE)
        net.load_state_dict(ckpt["model_state"])
        ckpt_meta.update({
            "loaded": True,
            "epoch": ckpt.get("epoch"),
            "val_rmse": ckpt.get("val_rmse"),
            "val_mae": ckpt.get("val_mae"),
        })
        print(
            f"[Serve] Loaded {MODEL_PATH} "
            f"(epoch={ckpt_meta['epoch']}, RMSE={ckpt_meta['val_rmse']:.4f}°C)"
        )
    else:
        print(f"[Serve] WARNING: No checkpoint at {MODEL_PATH}, using untrained weights.")
    net.eval()
    model = net


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(
    title="OceanEmbed Inference API",
    description="Subsurface ocean temperature reconstruction via satellite embeddings",
    version="1.0.0",
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
    date: Optional[str] = "2024-03-15"
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
    if model is None:
        raise HTTPException(500, "Model not loaded")
    return model


def _model_card() -> dict:
    n = sum(p.numel() for p in _require_model().parameters())
    return {
        "name": "OceanEmbedNet",
        "architecture": "ResNet satellite encoder + 1x1 MLP depth decoder",
        "parameters": n,
        "in_channels": ["sst", "sss", "sla", "u_cur", "v_cur", "u_wind", "v_wind"],
        "pos_encoding": ["sin(lat)", "sin(2π·doy/365)"],
        "depths_m": STD_DEPTHS,
        "checkpoint": str(MODEL_PATH.name) if ckpt_meta["loaded"] else None,
        "epoch": ckpt_meta["epoch"],
        "val_rmse_c": ckpt_meta["val_rmse"],
        "val_mae_c": ckpt_meta["val_mae"],
        "trained": ckpt_meta["loaded"],
        "device": DEVICE,
    }


def _infer_point(sst, sss, sla, u_cur, v_cur, u_wind, v_wind, lat, doy):
    net = _require_model()
    x = torch.tensor(
        [[[[sst]], [[sss]], [[sla]], [[u_cur]], [[v_cur]], [[u_wind]], [[v_wind]]]],
        dtype=torch.float32,
        device=DEVICE,
    )
    lat_t = torch.tensor([[[lat]]], dtype=torch.float32, device=DEVICE)
    doy_t = torch.tensor([doy], dtype=torch.float32, device=DEVICE)
    with torch.no_grad():
        y = net(x, lat_t, doy_t)
        emb = net.get_embedding(x, lat_t, doy_t)
    temps = y.squeeze().cpu().tolist()
    if isinstance(temps, float):
        temps = [temps]
    vec = emb.squeeze().cpu().tolist()
    if isinstance(vec, float):
        vec = [vec]
    return [float(t) for t in temps], [float(v) for v in vec]


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


@v1.get("/metrics")
def metrics():
    payload = {"model": _model_card()}
    if LOG_PATH.exists():
        payload["train_log"] = json.loads(LOG_PATH.read_text())
        log = payload["train_log"]
        payload["best_val_rmse"] = min(log.get("val_rmse", [None]))
        payload["final_val_rmse"] = (log.get("val_rmse") or [None])[-1]
        payload["epochs"] = len(log.get("train_loss") or [])
    if METRICS_PATH.exists():
        payload["validation"] = json.loads(METRICS_PATH.read_text())
    return payload


@v1.post("/reconstruct")
def reconstruct(req: ReconstructRequest):
    lon = req.lng if req.lng is not None else req.lon
    if lon is None:
        logger.error("Reconstruct rejected: missing lng/lon")
        raise HTTPException(400, "lng or lon is required")

    logger.info("Received /api/v1/reconstruct request for coordinates (%.4f°N, %.4f°E, date=%s, region=%s)", req.lat, lon, req.date, req.region)

    # 1. Fetch live hybrid marine feeds
    live_feed = get_live_surface_inputs(req.lat, lon, req.region)
    src = req.surface.model_dump() if req.surface else {}
    
    # 2. Allow optional client overrides if explicitly provided
    fields = {
        "sst": req.sst if req.sst is not None else (src.get("sst") if src.get("sst") is not None else live_feed["sst"]),
        "sss": req.sss if req.sss is not None else (src.get("sss") if src.get("sss") is not None else live_feed["sss"]),
        "sla": req.sla if req.sla is not None else (src.get("sla") if src.get("sla") is not None else live_feed["sla"]),
        "u_cur": req.u_cur if req.u_cur is not None else (src.get("u_cur") if src.get("u_cur") is not None else live_feed["u_cur"]),
        "v_cur": req.v_cur if req.v_cur is not None else (src.get("v_cur") if src.get("v_cur") is not None else live_feed["v_cur"]),
        "u_wind": req.u_wind if req.u_wind is not None else (src.get("u_wind") if src.get("u_wind") is not None else live_feed["u_wind"]),
        "v_wind": req.v_wind if req.v_wind is not None else (src.get("v_wind") if src.get("v_wind") is not None else live_feed["v_wind"]),
    }

    doy = day_of_year(req.date)
    logger.info("Running PyTorch forward pass on surface features: SST=%.2f°C, SSS=%.2f PSU, SLA=%.3fm, Winds=(%.2f, %.2f) m/s, DOY=%d",
                fields["sst"], fields["sss"], fields["sla"], fields["u_wind"], fields["v_wind"], doy)
    
    t0 = time.time()
    temps, embedding = _infer_point(
        fields["sst"], fields["sss"], fields["sla"],
        fields["u_cur"], fields["v_cur"], fields["u_wind"], fields["v_wind"],
        req.lat, doy,
    )
    latency_ms = (time.time() - t0) * 1000.0
    logger.info("Model inference completed in %.2f ms. 0m Temp=%.2f°C, 1000m Temp=%.2f°C", latency_ms, temps[0], temps[-1])

    return {
        "depths_m": STD_DEPTHS,
        "temperatures": [round(t, 3) for t in temps],
        "embedding": [round(v, 5) for v in embedding],
        "embedding_dim": len(embedding),
        "surface": {**fields, "lat": req.lat, "lng": lon, "doy": doy},
        "date": req.date,
        "region": req.region,
        "source": "neural",
        "is_live": live_feed.get("is_live", False),
        "source_provider": live_feed.get("source_provider", "Hybrid Live Ingest"),
        "lineage": live_feed.get("lineage", {}),
        "surface_synthesized": not live_feed.get("is_live", False),
        "inference_latency_ms": round(latency_ms, 2),
        "model": _model_card(),
    }


@app.post("/predict/point", response_model=PointPredictionResponse)
def predict_point(req: PointPredictionRequest):
    N = len(req.inputs)
    x_data = np.array(
        [[i.sst, i.sss, i.sla, i.u_cur, i.v_cur, i.u_wind, i.v_wind] for i in req.inputs],
        dtype=np.float32,
    )
    lats = np.array([i.lat for i in req.inputs], dtype=np.float32)
    doys = np.array([i.doy for i in req.inputs], dtype=np.int64)
    x_t = torch.from_numpy(x_data).view(N, 7, 1, 1).to(DEVICE)
    lat_t = torch.from_numpy(lats).view(N, 1, 1).to(DEVICE)
    doy_t = torch.from_numpy(doys).to(DEVICE)
    net = _require_model()
    with torch.no_grad():
        y = net(x_t, lat_t, doy_t)
    y_np = y.squeeze(-1).squeeze(-1).cpu().numpy()
    return PointPredictionResponse(depths_m=STD_DEPTHS, temperatures=y_np.tolist(), lat=lats.tolist())


@app.post("/predict", response_model=GridPredictionResponse)
def predict_grid(req: GridPredictionRequest):
    fields = [req.sst, req.sss, req.sla, req.u_cur, req.v_cur, req.u_wind, req.v_wind]
    arrs = [np.array(f, dtype=np.float32) for f in fields]
    H, W = arrs[0].shape
    x_t = torch.from_numpy(np.stack(arrs, axis=0)).unsqueeze(0).to(DEVICE)
    if req.lat_grid is not None:
        lat_np = np.array(req.lat_grid, dtype=np.float32)
    else:
        lats = np.linspace(LAT_MIN, LAT_MAX, H)
        lat_np = np.broadcast_to(lats[:, None], (H, W)).copy()
    lat_t = torch.from_numpy(lat_np).unsqueeze(0).to(DEVICE)
    doy_t = torch.tensor([req.doy], device=DEVICE)
    net = _require_model()
    with torch.no_grad():
        y = net(x_t, lat_t, doy_t)
    y_np = y.squeeze(0).cpu().numpy()
    return GridPredictionResponse(depths_m=STD_DEPTHS, temperature=y_np.tolist(), shape=[len(STD_DEPTHS), H, W])


app.include_router(v1)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("model.serve:app", host="0.0.0.0", port=8000, reload=False)
