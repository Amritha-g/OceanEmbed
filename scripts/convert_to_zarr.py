"""
Utility to convert data/processed/dataset.nc to chunked cloud-native Zarr format (dataset.zarr).
"""

from pathlib import Path
import xarray as xr

ROOT = Path(__file__).resolve().parent.parent
NC_PATH = ROOT / "data" / "processed" / "dataset.nc"
ZARR_PATH = ROOT / "data" / "processed" / "dataset.zarr"

def convert():
    if not NC_PATH.exists():
        print(f"[Error] NetCDF dataset not found at {NC_PATH}")
        return

    print(f"Reading {NC_PATH} ...")
    ds = xr.open_dataset(NC_PATH)
    
    print(f"Writing Zarr store to {ZARR_PATH} ...")
    ds.to_zarr(ZARR_PATH, mode="w")
    print(f"Successfully created Zarr store at {ZARR_PATH}")

if __name__ == "__main__":
    convert()
