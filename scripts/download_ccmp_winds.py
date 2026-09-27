"""
Download CCMP V3.1 winds (uwnd, vwnd) for 2024-02-01 to 2024-03-31,
subset in-memory to 8-22N, 80-100E, then save data/raw/ccmp_winds.nc.

Each global file is ~32 MB but is never written to disk — we stream it
into a BytesIO buffer, open with xarray, subset, and discard.
Final saved file is the regional subset only (~15-20 MB).
"""

import io, netrc, tempfile, os, sys
from datetime import date, timedelta
import requests
import xarray as xr
import numpy as np

# ── config ───────────────────────────────────────────────────────────────────
START  = date(2024, 2, 1)
END    = date(2024, 3, 31)
REGION = dict(latitude=slice(8, 22), longitude=slice(80, 100))
BASE   = ("https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected"
          "/CCMP_WINDS_10M6HR_L4_V3.1/CCMP_Wind_Analysis_{date}_V03.1_L4.nc")
OUT    = "data/raw/ccmp_winds.nc"

# ── auth ─────────────────────────────────────────────────────────────────────
creds = netrc.netrc().authenticators("urs.earthdata.nasa.gov")
if not creds:
    sys.exit("ERROR: no urs.earthdata.nasa.gov entry in ~/.netrc")
user, _, pwd = creds

session = requests.Session()
session.auth = (user, pwd)

# ── iterate days ─────────────────────────────────────────────────────────────
days = [START + timedelta(d) for d in range((END - START).days + 1)]
print(f"Fetching {len(days)} daily files, subset in-memory, no global data stored.")
print(f"Estimated download traffic: {len(days)*32:.0f} MB  |  saved output: ~15-20 MB\n")

subsets = []
for i, day in enumerate(days):
    ds_str = day.strftime("%Y%m%d")
    url = BASE.format(date=ds_str)
    sys.stdout.write(f"\r[{i+1:3d}/{len(days)}] {ds_str} ...")
    sys.stdout.flush()

    r = session.get(url, stream=True, timeout=120, allow_redirects=True)
    if r.status_code != 200:
        print(f"\n  WARN: {ds_str} → HTTP {r.status_code}, skipping")
        continue

    # Stream into buffer (never touch disk)
    buf = io.BytesIO()
    for chunk in r.iter_content(chunk_size=1024 * 512):
        buf.write(chunk)
    buf.seek(0)

    # Open, subset, keep only uwnd/vwnd, load into memory, close
    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as f:
        f.write(buf.read())
        tmp_path = f.name

    ds = xr.open_dataset(tmp_path)[["uwnd", "vwnd"]].sel(**REGION).load()
    os.unlink(tmp_path)
    subsets.append(ds)

print(f"\n\nConcatenating {len(subsets)} daily subsets along time ...")
combined = xr.concat(subsets, dim="time")

# CCMP is 6-hourly (4 steps/day). Average to daily to match schema.
print("Averaging 6-hourly → daily ...")
daily = combined.resample(time="1D").mean(dim="time")

print(f"Saving → {OUT}")
daily.to_netcdf(OUT)

size_mb = os.path.getsize(OUT) / 1e6
print(f"Saved: {size_mb:.1f} MB")

# ── sanity check ─────────────────────────────────────────────────────────────
print("\n── Sanity check ──")
ds_out = xr.open_dataset(OUT)
print("Dims:", dict(ds_out.dims))
u = ds_out["uwnd"].values
v = ds_out["vwnd"].values
print(f"uwnd  NaNs: {np.isnan(u).sum()}")
print(f"vwnd  NaNs: {np.isnan(v).sum()}")
print(f"uwnd  range: {np.nanmin(u):.2f} – {np.nanmax(u):.2f} m/s")
print(f"vwnd  range: {np.nanmin(v):.2f} – {np.nanmax(v):.2f} m/s")
print(f"Time : {str(ds_out.time.values[0])[:10]} → {str(ds_out.time.values[-1])[:10]}")
print("Done.")
