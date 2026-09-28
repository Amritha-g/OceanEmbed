"""Per-depth validation metrics on the held-out 20% split (same seed as train.py)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader, random_split

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from model.ocean_embed import STD_DEPTHS, OceanEmbedNet
from model.train import DATASET_PATH, OceanDataset

ROOT = Path(__file__).resolve().parent.parent
CKPT = ROOT / "model" / "best_model.pt"
OUT = ROOT / "model" / "metrics.json"


def pearson(a: torch.Tensor, b: torch.Tensor) -> float:
    a = a.flatten().float()
    b = b.flatten().float()
    a = a - a.mean()
    b = b - b.mean()
    den = torch.sqrt((a * a).sum() * (b * b).sum()) + 1e-8
    return float((a * b).sum() / den)


@torch.no_grad()
def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    ds = OceanDataset(DATASET_PATH)
    n_train = int(len(ds) * 0.8)
    n_val = len(ds) - n_train
    _, val_ds = random_split(ds, [n_train, n_val], generator=torch.Generator().manual_seed(42))
    dl = DataLoader(val_ds, batch_size=4, shuffle=False)

    net = OceanEmbedNet().to(device)
    ckpt = torch.load(CKPT, map_location=device)
    net.load_state_dict(ckpt["model_state"])
    net.eval()

    preds, trues = [], []
    for batch in dl:
        pred = net(batch["x"].to(device), batch["lat"].to(device), batch["doy"].to(device).long())
        preds.append(pred.cpu())
        trues.append(batch["y"])

    pred = torch.cat(preds)
    true = torch.cat(trues)
    err = pred - true
    rmse = torch.sqrt((err ** 2).mean()).item()
    mae = err.abs().mean().item()
    bias = err.mean().item()
    corr = pearson(pred, true)

    per_depth = []
    for i, z in enumerate(STD_DEPTHS):
        e = err[:, i]
        per_depth.append({
            "depth_m": z,
            "rmse": round(torch.sqrt((e ** 2).mean()).item(), 4),
            "mae": round(e.abs().mean().item(), 4),
            "bias": round(e.mean().item(), 4),
            "corr": round(pearson(pred[:, i], true[:, i]), 4),
        })

    payload = {
        "checkpoint_epoch": ckpt.get("epoch"),
        "checkpoint_val_rmse": ckpt.get("val_rmse"),
        "checkpoint_val_mae": ckpt.get("val_mae"),
        "n_val_days": n_val,
        "overall": {
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
            "bias": round(bias, 4),
            "corr": round(corr, 4),
            "sih_target_rmse": 0.5,
            "meets_sih_target": rmse < 0.5,
        },
        "per_depth": per_depth,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload["overall"], indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
