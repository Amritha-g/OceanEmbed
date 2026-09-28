"""
Per-depth metrics on the held-out chronological test days (ocean cells only).

Also scores two reference predictors on the same cells so the model's numbers have context:
  - climatology: per-pixel mean profile over the training days
  - persistence: the last training day's profile
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
CKPT = ROOT / "model" / "best_model.pt"
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


@torch.no_grad()
def main():
    from model.data import TEST_DAYS, TRAIN_DAYS, VAL_DAYS, load
    from model.ocean_embed import OceanEmbedNet
    from model.train import Tensors, predict

    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = load()
    t = Tensors(data, device)
    test_days = list(TEST_DAYS)

    ckpt = torch.load(CKPT, map_location=device)
    net = OceanEmbedNet(**ckpt.get("model_kwargs", {})).to(device)
    net.load_state_dict(ckpt["model_state"])
    net.eval()

    true = t.y[test_days].cpu()
    valid = t.valid.cpu()
    model_m = masked_metrics(predict(net, t, test_days), true, valid)

    train_y = t.y[list(TRAIN_DAYS)].cpu()
    clim = train_y.mean(0, keepdim=True).expand_as(true)
    persist = train_y[-1:].expand_as(true)
    baselines = {
        "climatology": masked_metrics(clim, true, valid)["overall"],
        "persistence": masked_metrics(persist, true, valid)["overall"],
    }

    rmse = model_m["overall"]["rmse"]
    payload = {
        "checkpoint_epoch": ckpt.get("epoch"),
        "checkpoint_val_rmse": ckpt.get("val_rmse"),
        "checkpoint_val_mae": ckpt.get("val_mae"),
        "split": {
            "method": "chronological",
            "train": [str(data.times[TRAIN_DAYS[0]])[:10], str(data.times[TRAIN_DAYS[-1]])[:10]],
            "val": [str(data.times[VAL_DAYS[0]])[:10], str(data.times[VAL_DAYS[-1]])[:10]],
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
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps({"model": payload["overall"], **baselines}, indent=2))
    for p in payload["per_depth"]:
        print(f"  {p['depth_m']:5d} m  RMSE={p['rmse']:.3f}  MAE={p['mae']:.3f}  bias={p['bias']:+.3f}  r={p['corr']:.3f}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
