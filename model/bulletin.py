"""
Printable daily ocean bulletin (HTML; the browser's Print → Save as PDF produces the PDF).

Summarises the day's reconstructed cyclone heat potential, 26 °C isotherm depth, mixed layer
and sonic layer over the domain, with inline SVG maps and the model's ARGO benchmark.
"""

from __future__ import annotations

import html
from typing import Optional

import numpy as np

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
