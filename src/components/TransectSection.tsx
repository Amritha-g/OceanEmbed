import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { fetchTransectFigure, TransectResponse } from '../utils/api';

type Mode = 'model' | 'truth' | 'diff' | 'sigma';
type RGB = [number, number, number];

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
// RdYlBu_r (temperature), RdBu_r (difference), Blues (uncertainty); same families as the server figure
const THERMAL = ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'].map(hex);
const DIVERGING = ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'].map(hex);
const SEQUENTIAL = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'].map(hex);
const GROUND: RGB = [58, 64, 74];
const BG = '#050b14';

const MODES: Record<Mode, { label: string; units: string; ramp: RGB[] }> = {
  model: { label: 'Model', units: '°C', ramp: THERMAL },
  truth: { label: 'GLORYS12', units: '°C', ramp: THERMAL },
  diff: { label: 'Model − GLORYS', units: '°C', ramp: DIVERGING },
  sigma: { label: 'Uncertainty ±1σ', units: '°C', ramp: SEQUENTIAL },
};

function rampAt(ramp: RGB[], f: number): RGB {
  const x = Math.min(1, Math.max(0, f)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const t = x - i;
  return [0, 1, 2].map((c) => Math.round(ramp[i][c] + t * (ramp[i + 1][c] - ramp[i][c]))) as RGB;
}

const css = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;
const M = { left: 52, right: 66, top: 26, bottom: 34 };

/** Value at depth z in column k, linear between standard levels; null below the seafloor or on land. */
function at(field: Array<Array<number | null>>, depths: number[], k: number, z: number): number | null {
  let l = 0;
  while (l < depths.length - 2 && depths[l + 1] < z) l++;
  const a = field[l][k];
  const b = field[l + 1][k];
  if (z <= depths[l]) return a;
  if (a === null || b === null) return null;
  return a + ((z - depths[l]) / (depths[l + 1] - depths[l])) * (b - a);
}

/** Depth of the first crossing of `c` going down column k (temperature falls with depth). */
function crossing(field: Array<Array<number | null>>, depths: number[], k: number, c: number): number | null {
  for (let l = 1; l < depths.length; l++) {
    const a = field[l - 1][k];
    const b = field[l][k];
    if (a === null || b === null) return null;
    if (a >= c && b < c) return depths[l - 1] + ((a - c) / (a - b)) * (depths[l] - depths[l - 1]);
  }
  return null;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  data: TransectResponse;
  onHover?: (index: number | null) => void;
  onClose: () => void;
}

export const TransectSection: React.FC<Props> = ({ data, onHover, onClose }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 260 });
  const [mode, setMode] = useState<Mode>('model');
  const [maxDepth, setMaxDepth] = useState<300 | 1000>(1000);
  const [hover, setHover] = useState<{ x: number; y: number; k: number; z: number } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const depths = data.depths_m;
  const N = data.distance_km.length;
  const hasTruth = data.truth.some((r) => r.some((v) => v !== null));

  const field = useMemo(() => {
    if (mode === 'model') return data.model;
    if (mode === 'truth') return data.truth;
    if (mode === 'sigma') return data.sigma;
    return data.model.map((row, d) => row.map((v, k) => (v === null || data.truth[d][k] === null ? null : v - (data.truth[d][k] as number))));
  }, [data, mode]);

  const range = useMemo<[number, number]>(() => {
    const vals = field.flat().filter((v): v is number => v !== null);
    if (!vals.length) return [0, 1];
    if (mode === 'diff') {
      const s = [...vals].map(Math.abs).sort((a, b) => a - b);
      const span = Math.max(0.5, s[Math.floor(0.98 * (s.length - 1))]);
      return [-span, span];
    }
    if (mode === 'sigma') return [0, Math.max(...vals)];
    return [Math.floor(Math.min(...vals)), Math.ceil(Math.max(...vals))];
  }, [field, mode]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(320, e.contentRect.width), h: Math.max(200, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pw = size.w - M.left - M.right;
  const ph = size.h - M.top - M.bottom;
  const zToY = (z: number) => M.top + (Math.sqrt(Math.max(0, z)) / Math.sqrt(maxDepth)) * ph;
  const yToZ = (y: number) => (((y - M.top) / ph) * Math.sqrt(maxDepth)) ** 2;
  const kToX = (k: number) => M.left + (N > 1 ? k / (N - 1) : 0.5) * pw;
  const dToX = (d: number) => M.left + (d / Math.max(1e-6, data.summary.length_km)) * pw;

  // Field raster at device resolution; cached so hovering only redraws the overlays
  const fieldImage = useMemo(() => {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(pw * dpr);
    const H = Math.round(ph * dpr);
    if (W <= 0 || H <= 0) return null;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    if (!octx) return null;
    const img = octx.createImageData(W, H);
    const [lo, hi] = range;
    const ramp = MODES[mode].ramp;
    const rowZ = Array.from({ length: H }, (_, r) => ((r + 0.5) / H * Math.sqrt(maxDepth)) ** 2);
    for (let c = 0; c < W; c++) {
      const k = Math.round((c / Math.max(1, W - 1)) * (N - 1));
      for (let r = 0; r < H; r++) {
        const v = at(field, depths, k, rowZ[r]);
        const rgb = v === null ? GROUND : rampAt(ramp, (v - lo) / (hi - lo || 1));
        const p = (r * W + c) * 4;
        img.data[p] = rgb[0];
        img.data[p + 1] = rgb[1];
        img.data[p + 2] = rgb[2];
        img.data[p + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return off;
  }, [pw, ph, field, range, mode, maxDepth, N, depths]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const [lo, hi] = range;
    const ramp = MODES[mode].ramp;
    if (fieldImage) ctx.drawImage(fieldImage, Math.round(M.left * dpr), Math.round(M.top * dpr));
    ctx.scale(dpr, dpr);

    ctx.save();
    ctx.beginPath();
    ctx.rect(M.left, M.top, pw, ph);
    ctx.clip();
    const polyline = (depthAt: (k: number) => number | null, style: string, width: number, dash: number[] = []) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let open = false;
      for (let k = 0; k < N; k++) {
        const z = depthAt(k);
        if (z === null || z > maxDepth) {
          open = false;
          continue;
        }
        if (open) ctx.lineTo(kToX(k), zToY(z));
        else ctx.moveTo(kToX(k), zToY(z));
        open = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    // Isotherms every 2 °C, the 26 °C isotherm and the mixed layer on temperature views
    if (mode === 'model' || mode === 'truth') {
      for (let c = Math.ceil(lo / 2) * 2; c < hi; c += 2) {
        if (c !== 26) polyline((k) => crossing(field, depths, k, c), 'rgba(0,0,0,0.45)', 0.7);
      }
      polyline((k) => crossing(field, depths, k, 26), '#000', 2);
      if (mode === 'model') polyline((k) => data.mld_m[k], '#ffffff', 1.4, [5, 4]);
    }
    // Interior waypoints
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([2, 3]);
    data.waypoint_distance_km.slice(1, -1).forEach((d) => {
      ctx.beginPath();
      ctx.moveTo(dToX(d), M.top);
      ctx.lineTo(dToX(d), M.top + ph);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    if (hover) {
      ctx.strokeStyle = 'rgba(0,240,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(kToX(hover.k), M.top);
      ctx.lineTo(kToX(hover.k), M.top + ph);
      ctx.moveTo(M.left, hover.y);
      ctx.lineTo(M.left + pw, hover.y);
      ctx.stroke();
    }
    ctx.restore();

    // Axes
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = '#334155';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.strokeRect(M.left, M.top, pw, ph);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    let lastY = -Infinity;
    depths.filter((z) => z <= maxDepth).forEach((z) => {
      if (zToY(z) - lastY >= 11) {
        ctx.fillText(String(z), M.left - 6, zToY(z));
        lastY = zToY(z);
      }
      ctx.beginPath();
      ctx.moveTo(M.left - 3, zToY(z));
      ctx.lineTo(M.left, zToY(z));
      ctx.stroke();
    });
    ctx.save();
    ctx.translate(12, M.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Depth (m, √ scale)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const L = data.summary.length_km;
    const step = [25, 50, 100, 200, 250, 500, 1000].find((s) => L / s <= Math.max(3, pw / 90)) ?? 1000;
    for (let d = 0; d <= L + 1e-6; d += step) {
      ctx.fillText(String(d), dToX(d), M.top + ph + 5);
      ctx.beginPath();
      ctx.moveTo(dToX(d), M.top + ph);
      ctx.lineTo(dToX(d), M.top + ph + 3);
      ctx.stroke();
    }
    ctx.fillText('Distance along transect (km)', M.left + pw / 2, M.top + ph + 19);
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    ctx.fillText('A', M.left, 7);
    ctx.textAlign = 'right';
    ctx.fillText('B', M.left + pw, 7);
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${MODES[mode].label} (${MODES[mode].units}) · OceanEmbed · ${data.date}`, M.left + pw / 2, 8);
    if (mode === 'model' || mode === 'truth') {
      // Line legend, bottom-right inside the plot
      const lx = M.left + pw - 150;
      const ly = M.top + ph - 14;
      ctx.fillStyle = 'rgba(5,11,20,0.75)';
      ctx.fillRect(lx - 6, ly - 8, 152, 16);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 16, ly); ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('26 °C', lx + 20, ly);
      if (mode === 'model') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(lx + 64, ly); ctx.lineTo(lx + 80, ly); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText('MLD', lx + 84, ly);
      }
    }

    // Colour bar
    const cbX = M.left + pw + 14;
    for (let y = 0; y < ph; y++) {
      ctx.fillStyle = css(rampAt(ramp, 1 - y / ph));
      ctx.fillRect(cbX, M.top + y, 10, 1);
    }
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach((f) => {
      const v = hi - f * (hi - lo);
      ctx.fillText(v.toFixed(Math.abs(hi - lo) < 4 ? 1 : 0), cbX + 14, M.top + f * ph);
    });
  }, [size, fieldImage, field, range, mode, maxDepth, hover, data]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < M.left || x > M.left + pw || y < M.top || y > M.top + ph) {
      setHover(null);
      onHover?.(null);
      return;
    }
    const k = Math.round(((x - M.left) / pw) * (N - 1));
    setHover({ x, y, k, z: yToZ(y) });
    onHover?.(k);
  };

  const onLeave = () => {
    setHover(null);
    onHover?.(null);
  };

  const base = `oceanembed_transect_${data.date}`;
  const downloadPng = () => canvasRef.current?.toBlob((b) => b && saveBlob(b, `${base}_${mode}.png`));
  const downloadCsv = () => {
    const head = ['distance_km', 'lat', 'lon', ...depths.map((z) => `${mode}_${z}m`), 'mld_m', 'd26_m', 'tchp_kj_cm2'];
    const rows = data.distance_km.map((d, k) => [d, data.lat[k], data.lon[k], ...depths.map((_, l) => field[l][k]),
      data.mld_m[k], data.d26_m[k], data.tchp_kj_cm2[k]].map((v) => (v === null ? '' : typeof v === 'number' ? +v.toFixed(3) : v)).join(','));
    saveBlob(new Blob([[head.join(','), ...rows].join('\n')], { type: 'text/csv' }), `${base}_${mode}.csv`);
  };
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      saveBlob(await fetchTransectFigure(data.waypoints, 'pdf', N, data.date), `${base}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setPdfBusy(false);
    }
  };

  const hv = hover ? at(field, depths, hover.k, hover.z) : null;
  const s = data.summary;
  const btn = 'flex items-center gap-1 px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors';

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-cyan-500/15">
        <span className="text-cyan-300 font-bold tracking-wider">CROSS-SECTION</span>
        <span className="text-slate-400">
          {s.length_km.toFixed(0)} km · {s.n_ocean}/{N} ocean samples
          {s.d26_mean !== null && ` · D26 ${s.d26_mean} m`}
          {s.mld_mean !== null && ` · MLD ${s.mld_mean} m`}
          {s.tchp_max !== null && ` · TCHP max ${s.tchp_max}`}
          {s.rmse_vs_glorys !== null && ` · RMSE vs GLORYS ${s.rmse_vs_glorys} °C`}
        </span>
        <div className="flex gap-1 ml-auto">
          {(Object.keys(MODES) as Mode[]).filter((m) => hasTruth || (m !== 'truth' && m !== 'diff')).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded-md border transition-colors ${mode === m ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300' : 'border-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              {MODES[m].label}
            </button>
          ))}
          <button onClick={() => setMaxDepth(maxDepth === 1000 ? 300 : 1000)} className={btn} title="Toggle depth range">
            0–{maxDepth} m
          </button>
          <button onClick={downloadPng} className={btn} title="Save this view as PNG"><Download className="w-3 h-3" />PNG</button>
          <button onClick={downloadCsv} className={btn} title="Save this view's values as CSV"><Download className="w-3 h-3" />CSV</button>
          <button onClick={downloadPdf} className={btn} disabled={pdfBusy} title="Publication figure (model, departure from GLORYS, route)">
            {pdfBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}PDF
          </button>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10" title="Close section">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          className="absolute inset-0 cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        />
        {hover && (
          <div
            className="absolute pointer-events-none bg-[#050d1e]/95 border border-cyan-500/40 rounded-md px-2 py-1 text-slate-200 whitespace-nowrap"
            style={{ left: Math.min(hover.x + 12, size.w - 190), top: Math.max(4, hover.y - 58) }}
          >
            <div>{data.distance_km[hover.k].toFixed(0)} km · {data.lat[hover.k].toFixed(2)}°N {data.lon[hover.k].toFixed(2)}°E</div>
            <div>
              {hover.z.toFixed(0)} m:{' '}
              <b className="text-cyan-300">{hv === null ? (data.ocean[hover.k] ? 'below seafloor' : 'land / outside domain') : `${hv.toFixed(2)} ${MODES[mode].units}`}</b>
            </div>
            {data.mld_m[hover.k] !== null && (
              <div className="text-slate-400">MLD {data.mld_m[hover.k]} m · D26 {data.d26_m[hover.k] ?? '—'} m</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
