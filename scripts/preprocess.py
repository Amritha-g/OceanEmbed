"""
OceanEmbed preprocessing pipeline
Inputs  : data/raw/{ostia_sst, duacs_ssh, glorys_salinity, glorys_currents, glorys_temperature}.nc
Output  : data/processed/dataset.nc
          Variables:
            X:  (time, lat, lon, 7)  — SST, SSS, SLA, U_cur, V_cur, U_wind(0), V_wind(0)
            Y:  (time, lat, lon, 15) — subsurface temperature at 15 standard depths

Schema:
  Region  : 8–22°N, 80–100°E
  Grid    : 0.25° × 0.25°
  Time    : 2024-02-01 – 2024-03-31 (60 days)
  Depths  : 0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000 m
"""

import numpy as np
import xarray as xr
from pathlib import Path

# ── paths ────────────────────────────────────────────────────────────────────
RAW   = Path("data/raw")
OUT   = Path("data/processed")
OUT.mkdir(parents=True, exist_ok=True)

# ── target grid ──────────────────────────────────────────────────────────────
TARGET_LATS = np.arange(8.0, 22.25, 0.25)   # 57 points
TARGET_LONS = np.arange(80.0, 100.25, 0.25) # 81 points
STD_DEPTHS  = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]


def regrid(da: xr.DataArray, lats, lons, method="linear") -> xr.DataArray:
    """Interpolate a (time, lat, lon) DataArray onto target grid."""
    # Normalise coord names
    rename = {}
    for old in ["latitude", "nav_lat"]:
        if old in da.dims:
            rename[old] = "lat"
    for old in ["longitude", "nav_lon"]:
        if old in da.dims:
            rename[old] = "lon"
    if rename:
        da = da.rename(rename)
    return da.interp(lat=lats, lon=lons, method=method)


def load_sst():
    """OSTIA SST → (time, lat, lon), Kelvin→Celsius."""
    ds = xr.open_dataset(RAW / "ostia_sst.nc")
    sst = ds["analysed_sst"].squeeze()
    sst = sst - 273.15  # K → °C
    sst.attrs["units"] = "degC"
    return regrid(sst, TARGET_LATS, TARGET_LONS)


def load_ssh():
    """DUACS SLA → (time, lat, lon)."""
    ds = xr.open_dataset(RAW / "duacs_ssh.nc")
    sla = ds["sla"].squeeze()
    return regrid(sla, TARGET_LATS, TARGET_LONS)


def load_salinity():
    """GLORYS surface salinity → (time, lat, lon)."""
    ds = xr.open_dataset(RAW / "glorys_salinity.nc")
    sal = ds["so"].isel(depth=0).squeeze()
    return regrid(sal, TARGET_LATS, TARGET_LONS)


def load_currents():
    """GLORYS surface U/V currents → two (time, lat, lon) arrays."""
    ds = xr.open_dataset(RAW / "glorys_currents.nc")
    uo = ds["uo"].isel(depth=0).squeeze()
    vo = ds["vo"].isel(depth=0).squeeze()
    return regrid(uo, TARGET_LATS, TARGET_LONS), regrid(vo, TARGET_LATS, TARGET_LONS)


def load_temperature():
    """GLORYS temperature at 15 std depths → (time, depth15, lat, lon)."""
    ds = xr.open_dataset(RAW / "glorys_temperature.nc")
    temp = ds["thetao"]
    # Select nearest available depth for each standard level
    layers = []
    for d in STD_DEPTHS:
        nearest = temp.sel(depth=d, method="nearest")
        layers.append(nearest)
    temp15 = xr.concat(layers, dim="depth")
    temp15["depth"] = STD_DEPTHS
    # Regrid lat/lon
    regridded = regrid(temp15, TARGET_LATS, TARGET_LONS)
    return regridded  # (time, depth, lat, lon)


# ── main ─────────────────────────────────────────────────────────────────────
print("Loading SST …")
sst = load_sst()
print("Loading SSH …")
sla = load_ssh()
print("Loading salinity …")
sss = load_salinity()
print("Loading currents …")
uo, vo = load_currents()
print("Loading subsurface temperature …")
temp15 = load_temperature()

# Align time axes (all should be identical after loading)
time = sst.time

print("Loading CCMP winds …")
ds_wind = xr.open_dataset(RAW / "ccmp_winds.nc")
# Regrid from CCMP 0.25° grid (lat: 8-22, lon: 80-100) to target grid
wind_u = regrid(ds_wind["uwnd"], TARGET_LATS, TARGET_LONS)
wind_v = regrid(ds_wind["vwnd"], TARGET_LATS, TARGET_LONS)

