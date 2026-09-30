"""
Vertical cross-sections (depth vs distance) along a polyline.

sample_path spaces N points evenly by distance along the waypoints; serve.py reads the day's
reconstructed grid at the nearest 0.25° cell of each point. render() draws the section the way
oceanographers publish it: filled temperature with isotherms, the 26 °C isotherm and mixed-layer
depth marked, the model's departure from GLORYS12 below it, and a locator map.

Depth is drawn on a square-root axis so the upper ocean, where most of the structure is, is not
squeezed into the top tenth of the plot.
"""

from __future__ import annotations

import io

import numpy as np
from matplotlib.colors import TwoSlopeNorm
from matplotlib.figure import Figure
from matplotlib.scale import FuncScale

EARTH_KM = 6371.0
FINE_Z = np.arange(0.0, 1001.0, 2.0)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def sample_path(lats, lons, n: int):
    """n points evenly spaced by distance along the polyline -> (lat, lon, dist_km, waypoint_dist_km)."""
    lats, lons = np.asarray(lats, float), np.asarray(lons, float)
    seg = haversine_km(lats[:-1], lons[:-1], lats[1:], lons[1:])
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    dist = np.linspace(0.0, cum[-1], n)
    # Linear in lat/lon within a segment; at basin scale this is within a few km of the great circle
    return np.interp(dist, cum, lats), np.interp(dist, cum, lons), dist, cum


def _fine(values: np.ndarray, depths) -> np.ndarray:
    """(D, N) on standard levels -> (len(FINE_Z), N), linear in depth, NaN below the last valid level."""
    z = np.asarray(depths, float)
    out = np.full((FINE_Z.size, values.shape[1]), np.nan)
    for c in range(values.shape[1]):
        ok = np.isfinite(values[:, c])
        if ok.sum() < 2:
            continue
        zc, vc = z[ok], values[ok, c]
        keep = FINE_Z <= zc[-1]
        out[keep, c] = np.interp(FINE_Z[keep], zc, vc)
    return out


def _arr(rows) -> np.ndarray:
    return np.array([[np.nan if v is None else v for v in r] for r in rows], dtype=float)


def _depth_axis(ax, top: float, bottom: float, depths):
    ax.set_yscale(FuncScale(ax.yaxis, (lambda z: np.sqrt(np.clip(z, 0, None)), lambda s: s ** 2)))
    ax.set_ylim(bottom, top)
    ax.set_yticks([z for z in depths if top <= z <= bottom])
    ax.set_ylabel("Depth (m)")
    ax.set_facecolor("#5b5b5b")  # below the seafloor and land read as solid ground


