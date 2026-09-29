"""
OceanEmbed Training Script
===========================
Trains OceanEmbedNet on data/processed/dataset.nc
Outputs model/best_model.pt and model/train_log.json

Usage:
    python model/train.py
    python model/train.py --epochs 400 --batch 8 --lr 2e-3
"""

import argparse
import copy
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.optim as optim

sys.path.insert(0, str(Path(__file__).parent.parent))
from model.data import TRAIN_DAYS, VAL_DAYS, load
from model.eval import masked_metrics
from model.ocean_embed import OceanEmbedLoss, build_model


class Tensors:
    """Whole dataset as tensors on one device; the grid is small enough to keep resident."""
    def __init__(self, data, device):
        T = data.X.shape[0]
        H, W = len(data.lat), len(data.lon)
        self.x = torch.from_numpy(data.X).to(device)
        self.y = torch.from_numpy(data.Y).to(device)
        self.valid = torch.from_numpy(data.y_valid).to(device).unsqueeze(0)
        self.present = torch.from_numpy(data.x_present).to(device).unsqueeze(0)
        self.static = torch.from_numpy(data.static).to(device).unsqueeze(0)
        self.lat = torch.from_numpy(np.broadcast_to(data.lat[:, None], (H, W)).copy()).to(device).unsqueeze(0)
        self.lon = torch.from_numpy(np.broadcast_to(data.lon[None, :], (H, W)).copy()).to(device).unsqueeze(0)
        self.doy = torch.from_numpy(data.doy).to(device)
        self.T, self.H, self.W = T, H, W

    def batch(self, days, crop=None, rng=None):
        days = torch.as_tensor(list(days), device=self.x.device)
        B = len(days)
        sl = (slice(None), slice(None))
        if crop is not None:
            ch, cw = crop
            i = int(rng.integers(0, self.H - ch + 1))
            j = int(rng.integers(0, self.W - cw + 1))
            sl = (slice(i, i + ch), slice(j, j + cw))
        rep = lambda a: (c := a[(..., *sl)]).expand(B, *c.shape[1:])
        return dict(
            x=self.x[days][(..., *sl)], y=self.y[days][(..., *sl)],
            valid=rep(self.valid), present=rep(self.present), static=rep(self.static),
            lat=rep(self.lat), lon=rep(self.lon), doy=self.doy[days],
        )


def predict(model, t: Tensors, days, bs=8):
    out = []
    days = list(days)
    for k in range(0, len(days), bs):
        b = t.batch(days[k:k + bs])
        out.append(model(b['x'], b['lat'], b['lon'], b['doy'], b['static'], b['present']))
    return torch.cat(out)


def train(args):
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"[Train] Device: {device}")

    data = load()
    t = Tensors(data, device)
    train_days, val_days = list(TRAIN_DAYS), list(VAL_DAYS)
    print(f"[Train] Train days: {len(train_days)}  Val days: {len(val_days)}  "
          f"ocean pixels: {int(data.static[0].sum())}/{t.H * t.W}")

    model_kwargs = {'emb_ch': args.width, 'dropout': args.dropout, 'use_doy': not args.no_doy,
                    'sst_demean': args.sst_demean}
    model = build_model(device, **model_kwargs)
    model.set_stats(**data.stats(train_days))
    ema = copy.deepcopy(model).eval()
    for p in ema.parameters():
        p.requires_grad_(False)

    criterion = OceanEmbedLoss(lambda_strat=args.lambda_strat)
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    steps_per_epoch = max(1, len(train_days) // args.batch)
    total = args.epochs * steps_per_epoch
    warmup = 5 * steps_per_epoch
    scheduler = optim.lr_scheduler.LambdaLR(
        optimizer, lambda s: min(1.0, (s + 1) / warmup) * 0.5 * (1 + np.cos(np.pi * min(1.0, s / total))))

    best_val_rmse = float('inf')
    log = {'train_loss': [], 'val_rmse': [], 'val_mae': []}
    save_path = Path(args.out)
    val_y = t.y[val_days]
    val_valid = t.valid.expand(len(val_days), -1, -1, -1)
    crop = (args.crop_h, args.crop_w)

    for epoch in range(1, args.epochs + 1):
        model.train()
        t0 = time.time()
        train_loss = 0.0
        order = rng.permutation(train_days)
        for s in range(steps_per_epoch):
            b = t.batch(order[s * args.batch:(s + 1) * args.batch], crop=crop, rng=rng)
            x = b['x'] + args.noise * torch.randn_like(b['x']) * model.x_std.view(1, -1, 1, 1)
            optimizer.zero_grad()
            pred = model(x, b['lat'], b['lon'], b['doy'], b['static'], b['present'])
            loss, mse, strat = criterion(pred, b['y'], b['valid'])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            with torch.no_grad():
                for pe, pm in zip(ema.parameters(), model.parameters()):
                    pe.lerp_(pm, 1 - args.ema)
            train_loss += loss.item()
        train_loss /= steps_per_epoch

        with torch.no_grad():
            m = masked_metrics(predict(ema, t, val_days), val_y, val_valid)
        rmse, mae = m['overall']['rmse'], m['overall']['mae']
        log['train_loss'].append(train_loss)
        log['val_rmse'].append(rmse)
        log['val_mae'].append(mae)

        if rmse < best_val_rmse:
            best_val_rmse = rmse
            torch.save({
                'epoch': epoch,
                'model_state': ema.state_dict(),
                'model_kwargs': model_kwargs,
                'val_rmse': rmse,
                'val_mae': mae,
                'args': vars(args),
            }, save_path)
            saved = ' *'
        else:
            saved = ''
        if epoch % args.log_every == 0 or saved:
            print(f"Epoch {epoch:3d}/{args.epochs} | Loss={train_loss:.4f} | Val RMSE={rmse:.3f}°C | "
                  f"MAE={mae:.3f}°C | {time.time() - t0:.1f}s{saved}", flush=True)

    log_path = save_path.parent / "train_log.json"
    log_path.write_text(json.dumps(log, indent=2))
    print(f"\n[Done] Best Val RMSE: {best_val_rmse:.4f} °C")
    print(f"[Done] Model saved to {save_path}")
    print(f"[Done] Log  saved to  {log_path}")
    return log


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train OceanEmbedNet')
    parser.add_argument('--epochs',       type=int,   default=400)
    parser.add_argument('--batch',        type=int,   default=6)
    parser.add_argument('--lr',           type=float, default=2e-3)
    parser.add_argument('--wd',           type=float, default=1e-3)
    parser.add_argument('--width',        type=int,   default=48)
    parser.add_argument('--dropout',      type=float, default=0.1)
    parser.add_argument('--noise',        type=float, default=0.02, help='Input noise, fraction of channel std')
    parser.add_argument('--ema',          type=float, default=0.99)
    parser.add_argument('--crop_h',       type=int,   default=48)
    parser.add_argument('--crop_w',       type=int,   default=64)
    parser.add_argument('--lambda_strat', type=float, default=0.05)
    parser.add_argument('--no_doy',       action='store_true', help='Drop day-of-year input (recommended for single-season data)')
    parser.add_argument('--sst_demean',   action='store_true', help='Give the CNN only spatial SST anomalies')
    parser.add_argument('--seed',         type=int,   default=0)
    parser.add_argument('--log_every',    type=int,   default=20)
    parser.add_argument('--out',          type=str,   default=str(Path(__file__).resolve().parent / "best_model.pt"))
    train(parser.parse_args())
