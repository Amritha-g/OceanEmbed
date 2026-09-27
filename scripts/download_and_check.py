import os
import sys
import glob
import dotenv
import xarray as xr
import copernicusmarine

dotenv.load_dotenv()

USERNAME = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME") or os.environ.get("COPERNICUS_USERNAME")
PASSWORD = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD") or os.environ.get("COPERNICUS_PASSWORD")

RAW_DATA_DIR = os.path.join("data", "raw")
os.makedirs(RAW_DATA_DIR, exist_ok=True)

# Fixed Schema Parameters
MIN_LAT, MAX_LAT = 8.0, 22.0
MIN_LON, MAX_LON = 80.0, 100.0
START_DATE = "2024-02-01"
END_DATE = "2024-03-31"

TARGET_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

def execute_download():
    if not USERNAME or USERNAME == "your_username_here" or not PASSWORD or PASSWORD == "your_password_here":
        print("[ERROR] Credentials not set in .env file.")
        print("Please configure COPERNICUSMARINE_SERVICE_USERNAME and COPERNICUSMARINE_SERVICE_PASSWORD in .env")
        sys.exit(1)

    print("==================================================")
    print(" DOWNLOADING COPERNICUS MARINE DATASETS           ")
    print("==================================================")
    print(f"Region: {MIN_LAT}°N-{MAX_LAT}°N, {MIN_LON}°E-{MAX_LON}°E")
    print(f"Dates : {START_DATE} to {END_DATE}")

    # 1. GLORYS Temperature (3D thetao)
    print("\n[1/3] Downloading GLORYS Subsurface Temperature (thetao)...")
    copernicusmarine.subset(
        dataset_id="cmems_mod_glo_phy_my_0.083deg_P1D-m",
        variables=["thetao"],
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        start_datetime=START_DATE,
        end_datetime=END_DATE,
        minimum_depth=min(TARGET_DEPTHS),
        maximum_depth=max(TARGET_DEPTHS),
        output_filename="glorys_temperature.nc",
        output_directory=RAW_DATA_DIR,
        username=USERNAME,
        password=PASSWORD,
    )

    # 2. OSTIA SST
    print("\n[2/3] Downloading OSTIA Sea Surface Temperature (analysed_sst)...")
    copernicusmarine.subset(
        dataset_id="METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2",
        variables=["analysed_sst"],
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        start_datetime=START_DATE,
        end_datetime=END_DATE,
        output_filename="ostia_sst.nc",
        output_directory=RAW_DATA_DIR,
        username=USERNAME,
        password=PASSWORD,
    )

    # 3. DUACS SSH / SLA
    print("\n[3/3] Downloading DUACS Sea Surface Height (sla, adt)...")
    copernicusmarine.subset(
        dataset_id="cmems_obs-sl_glo_phy-ssh_nrt_allsat-l4-duacs-0.25deg_P1D",
        variables=["sla", "adt"],
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        start_datetime=START_DATE,
        end_datetime=END_DATE,
        output_filename="duacs_ssh.nc",
        output_directory=RAW_DATA_DIR,
        username=USERNAME,
        password=PASSWORD,
    )

    print("\n==================================================")
    print(" DOWNLOAD COMPLETED. RUNNING SANITY CHECKS...     ")
    print("==================================================")
    run_sanity_checks()

def run_sanity_checks():
    nc_files = glob.glob(os.path.join(RAW_DATA_DIR, "*.nc"))
    if not nc_files:
        print("[WARNING] No NetCDF files found in data/raw/")
        return

    print(f"\nFiles downloaded in {RAW_DATA_DIR}:")
    for filepath in sorted(nc_files):
        size_mb = os.path.getsize(filepath) / (1024 * 1024)
        print(f"\n📁 File: {os.path.basename(filepath)} ({size_mb:.2f} MB)")
        
        try:
            ds = xr.open_dataset(filepath)
            print(f"   Dimensions: {dict(ds.sizes)}")
            print(f"   Data Variables: {list(ds.data_vars.keys())}")
            
            # Print coordinate ranges
            for coord in ['time', 'latitude', 'lat', 'longitude', 'lon', 'depth']:
                if coord in ds.coords:
                    vals = ds.coords[coord].values
                    print(f"   Coord [{coord}]: {vals[0]} to {vals[-1]} (len: {len(vals)})")
            
            # Print sample stats for variables
            for var in ds.data_vars:
                da = ds[var]
                nan_count = int(da.isnull().sum().values)
                total_count = da.size
                valid_count = total_count - nan_count
                min_val = float(da.min(skipna=True).values)
                max_val = float(da.max(skipna=True).values)
                mean_val = float(da.mean(skipna=True).values)
                
                print(f"   Variable [{var}]:")
                print(f"     - Shape: {da.shape}")
                print(f"     - Min: {min_val:.4f}, Max: {max_val:.4f}, Mean: {mean_val:.4f}")
                print(f"     - Valid Grid Points: {valid_count}/{total_count} ({nan_count} NaNs for land mask)")
                print(f"     - Sample value at center: {float(da.values.flat[total_count//2]):.4f}")
        except Exception as e:
            print(f"   [ERROR reading file]: {e}")
        print("--------------------------------------------------")

if __name__ == "__main__":
    execute_download()
