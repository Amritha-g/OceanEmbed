"""
Evaluation: GLORYS test days, uncertainty calibration and the ARGO benchmark.

1. Fits the ensemble's per-depth σ calibration on the validation days (model/ensemble/calibration.json).
2. Scores the ensemble mean on the held-out chronological test days (ocean cells only) against
   two reference predictors: per-pixel training-period mean (climatology) and the last training
   day (persistence). Reports 90%-interval coverage.
3. Scores the model, GLORYS, climatology and persistence against real ARGO float profiles
   (model/argo_eval.py), when data/processed/argo_profiles.json exists.

Writes model/metrics.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from model.ocean_embed import STD_DEPTHS

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "model" / "metrics.json"
SIH_TARGET_RMSE = 0.5


def _pearson(a: torch.Tensor, b: torch.Tensor) -> float:
    a = a - a.mean()
    b = b - b.mean()
    den = torch.sqrt((a * a).sum() * (b * b).sum()) + 1e-8
    return float((a * b).sum() / den)


def _stats(p: torch.Tensor, t: torch.Tensor) -> dict:
    e = p - t
    return {
        "rmse": round(torch.sqrt((e ** 2).mean()).item(), 4),
        "mae": round(e.abs().mean().item(), 4),
        "bias": round(e.mean().item(), 4),
        "corr": round(_pearson(p, t), 4),
    }


def masked_metrics(pred: torch.Tensor, true: torch.Tensor, valid: torch.Tensor) -> dict:
    """pred/true (N, D, H, W), valid broadcastable bool. Metrics over valid cells only."""
    valid = valid.expand_as(true).bool()
    pred, true = pred.detach().float().cpu(), true.float().cpu()
    valid = valid.cpu()
    overall = _stats(pred[valid], true[valid])
    per_depth = [{"depth_m": z, **_stats(pred[:, i][valid[:, i]], true[:, i][valid[:, i]])}
                 for i, z in enumerate(STD_DEPTHS)]
    return {"overall": overall, "per_depth": per_depth}


def _coverage(mean, sigma, true, valid) -> dict:
    """Share of cells inside mean ± 1.645σ, overall and per depth."""
    from model.ensemble import Z90
    inside = ((mean - true).abs() <= Z90 * sigma) & valid.expand_as(true).bool()
    v = valid.expand_as(true).bool()
    per = [round(float(inside[:, d].sum() / v[:, d].sum().clamp_min(1)), 4) for d in range(true.shape[1])]
    return {"nominal": 0.9, "overall": round(float(inside.sum() / v.sum()), 4), "per_depth": per}


@torch.no_grad()
def input_importance(ens, t, days, valid, true) -> dict:
    """
    Input ablation (A5): replace one surface channel at a time with its training mean and measure
    how much the test RMSE rises at each depth. A large rise means the depth depends on that input.
    """
    from model.ocean_embed import N_SURFACE

    def rmse_per_depth(x_override=None):
        preds = []
        for k in range(0, len(days), 6):
            b = t.batch(days[k:k + 6])
            x = b["x"].clone()
            if x_override is not None:
                c, value = x_override
                x[:, c] = value
            m, _, _ = ens.predict_raw(x, b["lat"], b["lon"], b["doy"], b["static"], b["present"])
            preds.append(m.cpu())
        e2 = (torch.cat(preds) - true) ** 2
        v = valid.expand_as(true).bool()
        return [float(torch.sqrt(e2[:, d][v[:, d]].mean())) for d in range(true.shape[1])]

    base = rmse_per_depth()
    x_mean = ens.members[0].x_mean
    delta = []
    for c in range(N_SURFACE):
        abl = rmse_per_depth((c, x_mean[c]))
        delta.append([round(a - b, 4) for a, b in zip(abl, base)])
    return {
        "method": "channel ablation to training mean, test days",
        "channels": ["sst", "sss", "sla", "u_cur", "v_cur", "u_wind", "v_wind"],
        "depths_m": STD_DEPTHS,
        "base_rmse": [round(b, 4) for b in base],
        "delta_rmse": delta,
    }


@torch.no_grad()
def main():
    from model.argo_eval import argo_benchmark
    from model.data import TEST_DAYS, TRAIN_DAYS, VAL_DAYS, load
    from model.ensemble import CALIBRATION_PATH, Ensemble, calibrate
    from model.train import Tensors, predict

    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = load()
    t = Tensors(data, device)
    val_days, test_days = list(VAL_DAYS), list(TEST_DAYS)
    ens = Ensemble(device)
    print(f"Ensemble: {len(ens)} member(s) {[p.name for p in ens.paths]}")

    def run(days):
        means, spreads = [], []
        for k in range(0, len(days), 6):
            b = t.batch(days[k:k + 6])
            m, s, _ = ens.predict_raw(b["x"], b["lat"], b["lon"], b["doy"], b["static"], b["present"])
            means.append(m.cpu())
            spreads.append(s.cpu())
        return torch.cat(means), torch.cat(spreads)

    valid = t.valid.cpu()

    # 1. Calibrate σ on validation days
    v_mean, v_spread = run(val_days)
    cal = calibrate(ens, v_spread, v_mean - t.y[val_days].cpu(), valid)
    CALIBRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    CALIBRATION_PATH.write_text(json.dumps(cal, indent=2))
    ens = Ensemble(device)  # reload with calibration

    # 2. Test days
    true = t.y[test_days].cpu()
    mean, spread = run(test_days)
    sigma = ens.calibrated_sigma(spread)
    model_m = masked_metrics(mean, true, valid)
    members = []
    if len(ens) > 1:
        for net in ens.members:
            members.append(masked_metrics(predict(net, t, test_days), true, valid)["overall"]["rmse"])

    train_y = t.y[list(TRAIN_DAYS)].cpu()
    baselines = {
        "climatology": masked_metrics(train_y.mean(0, keepdim=True).expand_as(true), true, valid)["overall"],
        "persistence": masked_metrics(train_y[-1:].expand_as(true), true, valid)["overall"],
    }

    rmse = model_m["overall"]["rmse"]
    payload = {
        "checkpoint_epoch": ens.checkpoints[0].get("epoch"),
        "checkpoint_val_rmse": ens.checkpoints[0].get("val_rmse"),
        "checkpoint_val_mae": ens.checkpoints[0].get("val_mae"),
        "ensemble": {"n_members": len(ens), "member_test_rmse": members},
        "split": {
            "method": "chronological",
            "train": [str(data.times[TRAIN_DAYS[0]])[:10], str(data.times[TRAIN_DAYS[-1]])[:10]],
            "val": [str(data.times[val_days[0]])[:10], str(data.times[val_days[-1]])[:10]],
            "test": [str(data.times[test_days[0]])[:10], str(data.times[test_days[-1]])[:10]],
            "ocean_cells_only": True,
        },
        "n_val_days": len(test_days),
        "overall": {
            **model_m["overall"],
            "sih_target_rmse": SIH_TARGET_RMSE,
            "meets_sih_target": rmse < SIH_TARGET_RMSE,
        },
        "baselines": baselines,
        "per_depth": model_m["per_depth"],
        "calibration": {"test_glorys": _coverage(mean, sigma, true, valid)},
    }

    payload["importance"] = input_importance(ens, t, test_days, valid, true)

    # 3. ARGO benchmark
    argo = argo_benchmark(data, t, ens)
    if argo:
        payload["argo"] = argo["summary"]
        payload["calibration"]["argo"] = argo["summary"]["coverage"]

    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps({"model": payload["overall"], **baselines, "members": members,
                      "coverage": payload["calibration"]}, indent=2))
    for p in payload["per_depth"]:
        print(f"  {p['depth_m']:5d} m  RMSE={p['rmse']:.3f}  MAE={p['mae']:.3f}  bias={p['bias']:+.3f}  r={p['corr']:.3f}")
    if argo:
        print(json.dumps(argo["summary"]["overall"], indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
