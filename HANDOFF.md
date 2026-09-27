# OceanEmbed — Model Training Handoff

> **Status:** Data pipeline complete. Model training not started.  
> **Prepared:** 2026-09-27  
> **For:** Teammate picking up model training

---

## 1. Fixed Schema

These values are locked for the entire project:

| Property | Value |
|---|---|
| **Region** | 8°N – 22°N, 80°E – 100°E (Bay of Bengal + Andaman Sea) |
| **Resolution** | 0.25° × 0.25°, daily |
| **Time range** | 2024-02-01 → 2024-03-31 (60 days) |
| **Depth levels** | 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m (15 levels) |
| **Input variables (X)** | SST (°C), SSS (PSU), SSH/SLA (m), current U (m/s), current V (m/s), wind U (m/s), wind V (m/s) |
| **Target variable (Y)** | Ocean temperature (°C) at the 15 depth levels above |

---

## 2. Dataset Location and Structure

**File:** `data/processed/dataset.nc`

### Arrays & Shapes

| Variable | Shape | Dimensions | Description |
|---|---|---|---|
| `X` | `(60, 57, 81, 7)` | `(time, lat, lon, feature)` | 7 surface/atmospheric input channels |
| `Y` | `(60, 57, 81, 15)` | `(time, lat, lon, depth)` | Subsurface temperature profiles at 15 depths |

### Coordinates & Grid

| Dimension | Size | Values / Range |
|---|---|---|
| `time` | 60 | Daily timestamps (2024-02-01 to 2024-03-31) |
| `lat` | 57 | 8.00°N → 22.00°N with 0.25° spacing |
| `lon` | 81 | 80.00°E → 100.00°E with 0.25° spacing |
| `feature` | 7 | `['sst', 'sss', 'sla', 'u_cur', 'v_cur', 'u_wind', 'v_wind']` |
| `depth` | 15 | `[0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]` m |

### X Channel Order (Axis −1)

1. **`sst`** (Index 0): Sea Surface Temperature (°C)
2. **`sss`** (Index 1): Sea Surface Salinity (PSU)
3. **`sla`** (Index 2): Sea Level Anomaly / SSH (m)
4. **`u_cur`** (Index 3): Surface Current — Zonal component (m/s)
5. **`v_cur`** (Index 4): Surface Current — Meridional component (m/s)
6. **`u_wind`** (Index 5): 10m Surface Wind — Zonal component (m/s)
7. **`v_wind`** (Index 6): 10m Surface Wind — Meridional component (m/s)

---

## 3. Data Provenance & Substitutions

| Variable | Source Dataset | Product Identifier | Notes / Substitutions |
|---|---|---|---|
| **SST** | OSTIA (Copernicus Marine) | `SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001` | L4 Daily 0.05° regridded to 0.25°; converted Kelvin to °C. |
| **SLA** | DUACS (Copernicus Marine) | `SEALEVEL_GLO_PHY_L4_NRT_008_046` | L4 Daily SLA on native ~0.25° grid, regridded to schema. |
| **SSS** | GLORYS12 (Copernicus Marine) | `GLOBAL_ANALYSISFORECAST_PHY_001_024` (`so` var) | Extracted shallowest level (`depth=0`), regridded 1/12° to 0.25°. |
| **Currents (U, V)** | GLORYS12 (Copernicus Marine) | `GLOBAL_ANALYSISFORECAST_PHY_001_024` (`uo`, `vo` vars) | *Substitution from OSCAR:* Used daily GLORYS surface currents to match GLORYS reanalysis grid and daily timestamps directly without temporal interpolation artifacts. |
| **Winds (U, V)** | CCMP V3.1 (NASA PO.DAAC) | `CCMP_WINDS_10M6HR_L4_V3.1` | Streamed 60 daily global files via Earthdata HTTPS with in-memory regional bounding-box subsetting (never wrote heavy multi-GB global files to disk), averaged 6-hourly steps to daily mean. |
| **Temperature Target** | GLORYS12 (Copernicus Marine) | `GLOBAL_ANALYSISFORECAST_PHY_001_024` (`thetao` var) | 35 native depth levels extracted at standard 15 depths via nearest-neighbour depth level selection. |

---

## 4. Known Caveats

1. **Near-Coast SSS Anomaly:** Salinity reaches low values (~13.8 PSU) near river mouths and coastal estuaries (Ganges-Brahmaputra discharge). Before training, consider masking or bounding extreme coastal freshwater values if training exclusively on open-ocean regimes.
2. **Nearest-Neighbour Depth Extraction:** GLORYS vertical levels are discrete (e.g. 0.49m, 5.07m, 9.57m, ...). Schema depths (0, 5, 10, ...) map to nearest native levels.
3. **Land / Coastal NaN Handling:** In `dataset.nc`, NaN cells (land / coastline mask) were filled with feature spatial means to keep arrays contiguous. **A land mask should be applied during training loss computation.**
4. **Time Duration:** Dataset currently covers 60 days (Feb 1 – Mar 31, 2024). Sufficient for model architecture prototyping and initial validation; scale to multi-year before full deployment.

---

## 5. What Is NOT Done Yet

- [ ] Model architecture implementation (e.g., 1D MLP profile predictor, 2D CNN, U-Net, or spatio-temporal ConvLSTM/Transformer).
- [ ] Training script (`scripts/train.py`) and training loop with loss masking over land.
- [ ] Feature scaling/normalization pipeline (StandardScaler / MinMax saved for inference).
- [ ] In-situ evaluation against real ARGO float profiles.

---

## 6. Suggested Next Steps

1. **Create Land Mask:** Extract ocean grid coordinates where `sst` is valid in raw data and build a boolean mask `(57, 81)` to exclude land points from loss calculation.
2. **Train/Val Split:** Split along the time axis (e.g., Days 1–50 for training, Days 51–60 for validation).
3. **Normalize Inputs/Targets:** Fit scalers only on training days:
   ```python
   # shape: (N_train_ocean_points, 7)
   X_mean, X_std = X_train.mean(axis=0), X_train.std(axis=0)
   ```
4. **Baseline Model:** Implement a baseline point-wise MLP `7 -> [128, 64] -> 15` mapping surface features to subsurface temperature profile.
5. **Spatial Model:** Build a 2D CNN `(B, 7, 57, 81) -> (B, 15, 57, 81)` using masked MSE loss over ocean pixels.
6. **ARGO Truth Check:** Fetch ARGO float profiles in the region to benchmark predictions against real in-situ observations.

---

## Quick Loader Snippet

```python
import xarray as xr
import numpy as np

ds = xr.open_dataset("data/processed/dataset.nc")
X = ds["X"].values  # (60, 57, 81, 7)
Y = ds["Y"].values  # (60, 57, 81, 15)

features = list(ds["feature"].values)
depths = list(ds["depth"].values)
print("Features:", features)
print("Depths:", depths)
```
