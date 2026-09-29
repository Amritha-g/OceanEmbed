"""
Operational bulletins.

render()        Daily domain bulletin (HTML; the browser's Print → Save as PDF produces the PDF).
                Summarises the day's reconstructed cyclone heat potential, 26 °C isotherm depth,
                mixed layer and sonic layer over the domain, with inline SVG maps and the ARGO benchmark.
render_point()  One-page A4 bulletin for a single location and day (PDF or PNG, matplotlib):
                the reconstructed profile with its uncertainty and GLORYS12, derived products,
                surface inputs with their sources, a locator map and the model's skill.
"""

from __future__ import annotations

import html
import io
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from matplotlib.figure import Figure
from matplotlib.patches import Rectangle
from matplotlib.scale import FuncScale

from model.products import TCHP_HIGH, TCHP_WATCH

# Sequential ramp (low → high), readable on white paper
RAMP = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#fdae61", "#f46d43", "#d73027", "#a50026"]


def _color(v: float, lo: float, hi: float) -> str:
    f = 0.0 if hi <= lo else min(1.0, max(0.0, (v - lo) / (hi - lo)))
    return RAMP[min(len(RAMP) - 1, int(f * len(RAMP)))]


def _svg_map(values: np.ndarray, lat, lon, lo: float, hi: float, units: str) -> str:
    """Heatmap as one SVG path per colour, merging horizontal runs of equal colour (north up)."""
    H, W = values.shape
    paths: dict[str, list[str]] = {}
    for i in range(H):
        y = H - 1 - i
        row = ["#d9d9d9" if not np.isfinite(v) else _color(v, lo, hi) for v in values[i]]
        j = 0
        while j < W:
            k = j
            while k + 1 < W and row[k + 1] == row[j]:
                k += 1
            paths.setdefault(row[j], []).append(f"M{j} {y}h{k - j + 1}v1h-{k - j + 1}z")
            j = k + 1
    body = "".join(f'<path fill="{c}" d="{"".join(d)}"/>' for c, d in paths.items())
    legend = "".join(
        f'<rect x="{k * 28}" y="0" width="28" height="10" fill="{c}"/>' for k, c in enumerate(RAMP))
    return (
        f'<svg viewBox="0 0 {W} {H}" width="100%" shape-rendering="crispEdges" role="img">{body}</svg>'
        f'<div class="legend"><svg width="{28 * len(RAMP)}" height="10">{legend}</svg>'
        f'<span>{lo:g} – {hi:g} {html.escape(units)} · grey = land · '
        f'{lat[0]:g}–{lat[-1]:g}°N, {lon[0]:g}–{lon[-1]:g}°E</span></div>'
    )


def _stat(v: np.ndarray, fn) -> Optional[float]:
    f = v[np.isfinite(v)]
    return round(float(fn(f)), 1) if f.size else None


