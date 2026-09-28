"""
OceanEmbed Training Script
===========================
Trains OceanEmbedNet on data/processed/dataset.nc
Outputs model/best_model.pt and model/train_log.json

Usage:
    python model/train.py
    python model/train.py --epochs 100 --batch 4 --lr 1e-3
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, random_split
import xarray as xr

sys.path.insert(0, str(Path(__file__).parent.parent))
from model.ocean_embed import OceanEmbedNet, OceanEmbedLoss, build_model

DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "dataset.nc"
LAT_GRID_MIN, LAT_GRID_MAX = 8.0, 22.0
STD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]


# ── Dataset ────────────────────────────────────────────────────────────────────
class OceanDataset(Dataset):
    """
    Loads (X, Y) pairs from dataset.nc.
    Each sample is one (time, lat-patch, lon-patch) snapshot.
    We flatten time into the batch dimension: N_samples = T * (patches-per-image).
    For simplicity we treat the full spatial grid as one sample per timestep.
    """
    def __init__(self, nc_path: Path):
        ds = xr.open_dataset(nc_path)
        # X: (T, H, W, 7) -> (T, 7, H, W)
        X = ds['X'].values.transpose(0, 3, 1, 2).astype(np.float32)  # (T, 7, H, W)
        # Y: (T, H, W, 15) -> (T, 15, H, W)
        Y = ds['Y'].values.transpose(0, 3, 1, 2).astype(np.float32)  # (T, 15, H, W)

        # Build latitude grid (H, W)
        lats = ds['lat'].values.astype(np.float32)    # (H,)
        H, W = X.shape[2], X.shape[3]
        lat_grid = np.broadcast_to(lats[:, None], (H, W)).copy()  # (H, W)

        # Day-of-year from time coordinate
        times = ds['time'].values  # numpy datetime64
        import pandas as pd
        doys = np.array([pd.Timestamp(t).day_of_year for t in times], dtype=np.float32)

        self.X = torch.from_numpy(X)
        self.Y = torch.from_numpy(Y)
        self.lat_grid = torch.from_numpy(lat_grid)  # (H, W)
        self.doys = torch.from_numpy(doys)          # (T,)
        self.T = X.shape[0]

    def __len__(self):
        return self.T

    def __getitem__(self, idx):
        return {
            'x':    self.X[idx],        # (7, H, W)
            'y':    self.Y[idx],        # (15, H, W)
            'lat':  self.lat_grid,      # (H, W)
            'doy':  self.doys[idx],     # scalar
        }


# ── Training Loop ──────────────────────────────────────────────────────────────
def train(args):
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"[Train] Device: {device}")

    # ── Dataset / DataLoader
    print(f"[Train] Loading dataset from {DATASET_PATH} ...")
    ds = OceanDataset(DATASET_PATH)
    n_train = int(len(ds) * 0.8)
    n_val   = len(ds) - n_train
    train_ds, val_ds = random_split(ds, [n_train, n_val],
                                     generator=torch.Generator().manual_seed(42))
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True,  num_workers=0)
    val_dl   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, num_workers=0)
    print(f"[Train] Train samples: {n_train}  Val samples: {n_val}")

    # ── Model
    model = build_model(device)
    criterion = OceanEmbedLoss(lambda_strat=args.lambda_strat)
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    best_val_rmse = float('inf')
    log = {'train_loss': [], 'val_rmse': [], 'val_mae': []}
    save_path = Path(__file__).resolve().parent / "best_model.pt"

    for epoch in range(1, args.epochs + 1):
        # ── Train
        model.train()
        train_loss = 0.0
        t0 = time.time()
        for batch in train_dl:
            x   = batch['x'].to(device)
            y   = batch['y'].to(device)
            lat = batch['lat'].to(device)
            doy = batch['doy'].to(device).long()

            optimizer.zero_grad()
            pred = model(x, lat, doy)
            loss, mse, strat = criterion(pred, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()

        train_loss /= len(train_dl)
        scheduler.step()

        # ── Validate
        model.eval()
        all_pred, all_true = [], []
        with torch.no_grad():
            for batch in val_dl:
                x   = batch['x'].to(device)
                y   = batch['y'].to(device)
                lat = batch['lat'].to(device)
                doy = batch['doy'].to(device).long()
                pred = model(x, lat, doy)
                all_pred.append(pred.cpu())
                all_true.append(y.cpu())

        all_pred = torch.cat(all_pred)  # (N_val, 15, H, W)
        all_true = torch.cat(all_true)
        rmse = torch.sqrt(torch.mean((all_pred - all_true) ** 2)).item()
        mae  = torch.mean(torch.abs(all_pred - all_true)).item()

        # Per-depth RMSE at surface (SST) and thermocline (100m)
        rmse_surf = torch.sqrt(torch.mean((all_pred[:,0] - all_true[:,0])**2)).item()
        rmse_100m = torch.sqrt(torch.mean((all_pred[:,7] - all_true[:,7])**2)).item()

        elapsed = time.time() - t0
        print(f"Epoch {epoch:3d}/{args.epochs} | "
              f"Loss={train_loss:.4f} | Val RMSE={rmse:.3f}°C | "
              f"MAE={mae:.3f}°C | RMSE@SST={rmse_surf:.3f} | RMSE@100m={rmse_100m:.3f} | "
              f"{elapsed:.1f}s")

        log['train_loss'].append(train_loss)
        log['val_rmse'].append(rmse)
        log['val_mae'].append(mae)

        if rmse < best_val_rmse:
            best_val_rmse = rmse
            torch.save({
                'epoch': epoch,
                'model_state': model.state_dict(),
                'val_rmse': rmse,
                'val_mae': mae,
                'args': vars(args),
            }, save_path)
            print(f"  --> Saved best model (RMSE={rmse:.4f}°C)")

    # Save training log
    log_path = Path(__file__).resolve().parent / "train_log.json"
    with open(log_path, 'w') as f:
        json.dump(log, f, indent=2)
    print(f"\n[Done] Best Val RMSE: {best_val_rmse:.4f} °C")
    print(f"[Done] Model saved to {save_path}")
    print(f"[Done] Log  saved to  {log_path}")
    return log


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train OceanEmbedNet')
    parser.add_argument('--epochs',       type=int,   default=80,    help='Number of epochs')
    parser.add_argument('--batch',        type=int,   default=4,     help='Batch size')
    parser.add_argument('--lr',           type=float, default=1e-3,  help='Learning rate')
    parser.add_argument('--lambda_strat', type=float, default=0.05,  help='Stratification loss weight')
    args = parser.parse_args()
    train(args)
