# OceanEmbed

> **Reconstructing the invisible ocean — surface to 1000 m — from satellite-only inputs.**

[![Status](https://img.shields.io/badge/status-active%20development-00f0ff?style=flat-square&labelColor=050b14)](https://github.com/Amritha-g/OceanEmbed)
[![Region](https://img.shields.io/badge/region-Bay%20of%20Bengal%20%7C%20Arabian%20Sea-0284c7?style=flat-square&labelColor=050b14)](.)
[![Resolution](https://img.shields.io/badge/resolution-0.25°%20daily-00f0ff?style=flat-square&labelColor=050b14)](.)
[![Depths](https://img.shields.io/badge/depths-15%20levels%20%7C%200–1000m-0284c7?style=flat-square&labelColor=050b14)](.)
[![SIH](https://img.shields.io/badge/SIH%202026-Problem%2026066-f43f5e?style=flat-square&labelColor=050b14)](.)

---

## What is OceanEmbed?

The ocean's interior is largely invisible. Subsurface temperature profiles — critical for cyclone intensity forecasting, fishery management, and climate modeling — require expensive, sparse ARGO floats or research vessels. **OceanEmbed** bridges this gap by learning a mapping from freely available satellite observations to full-depth (0–1000 m) thermal profiles using deep learning.

This repository directly addresses **Smart India Hackathon (SIH) Problem Statement 26066** (*Ministry of Earth Sciences / INCOIS*):
> *"Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations"*

---

## Key Features

| Feature | Description |
|---|---|
| 🗺️ **Interactive Multi-Variant Ocean Explorer** | Fully interactive Leaflet-powered map supporting **Dark** (Stadia Maps), **Satellite** (Esri World Imagery), and **Light** (OpenStreetMap) base layers — 100% free with no API keys or watermarks required. |
| 🔄 **Dynamic Basin Switching** | Seamless switching between **Bay of Bengal** and **Arabian Sea** with animated camera flights (`flyTo`) and regional float tracks, thermal point clouds, and storm systems. Spacious layout with no cramped tabs. |
| 🪟 **Toggleable Collapsible Sidebar** | Users can collapse the sidebar with a single click on the floating toggle button to experience an uninterrupted panoramic, full-screen map interface. |
| 🛰️ **Non-Obstructive Floating Telemetry** | Clean, collapsible floating glass inspector tabbed across *Point Inspection*, *Heatwave Hazards*, *Cyclone Forecast Track*, and *ARGO Floats* — leaving the map surface unobstructed. |
| 🔬 **Synchronized OceanDive** | Depth scrubber through all 15 standard levels (0–1000 m), synchronized with real-time vertical temperature & salinity profiles, mixed layer depth (MLD) thresholds, and uncertainty bands matching the map coordinates. |
| ✅ **Accurate Truth Check** | Side-by-side comparison of neural predictions vs. co-located in-situ ARGO float observations (#6904117 in BoB, #6905541 in AS), featuring real-time RMSE, correlation, and bias metrics. |
| 🧠 **Ocean Intelligence** | Basin-synchronized physical indices: Marine Heat Anomaly, Ocean Heat Content (OHC), Stratification & Barrier Layer index, and Mixed Layer Depth (MLD). |

---

## Centralized Ocean Physics Engine (`oceanPhysics.ts`)

All modules across OceanEmbed share a single source of physical truth reflecting the unique oceanographic regimes of the Northern Indian Ocean:

- **Bay of Bengal (BoB):** Heavy freshwater influx (Ganges-Brahmaputra) produces a low-salinity surface cap (32.5–33.8 PSU) creating strong salinity stratification (barrier layer), trapping heat in a shallow mixed layer (MLD ~ 24–38 m) with high Tropical Cyclone Heat Potential (OHC > 80 kJ/cm²).
- **Arabian Sea (AS):** High evaporation exceeding precipitation forms saline Arabian Sea High Salinity Water (ASHSW, 35.5–36.8 PSU), leading to deeper mixed layers (MLD ~ 45–70 m) and recent escalating marine heatwaves.

---

## Data Pipeline

All data is real, publicly available, and fully reproducible.

### Input Variables (X)

| Variable | Source | Product |
|---|---|---|
| SST (°C) | OSTIA / Copernicus Marine | `SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001` |
| SSH / SLA (m) | DUACS / Copernicus Marine | `SEALEVEL_GLO_PHY_L4_NRT_008_046` |
| Salinity (PSU) | GLORYS12 / Copernicus Marine | `GLOBAL_ANALYSISFORECAST_PHY_001_024` |
| Currents U/V (m/s) | GLORYS12 / Copernicus Marine | same product |
| Winds U/V (m/s) | CCMP V3.1 / NASA PO.DAAC | `CCMP_WINDS_10M6HR_L4_V3.1` |

### Target Variable (Y)

| Variable | Source | Depths |
|---|---|---|
| Temperature (°C) | GLORYS12 | 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m |

### Fixed Schema

```
Region     : Bay of Bengal (8°N – 22°N, 80°E – 100°E) & Arabian Sea (7°N – 25°N, 56°E – 77°E)
Resolution : 0.25° × 0.25°, daily
Period     : 2024-02-01 → 2024-03-31 (60 days, extensible)
X shape    : (60, 57, 81, 7)   — time × lat × lon × feature
Y shape    : (60, 57, 81, 15)  — time × lat × lon × depth
```

---

## Repository Structure

```
OceanEmbed/
├── data/
│   ├── raw/                    # Source NetCDF files (OSTIA, DUACS, GLORYS, CCMP)
│   └── processed/
│       └── dataset.nc          # Preprocessed X/Y arrays on unified 0.25° grid
│
├── scripts/
│   ├── preprocess.py           # Full preprocessing pipeline (raw → dataset.nc)
│   └── download_ccmp_winds.py  # CCMP wind download (NASA Earthdata, in-memory subset)
│
├── src/                        # React/Vite frontend dashboard
│   ├── components/
│   │   ├── OceanExplorer.tsx   # Interactive Leaflet map, layer controls & floating telemetry
│   │   ├── OceanDive.tsx       # Water column depth scrubber (0–1000m)
│   │   ├── TruthCheck.tsx      # ARGO in-situ validation chart
│   │   ├── OceanIntelligence.tsx # Derived physical indicators (MLD, OHC)
│   │   ├── HomeScreen.tsx      # 3D interactive hero landing screen
│   │   └── Sidebar.tsx         # Collapsible navigation shell with toggle button
│   ├── utils/
│   │   └── oceanPhysics.ts     # Unified ocean physics data models & profile generators
│   ├── index.css               # Oceanic cybernetic design system & animations
│   ├── App.tsx                 # Main application layout, state synchronization & sidebar toggle
│   └── main.tsx
│
├── HANDOFF.md                  # Technical handoff for model training
└── README.md
```

---

## Quick Start

### Dashboard

```bash
# Clone the repository
git clone https://github.com/Amritha-g/OceanEmbed.git
cd OceanEmbed

# Install dependencies
npm install

# Start local development server
npm run dev
# → http://localhost:3000
```

### Deep Learning Backend & Inference Server

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Train the 5-member ensemble (optional — trained members are in model/ensemble/)
for k in 0 1 2 3 4; do
  python model/train.py --no_doy --sst_demean --lambda_smooth 0.1 --seed $k --out model/ensemble/member_$k.pt
done

# 3. Fetch real ARGO floats for validation (public, no login)
python scripts/fetch_argo.py

# 4. Evaluate: calibrates uncertainty, scores test days and ARGO, computes input importance
python model/eval.py

# 5. Launch FastAPI Inference Server
python model/serve.py
# or: uvicorn api.main:app --host 0.0.0.0 --port 8000
# → Swagger API Docs available at http://localhost:8000/docs
```

---

## Deep Learning Model Architecture & Performance

OceanEmbed uses a **deep ensemble of five residual U-Net encoders + per-pixel depth decoders** (`model/ocean_embed.py`, `model/ensemble.py`, ~2.2M parameters each). The prediction is the ensemble mean; the spread between members, calibrated on the validation days, is the ±σ uncertainty on every pixel and depth:

- **Input:** 7 satellite surface channels (`SST`, `SSS`, `SLA`, `u_cur`, `v_cur`, `u_wind`, `v_wind`) + latitude, longitude, ocean mask and seafloor depth. Normalisation statistics are computed from the training days.
- **SST skip connection:** each depth adds a fixed, data-derived multiple of the SST anomaly (≈0.9 near the surface, ≈0 below 75 m). The CNN only sees the *spatial* SST pattern, so basin-wide warming reaches the output through this physical link and the model extrapolates to days warmer than any it trained on.
- **Encoder:** three-scale residual U-Net (GroupNorm, SiLU) producing a 48-dimensional embedding per pixel.
- **Decoder:** 1×1 convolutional MLP predicting all 15 depth levels at once.
- **Loss:** MSE over ocean cells only (land and below-seafloor cells are masked), a penalty on temperature inversions below 30 m, and a penalty on the error's curvature along depth (`--lambda_smooth`).
- Day-of-year is **not** used: with a single 60-day season it acts as a date index and hurts generalisation (`--no_doy`).

### Evaluation (held-out 20–31 March 2024, ocean cells only)

Days are split chronologically — train 1 Feb–13 Mar, validation 14–19 Mar (checkpoint selection), test 20–31 Mar — because neighbouring days are nearly identical and a random split leaks.

| Predictor | RMSE | MAE | Bias |
|---|---|---|---|
| Per-pixel training-period mean | 1.036 °C | 0.753 °C | −0.38 °C |
| Persistence (last training day) | 0.847 °C | 0.568 °C | −0.27 °C |
| Original ResNet model, same split | 0.650 °C | 0.467 °C | −0.21 °C |
| Single OceanEmbedNet | 0.514 °C | 0.357 °C | −0.02 °C |
| **5-member ensemble (current)** | **0.468 °C** | **0.325 °C** | **−0.03 °C** |

Error by depth: ~0.4 °C in the upper 20 m, 0.59–0.66 °C through the thermocline (50–150 m), ~0.18 °C below 300 m. The ensemble meets the SIH target of RMSE < 0.5 °C on held-out days; each member alone scores 0.506–0.520 °C. The test set is only 12 days from one season, so treat these numbers as indicative; extending `dataset.nc` beyond 60 days is the main lever for improving them.

> Earlier versions of this README reported 0.214 °C. That figure included land/fill cells and used a random day split, so validation days were effectively seen in training.

```bash
python model/train.py --no_doy --sst_demean --lambda_smooth 0.1 --seed 0 --out model/ensemble/member_0.pt  # one member (seeds 0-4)
python model/eval.py                          # writes model/metrics.json
```

---

## Changelog — Model Performance

All RMSE figures are on the held-out test days (20–31 March 2024), ocean cells only, unless noted.

### 1. Honest evaluation (baseline re-measured)
- **Masked land and below-seafloor cells.** `dataset.nc` fills them with one constant per channel (31% of the grid at the surface, 49% at 1000 m). They were in the loss and the metrics, which made the error look smaller. `model/data.py` now recovers a static ocean mask from the fill values.
- **Chronological split.** The old random 80/20 split put near-identical neighbouring days in both train and validation. It is now train 1 Feb–13 Mar, validation 14–19 Mar (checkpoint selection) and test 20–31 Mar.
- **Reference predictors.** `eval.py` now also scores a per-pixel training-mean profile (1.036 °C) and persistence of the last training day (0.847 °C).
- **Result:** the original model's reported 0.214 °C became **0.650 °C** when retrained and scored this way.

### 2. Architecture and training fixes → 0.595 °C
- **Decoder bug fixed.** Outputs were rescaled by `sqrt(y_mean)` instead of `y_std`.
- **Data-derived normalisation.** Mean and std for inputs and targets now come from the training days. They used to be hard-coded.
- **Residual U-Net encoder.** Three scales, GroupNorm, SiLU. The raw inputs are also fed to the per-pixel depth decoder.
- **More inputs.** Longitude, an ocean mask, seafloor depth and sin/cos of day-of-year were added. The ocean mask and seafloor depth come from the grid's own fill cells.
- **Masked training loss.** MSE on ocean cells only, plus a masked penalty on temperature inversions below 30 m.
- **Training recipe.** Random 48×64 crops, input noise, an EMA of the weights, AdamW with warmup and a cosine schedule, 400 epochs.

### 3. Learned SST skip connection → 0.601 °C (no gain)
- **Change:** each depth adds `slope_d × SST anomaly`, with the slope initialised from a regression on the training data.
- **Why no gain:** the slope shrank during training from 0.92 to 0.68 near the surface. Predictions then stayed ~0.5 °C too cold on the test days, which are warmer than any training day.

### 4. Dropped day-of-year → 0.585 °C
- **Change:** removed the day-of-year input (`--no_doy`).
- **Why:** with one 60-day season it acts as a date index and cannot extrapolate beyond the training dates.

### 5. Fixed SST slope and de-meaned SST input → **0.514 °C** (shipped)
- **Fixed slope.** The SST slope is now a fixed buffer set from the training data, not a learned weight.
- **De-meaned SST for the CNN.** The CNN gets SST minus its basin mean for that day (`--sst_demean`). Basin-wide warming then reaches the output only through the fixed slope.
- **Result:** overall bias fell from −0.24 to −0.02 °C. Surface RMSE fell from 0.69 to 0.42 °C.

| Step | Test RMSE | Bias |
|---|---|---|
| Original model (as reported: all cells, random split) | 0.214 °C* | — |
| Original model, honest evaluation | 0.650 °C | −0.21 °C |
| + architecture / training fixes | 0.595 °C | −0.32 °C |
| + learned SST skip | 0.601 °C | −0.26 °C |
| + no day-of-year | 0.585 °C | −0.24 °C |
| **+ fixed SST slope, de-meaned SST** | **0.514 °C** | **−0.02 °C** |

\*Not comparable: included land cells, and the validation days had effectively been seen in training.

**Still open:** the SIH target of < 0.5 °C is not met yet. Most of the remaining error is in the thermocline, 0.63–0.76 °C at 50–150 m. The test set is only 12 days from one season, so the most useful next step is extending `dataset.nc` beyond 60 days.

### Serving and frontend
- **`/api/v1/profile` added.** It snaps the requested point to the nearest ocean cell and runs the model on the full grid with that day's real satellite inputs. The old endpoint fed a zero-padded 1×1 input the model never saw in training. The response includes the GLORYS12 truth and a per-depth uncertainty (the test RMSE).
- **Experimental live inputs (`source=live`).** `/api/v1/profile?source=live` and `/reconstruct` with `"source": "live"` replace SST, currents and winds with current Open-Meteo readings (`model/live_feed.py`). Open-Meteo has no salinity or sea level, so those stay at the latest archive day. Every response carries per-field `lineage` (source, date, live flag), and live responses drop the GLORYS truth and carry a `warning`. Open-Meteo is not one of the training sources and the model has only seen Feb–Mar 2024, so treat live output as indicative. Explorer and Reconstruction have an Archive / Live toggle.
- **Frontend screens use the live model.** Explorer, Ocean Dive, Reconstruction and Truth Check use the model and real inputs when the API is up, and fall back to the physics engine when it is not. Truth Check now compares against GLORYS12 instead of a simulated float.

---

## Validation, Uncertainty and Derived Products

These implement the "quick win" features from the solution document (`OceanEmbed_Solution_Document.pdf`, section 5).

### A4. Validation against real ARGO floats
`scripts/fetch_argo.py` downloads every ARGO profile in the domain for Feb–Mar 2024 from the Ifremer ERDDAP server (no login), keeps QC flags 1–2 and interpolates each profile to the 15 standard depths: **101 profiles from 19 floats**, 95 of them delayed-mode. `model/argo_eval.py` matches each profile to the nearest ocean cell on the same UTC day and scores four predictors. On the **17 profiles from held-out test days**:

| Predictor | RMSE vs ARGO | RMSE 50–200 m |
|---|---|---|
| **OceanEmbed ensemble** | **0.783 °C** | **1.147 °C** |
| GLORYS12 (the training target) | 0.776 °C | 1.141 °C |
| Climatology (per-pixel training mean) | 1.029 °C | 1.372 °C |
| Persistence (last training day) | 1.128 °C | 1.646 °C |

The model is **24% better than climatology** on real floats (16% in the 50–200 m thermocline) and within 0.01 °C of the reanalysis it learns from. Part of every predictor's error is representativeness: ARGO measures a point, the grid is a 0.25° average. Truth Check lets you pick any float by WMO ID and compare its profile with the model's 90% interval and GLORYS.

### A3. Calibrated uncertainty
The ensemble spread is scaled per depth on the validation days (`model/ensemble/calibration.json`) so that the mean ± 1.645σ interval should hold 90% of values. On held-out test days it holds **87%** of GLORYS values but only **63%** of ARGO values: the model's σ describes its error against the gridded reanalysis, not the extra point-versus-cell mismatch. The σ is shown in Ocean Dive, Truth Check and as a map layer.

### A2. Physics-informed loss
Masked MSE (land and below-seafloor excluded), a penalty on temperature inversions below 30 m, and a penalty on the second difference of the error along depth.

### A5. What drives each depth
Input ablation on the test days (replace one channel with its training mean, measure the RMSE rise). SST controls the mixed layer (+0.7 °C at 0–10 m), sea-level anomaly controls the thermocline (+1.0 °C at 75–100 m), and salinity and currents matter at 75–150 m. Removing either wind component changes nothing, so the model does not use the winds at all. Shown as a heatmap in the AI Engine view.

### B1. Cyclone heat potential and D26 · B4. Sound speed and sonic layer
`model/products.py` derives, per profile and per grid cell: mixed-layer depth (ΔT = 0.5 °C), depth of the 26 °C isotherm, tropical cyclone heat potential (ρ·c<sub>p</sub>·∫(T − 26) dz, kJ/cm²), Mackenzie (1981) sound speed and the sonic layer depth. Salinity below the surface is not reconstructed, so sound speed uses an assumed profile (SSS in the mixed layer, relaxing to 35 PSU below). `GET /api/v1/products?var=tchp|d26|mld|sld|sigma100` serves daily maps, shown as an overlay in Ocean Map; Ocean Dive shows the per-profile values and a sound-speed view.

### C3. Daily bulletin
`GET /api/v1/bulletin?date=` returns a printable page (browser Print → PDF) with the day's TCHP hotspot, the share of ocean above the 50 and 90 kJ/cm² thresholds, four maps and the ARGO skill line. Linked from the navbar.

### Not yet done
Self-supervised pre-training (A1), subsurface marine heatwaves (B2), fishing-zone advisories (B3), the near-real-time forecast (C1), the cyclone case study and the Phase 0 data re-download all need multi-year data, cyclone tracks, chlorophyll or Copernicus/Earthdata credentials. The cyclone track, heatwave zones and two Intelligence indicators (heat anomaly, stratification) are still simulated.

---

## Tech Stack

- **Frontend & Mapping:** React 18 · TypeScript · Vite · Leaflet · Tailwind CSS · Recharts · Lucide Icons
- **3D Visualization:** Three.js · `@react-three/fiber` · `@react-three/drei`
- **Data Pipeline:** Python 3 · `xarray` · `NumPy` · `netCDF4` · `requests`
- **Data Sources:** Copernicus Marine Service · NASA PO.DAAC · ARGO GDAC · INCOIS

---

## Why This Matters

- **Cyclone intensification** is driven by upper ocean heat content — forecast models need accurate subsurface temperatures, not just SST.
- **ARGO coverage** is sparse (~3,000 floats globally). OceanEmbed bridges spatial and temporal gaps continuously.
- **Near Real-time** — satellite observations are delivered daily, whereas physical ARGO floats take 10 days per profiling cycle.

---

<div align="center">
  <sub>Built with 🌊 for Ocean Science & Disaster Management · OceanEmbed © 2026</sub>
</div>