def render(date: str, grids: dict, lat, lon, metrics: Optional[dict]) -> str:
    tchp, d26, mld, sld = grids["tchp"], grids["d26"], grids["mld"], grids["sld"]
    ocean = np.isfinite(mld)
    n_ocean = max(1, int(ocean.sum()))
    watch = float((np.nan_to_num(tchp) >= TCHP_WATCH).sum()) / n_ocean * 100
    high = float((np.nan_to_num(tchp) >= TCHP_HIGH).sum()) / n_ocean * 100
    k = int(np.nanargmax(tchp)) if np.isfinite(tchp).any() else None
    hotspot = ""
    if k is not None:
        i, j = np.unravel_index(k, tchp.shape)
        hotspot = f"{lat[i]:.2f}°N, {lon[j]:.2f}°E ({tchp[i, j]:.0f} kJ/cm²)"

    rows = [
        ("Cyclone heat potential (TCHP)", f"{_stat(tchp, np.mean)} kJ/cm² mean, {_stat(tchp, np.max)} max",
         f"{watch:.0f}% of ocean ≥ {TCHP_WATCH:g}, {high:.0f}% ≥ {TCHP_HIGH:g} kJ/cm²"),
        ("26 °C isotherm depth (D26)", f"{_stat(d26, np.mean)} m mean", f"deepest {_stat(d26, np.max)} m"),
        ("Mixed-layer depth", f"{_stat(mld, np.mean)} m mean", f"range {_stat(mld, np.min)}–{_stat(mld, np.max)} m"),
        ("Sonic layer depth", f"{_stat(sld, np.mean)} m mean", "salinity below the surface is assumed"),
    ]
    table = "".join(f"<tr><th>{html.escape(a)}</th><td>{html.escape(b)}</td><td>{html.escape(c)}</td></tr>"
                    for a, b, c in rows)

    skill = ""
    argo = (metrics or {}).get("argo")
    if argo:
        o = argo["overall"]
        skill = (
            f"<p>Validated against {argo['n_profiles']} real ARGO profiles from {argo['n_floats']} floats. "
            f"On held-out days the RMSE vs ARGO is <b>{o['model']['rmse']:.2f} °C</b>, against "
            f"{o['climatology']['rmse']:.2f} °C for climatology and {o['glorys']['rmse']:.2f} °C for the "
            f"GLORYS12 reanalysis the model is trained on.</p>")

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>OceanEmbed bulletin {html.escape(date)}</title>
<style>
  body {{ font: 14px/1.5 system-ui, sans-serif; color: #1a1a1a; background: #fff; max-width: 900px; margin: 24px auto; padding: 0 16px; }}
  h1 {{ font-size: 22px; margin: 0 0 4px; }} h2 {{ font-size: 16px; margin: 24px 0 8px; border-bottom: 1px solid #ccc; }}
  .sub {{ color: #555; margin: 0 0 16px; }}
  table {{ border-collapse: collapse; width: 100%; }} th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }}
  th {{ width: 32%; }} .maps {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .legend {{ display: flex; gap: 8px; align-items: center; font-size: 11px; color: #555; margin-top: 4px; flex-wrap: wrap; }}
  .note {{ font-size: 12px; color: #555; }} .alert {{ background: #fff4e5; border-left: 4px solid #d73027; padding: 8px 12px; }}
  @media (max-width: 640px) {{ .maps {{ grid-template-columns: 1fr; }} }}
  @media print {{ body {{ margin: 0; }} .noprint {{ display: none; }} }}
</style></head><body>
<h1>OceanEmbed daily ocean bulletin</h1>
<p class="sub">Bay of Bengal and Andaman Sea, {html.escape(date)} · reconstructed from satellite surface data
<button class="noprint" onclick="window.print()">Print / save as PDF</button></p>
<div class="alert">Highest cyclone heat potential: <b>{html.escape(hotspot or "n/a")}</b>.
{watch:.0f}% of the ocean area is above the {TCHP_WATCH:g} kJ/cm² intensification watch level.</div>
<h2>Summary</h2><table>{table}</table>
<h2>Maps</h2>
<div class="maps">
  <div><b>Cyclone heat potential (kJ/cm²)</b>{_svg_map(tchp, lat, lon, 0, 120, "kJ/cm²")}</div>
  <div><b>Mixed-layer depth (m)</b>{_svg_map(mld, lat, lon, 0, 80, "m")}</div>
  <div><b>26 °C isotherm depth (m)</b>{_svg_map(d26, lat, lon, 0, 150, "m")}</div>
  <div><b>Sonic layer depth (m)</b>{_svg_map(sld, lat, lon, 0, 100, "m")}</div>
</div>
<h2>Model skill</h2>{skill or '<p class="note">ARGO benchmark not available; run scripts/fetch_argo.py and model/eval.py.</p>'}
<p class="note">Thresholds are common indicators, not official advisories. The model has been trained on
Feb–Mar 2024 only; treat other seasons as indicative. Sonic layer depth uses an assumed salinity profile.</p>
</body></html>"""


Z90 = 1.645  # half-width of the 90% band in units of the calibrated σ


def _alert(tchp: Optional[float]) -> tuple[str, str]:
    if tchp is None:
        return "NO DATA", "#777777"
    if tchp >= TCHP_HIGH:
        return "HIGH", "#a50026"
    if tchp >= TCHP_WATCH:
        return "WATCH", "#f46d43"
    return "NORMAL", "#2171b5"


def _fmt(v, nd=1, unit=""):
    return "n/a" if v is None else f"{v:.{nd}f}{unit}"


def render_point(p: dict, fmt: str, metrics: Optional[dict], tchp_grid: np.ndarray, lat, lon) -> bytes:
    """One-page bulletin for a profile payload from serve.py, as PNG or PDF bytes."""
    depths = np.asarray(p["depths_m"], float)
    valid = np.asarray(p["valid_depths"], bool)
    T = np.where(valid, np.asarray(p["temperatures"], float), np.nan)
    sig = np.where(valid, np.asarray(p["uncertainty_c"] or [np.nan] * len(depths), float), np.nan)
    truth = np.array([np.nan if v is None else v for v in (p["truth"] or [None] * len(depths))], float)
    prod = p["products"]
    level, colour = _alert(prod["tchp_kj_cm2"])
    s = p["surface"]
    where = f"{s['lat']:.2f}°N, {s['lng']:.2f}°E"

    fig = Figure(figsize=(8.27, 11.69))  # A4 portrait
    fig.text(0.06, 0.965, "OceanEmbed point bulletin", fontsize=17, weight="bold")
    fig.text(0.06, 0.945, f"{where} · {p['date']} · subsurface temperature reconstructed from satellite surface data",
             fontsize=9, color="#444")
    snap = p.get("grid_point")
    fig.text(0.06, 0.93, (f"Nearest 0.25° ocean cell, {snap['snap_km']} km from the requested point"
                          if snap else "Outside the model domain: surface values are climatological, treat as indicative"),
             fontsize=8, color="#666")
    fig.patches.append(Rectangle(
        (0.06, 0.885), 0.88, 0.035, transform=fig.transFigure, color=colour, alpha=0.12, zorder=0))
    fig.text(0.075, 0.897, f"Cyclone heat potential: {level}", fontsize=12, weight="bold", color=colour)
    fig.text(0.47, 0.897, f"TCHP {_fmt(prod['tchp_kj_cm2'], 0, ' kJ/cm²')} "
             f"(watch ≥ {TCHP_WATCH:g}, high ≥ {TCHP_HIGH:g})", fontsize=9, color="#333")

    # Profile
    ax = fig.add_axes([0.08, 0.46, 0.48, 0.40])
    ok = np.isfinite(T)
    ax.fill_betweenx(depths[ok], (T - Z90 * sig)[ok], (T + Z90 * sig)[ok], color="#6baed6", alpha=0.25,
                     lw=0, label="90% interval")
    ax.fill_betweenx(depths[ok], (T - sig)[ok], (T + sig)[ok], color="#2171b5", alpha=0.3, lw=0, label="±1σ")
    ax.plot(T[ok], depths[ok], "-o", color="#08306b", ms=3, lw=1.8, label="OceanEmbed")
    if np.isfinite(truth).any():
        ax.plot(truth, depths, "--s", color="#d73027", ms=2.5, lw=1.2, label="GLORYS12")
    ax.axvline(26, color="#999", lw=0.8, ls=":")
    for key, name, c in (("mld_m", "MLD", "#238b45"), ("d26_m", "D26", "#d94801"), ("sld_m", "SLD", "#6a51a3")):
        if prod.get(key) is not None:
            ax.axhline(prod[key], color=c, lw=1, ls="-.")
            ax.text(1.0, prod[key], f" {name} {prod[key]:.0f} m", transform=ax.get_yaxis_transform(),
                    color=c, fontsize=7, va="center")
    ax.set_yscale(FuncScale(ax.yaxis, (lambda z: np.sqrt(np.clip(z, 0, None)), lambda v: v ** 2)))
    bottom = float(depths[ok][-1]) if ok.any() else 1000.0
    ax.set_ylim(bottom, 0)
    ax.set_yticks([z for z in depths if z <= bottom])
    ax.tick_params(labelsize=7)
    ax.set_xlabel("Temperature (°C)")
    ax.set_ylabel("Depth (m, square-root scale)")
    ax.grid(alpha=0.3)
    ax.legend(loc="lower right", fontsize=7)
    ax.set_title("Reconstructed temperature profile", fontsize=10, loc="left")

    # Locator map with the day's TCHP
    axm = fig.add_axes([0.66, 0.66, 0.30, 0.20])
    axm.pcolormesh(lon, lat, np.ma.masked_invalid(tchp_grid), cmap="YlOrRd", vmin=0, vmax=120, shading="nearest",
                   rasterized=True)
    axm.set_facecolor("#cccccc")
    axm.plot(s["lng"], s["lat"], marker="*", ms=12, mec="k", mfc="#00e5ff")
    axm.set_xlim(min(lon[0], s["lng"]) - 0.5, max(lon[-1], s["lng"]) + 0.5)
    axm.set_ylim(min(lat[0], s["lat"]) - 0.5, max(lat[-1], s["lat"]) + 0.5)
    axm.set_aspect(1 / np.cos(np.radians(np.mean(lat))))
    axm.tick_params(labelsize=6)
    axm.set_title("TCHP today (kJ/cm², grey = land)", fontsize=8)

    lines = [
        ("Mixed-layer depth", _fmt(prod["mld_m"], 0, " m")),
        ("26 °C isotherm", _fmt(prod["d26_m"], 0, " m")),
        ("Heat potential", _fmt(prod["tchp_kj_cm2"], 0, " kJ/cm²")),
        ("Sonic layer", _fmt(prod["sld_m"], 0, " m")),
        ("Seafloor (model)", f"{p['seafloor_depth_m']} m" if p.get("seafloor_depth_m") else "n/a"),
    ]
    fig.text(0.66, 0.635, "Derived products", fontsize=10, weight="bold")
    for k, (a, b) in enumerate(lines):
        fig.text(0.66, 0.61 - k * 0.02, a, fontsize=8, color="#444")
        fig.text(0.96, 0.61 - k * 0.02, b, fontsize=8, ha="right", weight="bold")

    inputs = [("SST", s["sst"], "°C", "sst"), ("SSS", s["sss"], "PSU", "sss"), ("SLA", s["sla"], "m", "sla"),
              ("Current", float(np.hypot(s["u_cur"], s["v_cur"])), "m/s", "u_cur"),
              ("Wind", float(np.hypot(s["u_wind"], s["v_wind"])), "m/s", "u_wind")]
    fig.text(0.66, 0.49, "Surface inputs", fontsize=10, weight="bold")
    for k, (a, v, u, f) in enumerate(inputs):
        src = (p.get("lineage") or {}).get(f, {}).get("source", "")
        y = 0.465 - k * 0.026
        fig.text(0.66, y, a, fontsize=8, color="#444")
        fig.text(0.96, y, f"{v:.2f} {u}", fontsize=8, ha="right", weight="bold")
        fig.text(0.66, y - 0.011, src, fontsize=6, color="#888")

    # Table by depth
    rows = []
    for k, z in enumerate(depths):
        if not valid[k]:
            continue
        rows.append([f"{z:.0f}", f"{T[k]:.2f}", f"±{sig[k]:.2f}" if np.isfinite(sig[k]) else "",
                     f"{truth[k]:.2f}" if np.isfinite(truth[k]) else "—",
                     f"{T[k] - truth[k]:+.2f}" if np.isfinite(truth[k]) else "—"])
    axt = fig.add_axes([0.08, 0.10, 0.84, 0.24])
    axt.axis("off")
    half = (len(rows) + 1) // 2
    cols = ["Depth m", "Model °C", "σ °C", "GLORYS °C", "Diff °C"]
    h = 1 / (half + 1)
    for c, chunk in enumerate((rows[:half], rows[half:])):
        if not chunk:
            continue
        tb = axt.table(cellText=chunk, colLabels=cols, loc="upper left", cellLoc="right",
                       bbox=[c * 0.52, 1 - h * (len(chunk) + 1), 0.48, h * (len(chunk) + 1)])
        tb.auto_set_font_size(False)
        tb.set_fontsize(7)
        for (r, _), cell in tb.get_celld().items():
            cell.set_edgecolor("#dddddd")
            if r == 0:
                cell.set_text_props(weight="bold")
                cell.set_facecolor("#f0f0f0")

    argo = (metrics or {}).get("argo")
    skill = "ARGO benchmark not available."
    if argo:
        o = argo["overall"]
        skill = (f"Skill: RMSE vs {argo['n_profiles']} real ARGO profiles is {o['model']['rmse']:.2f} °C "
                 f"(climatology {o['climatology']['rmse']:.2f} °C, GLORYS12 {o['glorys']['rmse']:.2f} °C).")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    fig.text(0.06, 0.075, skill, fontsize=7.5, color="#333")
    fig.text(0.06, 0.035, "Bands are the calibrated ensemble spread. Thresholds are common indicators, not official "
             "advisories.\nTrained on Feb–Mar 2024 only; other seasons are indicative. Sonic layer depth assumes a "
             "salinity profile\n(SSS in the mixed layer, 35 PSU below).", fontsize=7, color="#666", linespacing=1.4)
    fig.text(0.94, 0.02, f"Generated {stamp} · OceanEmbed", fontsize=6.5, color="#999", ha="right")

    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, dpi=150 if fmt == "png" else 200)
    return buf.getvalue()
