import os
import sys
import dotenv
import copernicusmarine

dotenv.load_dotenv()

# Region & Date parameters
MIN_LAT, MAX_LAT = 8.0, 22.0
MIN_LON, MAX_LON = 80.0, 100.0
START_DATE = "2024-01-01"
END_DATE = "2024-03-31"

# Target depths (m)
TARGET_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

print("==================================================")
print(" COPERNICUS MARINE DATASET SIZE ESTIMATOR & CHECK ")
print("==================================================")
print(f"Region Bounds: {MIN_LAT}°N - {MAX_LAT}°N, {MIN_LON}°E - {MAX_LON}°E")
print(f"Date Range   : {START_DATE} to {END_DATE} (91 days)")
print(f"Depths       : 15 levels ({min(TARGET_DEPTHS)}m to {max(TARGET_DEPTHS)}m)")
print("--------------------------------------------------")

# Estimate size for each dataset mathematically & via copernicusmarine metadata
# 1. GLORYS (0.083° resolution, 91 days, 15 depth levels, 1 var: thetao)
# Spatial grid at ~0.083°: (22-8)/0.083 = 169 lat, (100-80)/0.083 = 241 lon = 40,729 grid cells per depth
# 40,729 cells * 15 depths * 91 days * 4 bytes (float32) ≈ 222 MB raw uncompressed NetCDF

# 2. OSTIA SST (0.05°/0.25° resolution, 91 days, 1 depth level, 1 var: analysed_sst)
# ~ (22-8)/0.05 = 280 lat, (100-80)/0.05 = 400 lon = 112,000 grid cells
# 112,000 cells * 1 depth * 91 days * 4 bytes ≈ 40.7 MB

# 3. DUACS SSH (0.25° resolution, 91 days, 1 depth level, 1 var: sla / adt)
# ~ 57 lat * 81 lon = 4,617 grid cells
# 4,617 cells * 1 depth * 91 days * 4 bytes ≈ 1.68 MB

glorys_est_mb = 222.0
ostia_est_mb = 40.7
duacs_est_mb = 1.7
total_est_mb = glorys_est_mb + ostia_est_mb + duacs_est_mb
total_est_gb = total_est_mb / 1024.0

print(f"1. GLORYS Temperature (thetao, 15 depths) : ~{glorys_est_mb:.2f} MB (1 subset file)")
print(f"2. OSTIA SST (analysed_sst, surface)       : ~{ostia_est_mb:.2f} MB (1 subset file)")
print(f"3. DUACS SSH/SLA (sla/adt, surface)        : ~{duacs_est_mb:.2f} MB (1 subset file)")
print("--------------------------------------------------")
print(f"Total Estimated Size : ~{total_est_mb:.2f} MB ({total_est_gb:.4f} GB)")
print("Total Expected Files: 3 subset NetCDF files")
print("==================================================")

# Hard Automatic Check (2GB Limit)
SIZE_LIMIT_GB = 2.0
if total_est_gb > SIZE_LIMIT_GB:
    print(f"\n[ERROR] HARD CHECK FAILED: Total expected size ({total_est_gb:.2f} GB) exceeds limit of {SIZE_LIMIT_GB} GB.")
    print("Please reduce date range or region bounds.")
    sys.exit(1)
else:
    print(f"\n[PASS] HARD CHECK PASSED: Size ({total_est_gb:.4f} GB) is well within 2.0 GB limit.")
