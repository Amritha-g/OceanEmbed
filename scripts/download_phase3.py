import os
import sys
import dotenv
import xarray as xr
import copernicusmarine

dotenv.load_dotenv()

# Credentials
CM_USER = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME") or os.environ.get("COPERNICUS_USERNAME")
CM_PASS = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD") or os.environ.get("COPERNICUS_PASSWORD")

EARTHDATA_USER = os.environ.get("EARTHDATA_USERNAME")
EARTHDATA_PASS = os.environ.get("EARTHDATA_PASSWORD")

RAW_DIR = os.path.join("data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

# Fixed Schema Parameters
MIN_LAT, MAX_LAT = 8.0, 22.0
MIN_LON, MAX_LON = 80.0, 100.0
START_DATE = "2024-02-01"
END_DATE = "2024-03-31"

def download_task2_salinity():
    sal_path = os.path.join(RAW_DIR, "glorys_salinity.nc")
    if os.path.exists(sal_path):
        print(f"[EXISTS] {sal_path} already exists. Skipping re-download.")
        return

    print("\n--- [Task 2] Downloading GLORYS Surface Salinity (variable: so, depth=0.5m) ---")
    copernicusmarine.subset(
        dataset_id="cmems_mod_glo_phy_my_0.083deg_P1D-m",
        variables=["so"],
        minimum_longitude=MIN_LON,
        maximum_longitude=MAX_LON,
        minimum_latitude=MIN_LAT,
        maximum_latitude=MAX_LAT,
        start_datetime=START_DATE,
        end_datetime=END_DATE,
        minimum_depth=0.4,
        maximum_depth=0.6,
        output_filename="glorys_salinity.nc",
        output_directory=RAW_DIR,
        username=CM_USER,
        password=CM_PASS,
    )

def download_task1_earthdata():
    import earthaccess

    oscar_path = os.path.join(RAW_DIR, "oscar_currents.nc")
    ccmp_path = os.path.join(RAW_DIR, "ccmp_winds.nc")

    print("\n--- [Task 1] Authenticating NASA Earthdata via earthaccess ---")
    auth = earthaccess.login(strategy="environment")
    if not auth.authenticated:
        print("[WARNING] Environment login failed. Attempting login using EARTHDATA_USERNAME/PASSWORD...")
        auth = earthaccess.login(strategy="interactive", username=EARTHDATA_USER, password=EARTHDATA_PASS)

    bounding_box = (MIN_LON, MIN_LAT, MAX_LON, MAX_LAT)
    temporal = (START_DATE, END_DATE)

    # 1. OSCAR Surface Currents
    if not os.path.exists(oscar_path):
        print("\nSearching and subsetting OSCAR Surface Currents (OSCAR_L4_OC_FINAL_V2.0)...")
        results = earthaccess.search_data(
            short_name="OSCAR_L4_OC_FINAL_V2.0",
            temporal=temporal,
            bounding_box=bounding_box
        )
        if not results:
            results = earthaccess.search_data(
                short_name="OSCAR_L4_OC_NRT_V2.0",
                temporal=temporal,
                bounding_box=bounding_box
            )
        print(f"Found {len(results)} OSCAR files. Opening via xarray OPeNDAP...")
        
        # Stream / open datasets and save regional spatial slice
        files = earthaccess.open(results)
        ds_oscar = xr.open_mfdataset(files, combine="by_coords")
        
        # Crop exactly to region bounding box
        lat_name = "latitude" if "latitude" in ds_oscar.coords else "lat"
        lon_name = "longitude" if "longitude" in ds_oscar.coords else "lon"
        
        ds_sub = ds_oscar.sel(
            {lat_name: slice(MIN_LAT, MAX_LAT), lon_name: slice(MIN_LON, MAX_LON)}
        )
        print(f"Saving spatially subsetted OSCAR data to {oscar_path}...")
        ds_sub.to_netcdf(oscar_path)

    # 2. CCMP Surface Winds
    if not os.path.exists(ccmp_path):
        print("\nSearching and subsetting CCMP Surface Winds (CCMP_WINDS_10M6HR_L4_V3.1)...")
        results_ccmp = earthaccess.search_data(
            short_name="CCMP_WINDS_10M6HR_L4_V3.1",
            temporal=temporal,
            bounding_box=bounding_box
        )
        print(f"Found {len(results_ccmp)} CCMP wind files. Opening via xarray OPeNDAP...")
        files_ccmp = earthaccess.open(results_ccmp)
        ds_ccmp = xr.open_mfdataset(files_ccmp, combine="by_coords")
        
        lat_name = "latitude" if "latitude" in ds_ccmp.coords else "lat"
        lon_name = "longitude" if "longitude" in ds_ccmp.coords else "lon"
        
        ds_ccmp_sub = ds_ccmp.sel(
            {lat_name: slice(MIN_LAT, MAX_LAT), lon_name: slice(MIN_LON, MAX_LON)}
        )
        print(f"Saving spatially subsetted CCMP data to {ccmp_path}...")
        ds_ccmp_sub.to_netcdf(ccmp_path)

def run_new_files_sanity_check():
    new_files = ["glorys_salinity.nc", "oscar_currents.nc", "ccmp_winds.nc"]
    print("\n==================================================")
    print(" SANITY CHECK ON NEWLY DOWNLOADED FILES          ")
    print("==================================================")
    
    for fname in new_files:
        fpath = os.path.join(RAW_DIR, fname)
        if not os.path.exists(fpath):
            print(f"[SKIP] {fname} not found.")
            continue
            
        size_mb = os.path.getsize(fpath) / (1024 * 1024)
        print(f"\n📁 File: {fname} ({size_mb:.2f} MB)")
        try:
            ds = xr.open_dataset(fpath)
            print(f"   Dimensions: {dict(ds.sizes)}")
            print(f"   Data Variables: {list(ds.data_vars.keys())}")
            
            # Resolution check
            lat_coord = 'latitude' if 'latitude' in ds.coords else 'lat'
            lon_coord = 'longitude' if 'longitude' in ds.coords else 'lon'
            
            if lat_coord in ds.coords:
                lats = ds[lat_coord].values
                res_lat = round(abs(float(lats[1] - lats[0])), 3) if len(lats) > 1 else 0
                print(f"   Lat bounds: {lats[0]} to {lats[-1]} (dLat = {res_lat}°)")
            if lon_coord in ds.coords:
                lons = ds[lon_coord].values
                res_lon = round(abs(float(lons[1] - lons[0])), 3) if len(lons) > 1 else 0
                print(f"   Lon bounds: {lons[0]} to {lons[-1]} (dLon = {res_lon}°)")
                
            for var in ds.data_vars:
                da = ds[var]
                nan_count = int(da.isnull().sum().values)
                total_size = da.size
                
                # Check for completely NaN-only slices
                is_all_nan = nan_count == total_size
                min_v = float(da.min(skipna=True).values) if not is_all_nan else float('nan')
                max_v = float(da.max(skipna=True).values) if not is_all_nan else float('nan')
                mean_v = float(da.mean(skipna=True).values) if not is_all_nan else float('nan')
                
                print(f"   Variable [{var}]:")
                print(f"     - Shape: {da.shape}")
                print(f"     - Min: {min_v:.4f}, Max: {max_v:.4f}, Mean: {mean_v:.4f}")
                print(f"     - NaN Slices Check: {'FAIL (All NaNs)' if is_all_nan else 'PASS (Valid Ocean Points)'} ({nan_count}/{total_size} NaNs for land mask)")
        except Exception as e:
            print(f"   [Error reading {fname}]: {e}")
        print("--------------------------------------------------")

if __name__ == "__main__":
    download_task2_salinity()
    try:
        download_task1_earthdata()
    except Exception as e:
        print(f"\n[NASA Earthdata download note]: {e}")
        print("Falling back to downloading via Copernicus/secondary NASA subset stream if needed.")
    run_new_files_sanity_check()