def render(p: dict, fmt: str, ocean_mask: np.ndarray, lat, lon) -> bytes:
    """Publication-style figure of a transect payload (from serve.py) as PNG or PDF bytes."""
    depths = p["depths_m"]
    dist = np.asarray(p["distance_km"])
    T = _arr(p["model"])
    diff = _arr(p["model"]) - _arr(p["truth"])
    Tf, Df = _fine(T, depths), _fine(diff, depths)

    fig = Figure(figsize=(11.69, 8.27), layout="constrained")  # A4 landscape
    gs = fig.add_gridspec(2, 2, width_ratios=[3.2, 1], height_ratios=[1.6, 1])
    ax_t = fig.add_subplot(gs[0, 0])
    ax_d = fig.add_subplot(gs[1, 0], sharex=ax_t)
    ax_m = fig.add_subplot(gs[0, 1])
    ax_s = fig.add_subplot(gs[1, 1])

    finite = Tf[np.isfinite(Tf)]
    lo, hi = (np.floor(finite.min()), np.ceil(finite.max())) if finite.size else (0, 30)
    mesh = ax_t.pcolormesh(dist, FINE_Z, Tf, cmap="RdYlBu_r", vmin=lo, vmax=hi, shading="nearest",
                         rasterized=True)
    if finite.size and dist.size > 1:
        levels = np.arange(np.ceil(lo / 2) * 2, hi, 2)
        cs = ax_t.contour(dist, FINE_Z, Tf, levels=levels, colors="k", linewidths=0.4, alpha=0.6)
        ax_t.clabel(cs, fmt="%g", fontsize=6, inline=True)
        if lo < 26 < hi:
            ax_t.contour(dist, FINE_Z, Tf, levels=[26], colors="k", linewidths=1.6)
    mld = np.array([np.nan if v is None else v for v in p["mld_m"]], float)
    ax_t.plot(dist, mld, color="white", lw=1.4, ls="--", label="Mixed-layer depth")
    ax_t.plot([], [], color="k", lw=1.6, label="26 °C isotherm")
    for w in p["waypoint_distance_km"][1:-1]:
        ax_t.axvline(w, color="k", lw=0.6, ls=":")
    _depth_axis(ax_t, 0, 1000, depths)
    ax_t.legend(loc="lower right", fontsize=7, framealpha=0.85)
    ax_t.set_title(f"Reconstructed temperature (°C) · OceanEmbed ensemble mean · {p['date']}", fontsize=10, loc="left")
    fig.colorbar(mesh, ax=ax_t, label="°C", pad=0.01)

    if np.isfinite(Df).any():
        span = max(0.5, float(np.nanpercentile(np.abs(Df), 98)))
        dm = ax_d.pcolormesh(dist, FINE_Z, Df, cmap="RdBu_r", shading="nearest",
                             norm=TwoSlopeNorm(0, -span, span), rasterized=True)
        fig.colorbar(dm, ax=ax_d, label="°C", pad=0.01)
        title = "Model − GLORYS12 reanalysis (°C)"
    else:
        title = "Model − GLORYS12: no reanalysis along this line"
    _depth_axis(ax_d, 0, 300, depths)
    ax_d.set_title(title + " · upper 300 m", fontsize=10, loc="left")
    ax_d.set_xlabel("Distance along transect (km)")
    ax_d.set_xlim(dist[0], dist[-1])

    ax_m.pcolormesh(lon, lat, np.where(ocean_mask, 1.0, 0.0), cmap="Greys_r", vmin=-0.6, vmax=1.4, shading="nearest",
                  rasterized=True)
    wlat, wlon = [w["lat"] for w in p["waypoints"]], [w["lng"] for w in p["waypoints"]]
    ax_m.plot(p["lon"], p["lat"], color="#d7301f", lw=1.5)
    ax_m.plot(wlon, wlat, "o", ms=3, color="#d7301f")
    ax_m.annotate("A", (wlon[0], wlat[0]), xytext=(3, 3), textcoords="offset points", fontsize=8, weight="bold")
    ax_m.annotate("B", (wlon[-1], wlat[-1]), xytext=(3, 3), textcoords="offset points", fontsize=8, weight="bold")
    ax_m.set_xlim(min(lon[0], min(wlon)) - 0.5, max(lon[-1], max(wlon)) + 0.5)
    ax_m.set_ylim(min(lat[0], min(wlat)) - 0.5, max(lat[-1], max(wlat)) + 0.5)
    ax_m.set_aspect(1 / np.cos(np.radians(np.mean(lat))))
    ax_m.set_title("Route (dark = land)", fontsize=9)
    ax_m.tick_params(labelsize=7)

    s = p["summary"]
    lines = [
        f"Length: {s['length_km']:.0f} km, {len(dist)} samples",
        f"Ocean samples: {s['n_ocean']} / {len(dist)}",
        f"Surface T: {s['sst_min']} – {s['sst_max']} °C" if s["sst_min"] is not None else "Surface T: n/a",
        f"Mean MLD: {s['mld_mean']} m" if s["mld_mean"] is not None else "Mean MLD: n/a",
        f"Mean D26: {s['d26_mean']} m" if s["d26_mean"] is not None else "Mean D26: n/a",
        f"Max TCHP: {s['tchp_max']} kJ/cm²" if s["tchp_max"] is not None else "Max TCHP: n/a",
        f"RMSE vs GLORYS: {s['rmse_vs_glorys']} °C" if s["rmse_vs_glorys"] is not None else "RMSE vs GLORYS: n/a",
        f"Mean ±1σ: {s['sigma_mean']} °C" if s["sigma_mean"] is not None else "",
        "",
        "Nearest 0.25° cell per sample.",
        "Grey = land or below seafloor.",
        "Trained on Feb–Mar 2024 only.",
    ]
    ax_s.axis("off")
    ax_s.text(0, 1, "\n".join(lines), va="top", fontsize=8, family="monospace")

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, dpi=160 if fmt == "png" else 200)
    return buf.getvalue()
