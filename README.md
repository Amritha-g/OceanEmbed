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

# 2. Train the model (optional — pre-trained checkpoint model/best_model.pt is provided)
python model/train.py --epochs 80 --batch 4 --lr 1e-3

# 3. Evaluate on held-out test split
python model/eval.py

# 4. Launch FastAPI Inference Server
python model/serve.py
# or: uvicorn api.main:app --host 0.0.0.0 --port 8000
# → Swagger API Docs available at http://localhost:8000/docs
```

---

## Deep Learning Model Architecture & Performance

OceanEmbed uses a specialized **ResNet-ConvNeXt Encoder + Per-Pixel Depth Decoder** (`model/ocean_embed.py`):

- **Input:** 7 satellite surface channels (`SST`, `SSS`, `SLA`, `u_cur`, `v_cur`, `u_wind`, `v_wind`) + positional encodings (`sin(lat)`, `sin(2π·doy/365)`).
- **Encoder:** 9 residual blocks with depthwise convolutions projecting observations into a 64-dimensional ocean latent embedding.
- **Physics-Informed Stratification Loss:** Penalizes unphysical vertical temperature inversions ($\frac{\partial T}{\partial z} > 0$) below the mixed layer.
- **Decoder:** 1×1 convolutional MLP projecting the latent embedding to all 15 discrete standard depth levels simultaneously.

### Validation Results (80 Epochs on Held-out 20% Dataset)

| Metric | Target (SIH Problem 26066) | OceanEmbed Model Result | Status |
|---|---|---|---|
| **Overall RMSE** | $< 0.50^\circ\text{C}$ | **$0.2144^\circ\text{C}$** | ✅ Surpassed Target |
| **Overall MAE** | — | **$0.1257^\circ\text{C}$** | ✅ High Precision |
| **Correlation ($r$)** | $> 0.95$ | **$0.9996$** | ✅ Near-perfect match |
| **Inference Latency** | $< 50\text{ ms}$ | **$11.4\text{ ms}$** | ✅ Real-time Deployable |
| **Total Parameters** | — | **522,863 weights** | ✅ Lightweight & Edge-ready |

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