print("Assembling X …")
X_vars = xr.Dataset({
    "sst":    sst.reindex(time=time),
    "sss":    sss.reindex(time=time),
    "sla":    sla.reindex(time=time),
    "u_cur":  uo.reindex(time=time),
    "v_cur":  vo.reindex(time=time),
    "u_wind": wind_u.reindex(time=time),
    "v_wind": wind_v.reindex(time=time),
})

# Stack to array (time, lat, lon, 7)
X_stack = np.stack(
    [X_vars[v].values for v in ["sst","sss","sla","u_cur","v_cur","u_wind","v_wind"]],
    axis=-1,
)  # shape: (60, 57, 81, 7)

print("Assembling Y …")
# temp15 shape: (time, depth, lat, lon) → (time, lat, lon, 15)
Y_stack = temp15.values  # raw shape: either (depth,time,lat,lon) or (time,depth,lat,lon)

print("X shape:", X_stack.shape)
# temp15 shape after concat: (depth, time, lat, lon) — fix → (time, lat, lon, depth)
if Y_stack.ndim == 4:
    # could be (depth,time,lat,lon) or (time,depth,lat,lon) — detect by matching axis-0 to depth count
    if Y_stack.shape[0] == len(STD_DEPTHS):
        Y_stack = Y_stack.transpose(1, 2, 3, 0)  # (time, lat, lon, 15)
    else:
        Y_stack = Y_stack.transpose(0, 2, 3, 1)  # (time, lat, lon, 15)
print("Y shape:", Y_stack.shape)  # expect (60, 57, 81, 15)

# ── sanity checks ────────────────────────────────────────────────────────────
print("\n── Sanity checks ──")
print(f"X NaNs: {np.isnan(X_stack).sum()} / {X_stack.size}")
print(f"Y NaNs: {np.isnan(Y_stack).sum()} / {Y_stack.size}")

# Fill remaining NaNs (coastal/land) with column/spatial mean
def fill_nan(arr):
    """Fill NaNs with the mean of non-NaN values along the last axis."""
    mask = np.isnan(arr)
    if mask.any():
        means = np.nanmean(arr, axis=(0,1,2), keepdims=True)
        arr = np.where(mask, means, arr)
    return arr

X_stack = fill_nan(X_stack)
Y_stack = fill_nan(Y_stack)
print(f"After fill — X NaNs: {np.isnan(X_stack).sum()}, Y NaNs: {np.isnan(Y_stack).sum()}")

# Physical range checks
sst_vals = X_stack[..., 0]
print(f"SST range: {sst_vals.min():.2f} – {sst_vals.max():.2f} °C  (expect ~20–32)")
sss_vals = X_stack[..., 1]
print(f"SSS range: {sss_vals.min():.2f} – {sss_vals.max():.2f} PSU  (expect ~30–37)")
sla_vals = X_stack[..., 2]
print(f"SLA range: {sla_vals.min():.4f} – {sla_vals.max():.4f} m    (expect ~±0.5)")
print(f"Temp@0m range: {Y_stack[...,0].min():.2f} – {Y_stack[...,0].max():.2f} °C")
print(f"Temp@1000m range: {Y_stack[...,-1].min():.2f} – {Y_stack[...,-1].max():.2f} °C")

# ── save ─────────────────────────────────────────────────────────────────────
print("\nSaving dataset.nc …")
ds_out = xr.Dataset(
    {
        "X": (["time","lat","lon","feature"], X_stack.astype(np.float32)),
        "Y": (["time","lat","lon","depth"],   Y_stack.astype(np.float32)),
    },
    coords={
        "time":    time.values,
        "lat":     TARGET_LATS,
        "lon":     TARGET_LONS,
        "feature": ["sst","sss","sla","u_cur","v_cur","u_wind","v_wind"],
        "depth":   STD_DEPTHS,
    },
)
ds_out.attrs["description"] = "OceanEmbed preprocessed dataset — inputs and targets on 0.25-deg grid"
ds_out.attrs["region"]  = "8-22N, 80-100E"
ds_out.attrs["period"]  = "2024-02-01 to 2024-03-31"
ds_out.to_netcdf(OUT / "dataset.nc")
print(f"Saved → {OUT}/dataset.nc")
print("Done.")
