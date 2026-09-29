"""
Deep ensemble of OceanEmbedNet members with calibrated per-pixel, per-depth uncertainty.

Members live in model/ensemble/member_*.pt (trained with different seeds). The mean is the
prediction; the spread across members, scaled per depth, is the ±1σ uncertainty. The scale is
fitted on the validation days so that 90% of GLORYS values fall inside mean ± 1.645σ
(see calibrate()). Without members the single model/best_model.pt is used and σ falls back to
the per-depth test RMSE.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

import torch

from model.ocean_embed import OceanEmbedNet

ROOT = Path(__file__).resolve().parent.parent
ENSEMBLE_DIR = ROOT / "model" / "ensemble"
CALIBRATION_PATH = ENSEMBLE_DIR / "calibration.json"
SINGLE_PATH = ROOT / "model" / "best_model.pt"
Z90 = 1.645  # two-sided 90% interval half-width in σ


def _load(path: Path, device) -> tuple[OceanEmbedNet, dict]:
    ckpt = torch.load(path, map_location=device)
    net = OceanEmbedNet(**ckpt.get("model_kwargs", {})).to(device)
    net.load_state_dict(ckpt["model_state"])
    net.eval()
    return net, ckpt


class Ensemble:
    def __init__(self, device="cpu", paths: Optional[List[Path]] = None):
        paths = paths or sorted(ENSEMBLE_DIR.glob("member_*.pt")) or [SINGLE_PATH]
        loaded = [_load(p, device) for p in paths if p.exists()]
        if not loaded:
            raise FileNotFoundError(f"No checkpoints in {ENSEMBLE_DIR} or {SINGLE_PATH}")
        self.members = [net for net, _ in loaded]
        self.checkpoints = [ck for _, ck in loaded]
        self.paths = [p for p in paths if p.exists()]
        self.device = device
        self.scale = None     # per-depth σ multiplier, from calibration.json
        self.floor = None     # per-depth σ used when there is a single member
        if CALIBRATION_PATH.exists():
            cal = json.loads(CALIBRATION_PATH.read_text())
            if cal.get("n_members") == len(self.members):
                self.scale = torch.tensor(cal["scale"], device=device).view(1, -1, 1, 1)
                self.floor = torch.tensor(cal["floor"], device=device).view(1, -1, 1, 1)

    def __len__(self):
        return len(self.members)

    def parameters(self):
        for m in self.members:
            yield from m.parameters()

    @torch.no_grad()
    def predict(self, x, lat, lon, doy, static=None, present=None):
        """Returns (mean °C, calibrated σ °C, embedding of member 0), each (B, C, H, W)."""
        mean, spread, emb = self.predict_raw(x, lat, lon, doy, static, present)
        return mean, self.calibrated_sigma(spread), emb

    @torch.no_grad()
    def predict_raw(self, x, lat, lon, doy, static=None, present=None):
        """Returns (mean °C, uncalibrated member spread °C, embedding of member 0)."""
        preds, emb = [], None
        for k, m in enumerate(self.members):
            y, e = m(x, lat, lon, doy, static, present, return_embedding=True)
            preds.append(y)
            if k == 0:
                emb = e
        stack = torch.stack(preds)
        mean = stack.mean(0)
        spread = stack.std(0, unbiased=len(preds) > 1) if len(preds) > 1 else torch.zeros_like(mean)
        return mean, spread, emb

    def calibrated_sigma(self, spread):
        if self.scale is None:
            return spread
        # Spread-scaled σ plus a small per-depth floor so σ never collapses to zero
        return torch.sqrt((self.scale * spread) ** 2 + self.floor ** 2)


def calibrate(ens: Ensemble, spread: torch.Tensor, err: torch.Tensor, valid: torch.Tensor) -> dict:
    """
    Fit per-depth scale s_d and floor f_d on held-out days so that σ = sqrt((s_d·spread)² + f_d²)
    gives 90% coverage of |err| ≤ 1.645σ. The floor is 25% of the depth's RMSE, which keeps σ
    positive where members agree; s_d is then found by bisection.
    """
    n_depth = err.shape[1]
    scale, floor = [], []
    for d in range(n_depth):
        m = valid[:, d].expand_as(err[:, d]).bool()
        e = err[:, d][m].abs()
        s = spread[:, d][m]
        if float(s.max()) == 0.0:
            # Single model: no spread, so σ is a per-depth constant with 90% coverage
            scale.append(0.0)
            floor.append(round(float(torch.quantile(e, 0.9)) / Z90, 4))
            continue
        f = 0.25 * float(torch.sqrt((e ** 2).mean()))
        lo, hi = 0.0, 50.0
        for _ in range(60):
            mid = (lo + hi) / 2
            cover = (e <= Z90 * torch.sqrt((mid * s) ** 2 + f ** 2)).float().mean()
            lo, hi = (mid, hi) if cover < 0.9 else (lo, mid)
        scale.append(round(hi, 4))
        floor.append(round(f, 4))
    return {"n_members": len(ens), "scale": scale, "floor": floor, "target_coverage": 0.9}
