# OceanEmbed

> **Reconstructing the invisible ocean — surface to 1000 m — from satellite-only inputs.**

[![Status](https://img.shields.io/badge/status-active%20development-22d3ee?style=flat-square&labelColor=050b14)](https://github.com/Amritha-g/OceanEmbed)
[![Region](https://img.shields.io/badge/region-Bay%20of%20Bengal%20%7C%20Arabian%20Sea-0ea5e9?style=flat-square&labelColor=050b14)](.)
[![Resolution](https://img.shields.io/badge/resolution-0.25°%20daily-22d3ee?style=flat-square&labelColor=050b14)](.)
[![Depths](https://img.shields.io/badge/depths-15%20levels%20%7C%200–1000m-0ea5e9?style=flat-square&labelColor=050b14)](.)

---

## What is OceanEmbed?

The ocean's interior is largely invisible. Subsurface temperature profiles — critical for cyclone intensity forecasting, fishery management, and climate modeling — require expensive, sparse ARGO floats or research vessels. **OceanEmbed** bridges this gap by learning a mapping from freely available satellite observations to full-depth (0–1000 m) thermal profiles using deep learning.

This repository contains both the **data pipeline** (end-to-end, reproducible) and the **interactive visualization dashboard** for exploring model outputs across the North Indian Ocean.

---

## Key Features

| Feature | Description |
|---|---|
| 🌊 **Ocean Explorer** | Interactive 2D map of the Bay of Bengal & Arabian Sea — click any grid point to inspect surface variables |
| 🔬 **OceanDive** | Depth scrubber through all 15 standard levels (0–1000 m), synchronized with a real-time temperature profile chart |
| ✅ **Truth Check** | Side-by-side comparison of model predictions vs. ARGO in-situ observations, with RMSE / correlation metrics and error-mode toggle |
| 🧠 **Ocean Intelligence** | Derived physical indicators: marine heat anomaly, ocean heat content, stratification index, mixed-layer depth |
| 📡 **Proto Features** | Marine heatwave alert feed, cyclone overlay, ARGO float explorer, API/export panel, confidence uncertainty overlay *(Phase 2 roadmap)* |

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
Region     : 8°N – 22°N, 80°E – 100°E
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
│   │   ├── OceanExplorer.tsx   # Interactive map + proto overlays
│   │   ├── OceanDive.tsx       # Depth profile scrubber
│   │   ├── TruthCheck.tsx      # ARGO validation chart
│   │   ├── OceanIntelligence.tsx # Derived indicators
│   │   └── Sidebar.tsx
│   └── index.css               # Design system (glassmorphism, glows)
│
├── HANDOFF.md                  # Technical handoff for model training
└── README.md
```

---

## Quick Start

### Dashboard

```bash
npm install
npm run dev
# → http://localhost:3000
```

### Data Pipeline

```bash
# Requires: Copernicus Marine account + NASA Earthdata account

# Set credentials
echo "COPERNICUSMARINE_SERVICE_USERNAME=..." >> .env
echo "COPERNICUSMARINE_SERVICE_PASSWORD=..." >> .env
echo "machine urs.earthdata.nasa.gov login ... password ..." >> ~/.netrc

# Download & preprocess
python3 scripts/download_ccmp_winds.py
python3 scripts/preprocess.py
```

---

## Tech Stack

**Frontend:** React · TypeScript · Vite · Tailwind CSS · Recharts · Three.js (R3F)  
**Data Pipeline:** Python · xarray · NumPy · requests  
**Data Sources:** Copernicus Marine Service · NASA PO.DAAC · ARGO GDAC

---

## Roadmap

- [x] Data acquisition pipeline (SST, SSH, salinity, currents, winds, temperature)
- [x] Preprocessing & unified 0.25° dataset
- [x] Interactive visualization dashboard (5 modules)
- [ ] Model architecture (CNN / ConvLSTM / Transformer)
- [ ] Training & evaluation against held-out ARGO profiles
- [ ] Real-time inference API
- [ ] Extended multi-year training dataset

---

## Why This Matters

- **Cyclone intensification** is driven by upper ocean heat content — models need subsurface temperature, not just SST.
- **ARGO coverage** is sparse (~3000 floats globally). OceanEmbed fills gaps continuously.
- **Real-time** — satellite data is available daily; ARGO profiles take 10 days per cycle.

---

<div align="center">
  <sub>Built with 🌊 for ocean science · OceanEmbed © 2024</sub>
</div>
