"""
Dataset loading, ocean masks and splits shared by train / eval / serve.

dataset.nc fills land and below-seafloor cells with one constant per channel
(see scripts/preprocess.py::fill_nan). Those cells are recovered here as a static
mask so they are excluded from the loss and the metrics and zeroed at the input.

Split is chronological so validation/test days are never adjacent to a training
day (neighbouring days are nearly identical, which makes a random split leak):
    train: days  0-41  (2024-02-01 .. 2024-03-13)
    val:   days 42-47  (2024-03-14 .. 2024-03-19)  -> checkpoint selection
    test:  days 48-59  (2024-03-20 .. 2024-03-31)  -> reported metrics
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "data" / "processed" / "dataset.nc"

TRAIN_DAYS = range(0, 42)
VAL_DAYS = range(42, 48)
TEST_DAYS = range(48, 60)


def fill_mask(arr: np.ndarray) -> np.ndarray:
    """(T, H, W, C) -> (H, W, C) bool, True where the cell is the constant NaN fill every day."""
    out = np.zeros(arr.shape[1:], dtype=bool)
    for c in range(arr.shape[-1]):
        vals, counts = np.unique(arr[..., c], return_counts=True)
        fill = vals[counts.argmax()]
        out[..., c] = (arr[..., c] == fill).all(axis=0)
    return out


@dataclass
class OceanData:
    X: np.ndarray          # (T, 7, H, W)
    Y: np.ndarray          # (T, 15, H, W)
    y_valid: np.ndarray    # (15, H, W) bool, target exists (ocean and above seafloor)
    x_valid: np.ndarray    # (H, W) bool, all 7 inputs are real observations
    x_present: np.ndarray  # (7, H, W) bool, per-channel input is not the fill value
    static: np.ndarray     # (2, H, W) float: ocean mask, fraction of depth levels above seafloor
    lat: np.ndarray        # (H,)
    lon: np.ndarray        # (W,)
    doy: np.ndarray        # (T,)
    times: np.ndarray      # (T,) datetime64

    def stats(self, days) -> dict:
        """Per-channel mean/std over real ocean cells of the given days."""
        days = list(days)
        x_mean, x_std = [], []
        for c in range(self.X.shape[1]):
            v = self.X[days, c][:, self.x_valid]
            x_mean.append(v.mean())
            x_std.append(v.std())
        # Per-depth least-squares slope of temperature on SST; the model adds slope * SST anomaly
        # as a skip connection, so y_mean/y_std describe the residual it actually has to learn
        y_mean, y_std, sst_slope = [], [], []
        for d in range(self.Y.shape[1]):
            ok = self.y_valid[d] & self.x_present[0]
            v = self.Y[days, d][:, ok]
            sst = self.X[days, 0][:, ok] - x_mean[0]
            slope = (v * sst).mean() / (sst * sst).mean() - v.mean() * sst.mean() / (sst * sst).mean()
            r = v - slope * sst
            sst_slope.append(slope)
            y_mean.append(r.mean())
            y_std.append(r.std())
        return {k: np.asarray(v, dtype=np.float32) for k, v in
                dict(x_mean=x_mean, x_std=x_std, y_mean=y_mean, y_std=y_std, sst_slope=sst_slope).items()}


def load(nc_path: Path = DATASET_PATH) -> OceanData:
    ds = xr.open_dataset(nc_path)
    X = ds["X"].values.astype(np.float32)   # (T, H, W, 7)
    Y = ds["Y"].values.astype(np.float32)   # (T, H, W, 15)

    y_fill = fill_mask(Y)                   # (H, W, 15)
    x_fill = fill_mask(X)                   # (H, W, 7)
    y_valid = ~y_fill.transpose(2, 0, 1)
    ocean = y_valid[0]
    x_valid = ocean & ~x_fill.any(axis=-1)
    seafloor = y_valid.mean(axis=0).astype(np.float32)

    return OceanData(
        X=X.transpose(0, 3, 1, 2).copy(),
        Y=Y.transpose(0, 3, 1, 2).copy(),
        y_valid=y_valid,
        x_valid=x_valid,
        x_present=~x_fill.transpose(2, 0, 1),
        static=np.stack([ocean.astype(np.float32), seafloor]),
        lat=ds["lat"].values.astype(np.float32),
        lon=ds["lon"].values.astype(np.float32),
        doy=np.array([pd.Timestamp(t).day_of_year for t in ds["time"].values], dtype=np.float32),
        times=ds["time"].values,
    )


def nearest_ocean(data: OceanData, lat: float, lon: float) -> tuple[int, int] | None:
    """Nearest ocean pixel (i, j) for a point inside the grid bounds (half a cell of margin), else None."""
    step = float(data.lat[1] - data.lat[0])
    if not (data.lat[0] - step / 2 <= lat <= data.lat[-1] + step / 2
            and data.lon[0] - step / 2 <= lon <= data.lon[-1] + step / 2):
        return None
    ii, jj = np.nonzero(data.static[0] > 0.5)
    d2 = (data.lat[ii] - lat) ** 2 + ((data.lon[jj] - lon) * np.cos(np.radians(lat))) ** 2
    k = int(np.argmin(d2))
    return int(ii[k]), int(jj[k])
