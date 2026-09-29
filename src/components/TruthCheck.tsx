import React, { useMemo, useState } from 'react';
import { ArrowLeft, ShieldCheck, Info, CheckCircle2, Anchor } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import {
  ActiveRegion,
  REGION_CONFIGS,
  getDepthProfile,
  getPhysicalVariables,
} from '../utils/oceanPhysics';
import { useNeuralProfile } from '../hooks/useNeuralProfile';
import { useArgo } from '../hooks/useArgo';
import { ArgoPredictor } from '../utils/api';

interface TruthCheckProps {
  coordinates: { lat: number; lng: number };
  region?: ActiveRegion;
  onBackToExplorer: () => void;
  onNavigateTo?: (view: any, coords?: { lat: number; lng: number }) => void;
}

type ViewMode = 'comparison' | 'prediction' | 'truth' | 'error';
type TruthSource = 'argo' | 'glorys';

interface Row {
  depth: number;
  prediction: number;
  argo: number;
  error: number;
  lo?: number;
  hi?: number;
  glorys?: number;
}

const Z90 = 1.645;

function profileStats(rows: Row[]) {
  const n = Math.max(1, rows.length);
  const rmse = Math.sqrt(rows.reduce((a, d) => a + (d.prediction - d.argo) ** 2, 0) / n);
  const bias = rows.reduce((a, d) => a + (d.prediction - d.argo), 0) / n;
  const mp = rows.reduce((a, d) => a + d.prediction, 0) / n;
  const mt = rows.reduce((a, d) => a + d.argo, 0) / n;
  const cov = rows.reduce((a, d) => a + (d.prediction - mp) * (d.argo - mt), 0);
  const vp = rows.reduce((a, d) => a + (d.prediction - mp) ** 2, 0);
  const vt = rows.reduce((a, d) => a + (d.argo - mt) ** 2, 0);
  const inside = rows.filter((d) => d.lo !== undefined && d.argo >= d.lo && d.argo <= (d.hi as number)).length;
  return {
    rmse: rmse.toFixed(3),
    bias: `${bias >= 0 ? '+' : ''}${bias.toFixed(3)}`,
    corr: (cov / Math.sqrt(vp * vt || 1)).toFixed(4),
    coverage: rows.some((d) => d.lo !== undefined) ? `${Math.round((inside / n) * 100)}%` : '—',
  };
}

const PREDICTOR_LABELS: Record<ArgoPredictor, string> = {
  model: 'OceanEmbed',
  glorys: 'GLORYS12 (training target)',
  climatology: 'Climatology (train mean)',
  persistence: 'Persistence (last train day)',
};

export const TruthCheck: React.FC<TruthCheckProps> = ({
  coordinates,
  region = 'bob',
  onBackToExplorer,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('comparison');
  const [source, setSource] = useState<TruthSource>('argo');
  const [floatKey, setFloatKey] = useState<string>('');

  const regionData = REGION_CONFIGS[region];
  const simFloat = regionData.argoFloats[0];
  const activeVars = getPhysicalVariables(coordinates.lat, coordinates.lng, region);
  const rawProfile = getDepthProfile(coordinates.lat, coordinates.lng, region);
  const { result, status } = useNeuralProfile(coordinates.lat, coordinates.lng, region);
  const { profiles, summary, status: argoStatus } = useArgo();

  // Test-day profiles first: those are the ones the model never saw in training
  const floats = useMemo(
    () => [...profiles].sort((a, b) => (a.split === 'test' ? 0 : 1) - (b.split === 'test' ? 0 : 1) || a.time.localeCompare(b.time)),
    [profiles],
  );
  const selected = floats.find((p) => `${p.platform}-${p.cycle}` === floatKey) ?? floats[0];

  const argoMode = source === 'argo' && argoStatus === 'live' && !!selected;
  const glorysTruth = status === 'live' ? result?.truth : null;
  const glorysMode = !argoMode && !!glorysTruth && !!result;

  let rows: Row[];
  let truthLabel: string;
  if (argoMode) {
    rows = selected.depths_m.flatMap((depth, i) => {
      const a = selected.argo[i];
      const m = selected.model[i];
      if (a === null || m === null) return [];
      const s = selected.sigma[i] ?? 0;
      return [{
        depth, prediction: m, argo: a, error: Number(Math.abs(m - a).toFixed(3)),
        lo: Number((m - Z90 * s).toFixed(2)), hi: Number((m + Z90 * s).toFixed(2)),
        glorys: selected.glorys[i] ?? undefined,
      }];
    });
    truthLabel = `ARGO float ${selected.platform}`;
  } else if (glorysMode) {
    rows = result.depths_m.flatMap((depth, i) => {
      const t = glorysTruth[i];
      if (t === null) return [];
      const p = Number(result.temperatures[i].toFixed(2));
      const s = result.uncertainty_c?.[i] ?? 0;
      return [{
        depth, prediction: p, argo: t, error: Number(Math.abs(p - t).toFixed(3)),
        lo: Number((p - Z90 * s).toFixed(2)), hi: Number((p + Z90 * s).toFixed(2)),
      }];
    });
    truthLabel = 'GLORYS12 Reanalysis';
  } else {
    rows = rawProfile.map((pt) => ({ depth: pt.depth, prediction: pt.temp, argo: pt.argoTemp, error: pt.tempError }));
    truthLabel = `Simulated ARGO #${simFloat.id}`;
  }

  const stats = profileStats(rows);
  const metricsRow = [
    { label: 'RMSE', value: `${stats.rmse} °C` },
    { label: 'BIAS', value: `${stats.bias} °C` },
    { label: 'CORR (R)', value: stats.corr },
    { label: 'IN 90% INTERVAL', value: stats.coverage },
    argoMode
      ? { label: 'FLOAT (WMO)', value: `${selected.platform} · cycle ${selected.cycle}` }
      : glorysMode
        ? { label: 'SURFACE SST', value: `${result.surface.sst.toFixed(2)} °C` }
        : { label: 'SURFACE SST', value: `${activeVars.sst} °C` },
  ];

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'comparison', label: 'Comparison' },
    { id: 'prediction', label: 'Prediction' },
    { id: 'truth', label: 'Ground Truth' },
    { id: 'error', label: 'Residual Error' },
  ];

  const description = argoMode
    ? `OceanEmbed vs. real in-situ float ${selected.platform} (${selected.data_mode === 'D' ? 'delayed-mode QC' : 'real-time QC'}) at ${selected.lat.toFixed(2)}°N ${selected.lon.toFixed(2)}°E on ${selected.date}${selected.split === 'test' ? ' — a held-out test day' : ` — a ${selected.split} day (model saw GLORYS for it)`}`
    : glorysMode
      ? `OceanEmbed vs. GLORYS12 reanalysis at the nearest ocean cell (${result.date}, seafloor ≈ ${result.seafloor_depth_m} m)`
      : `Physics-engine profile vs. simulated float (start the API for real validation)`;

  const bench = summary?.test;

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-14 glass-panel border-b border-navy-border px-6 md:px-8 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-all bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Map Explorer</span>
          </button>
          <div className="h-4 w-px bg-navy-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">BASIN:</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
              {regionData.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#040c1a]/90 p-0.5 rounded-lg border border-navy-border text-[10px] font-mono">
            {([['argo', 'Real ARGO floats'], ['glorys', 'GLORYS at map point']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSource(id)}
                className={`px-2.5 py-1 rounded transition-all ${
                  source === id ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-accent/5 px-3 py-1 rounded-lg border border-accent/25 text-[10px] font-mono text-accent">
            <Info className="w-3 h-3 text-accent" />
            <span>{argoMode ? 'IN-SITU VALIDATION' : glorysMode ? 'REANALYSIS CHECK' : 'API OFFLINE · SIMULATED'}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
        {/* Control bar */}
        <div className="glass-card border border-navy-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-lg glass-card border border-cyan-500/30 text-cyan-300 shadow-glow-sm">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-heading">Truth Check & Validation Analysis</h2>
              <p className="text-[11px] text-text-muted">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {argoMode && (
              <label className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                <Anchor className="w-3 h-3 text-cyan-400" />
                <select
                  value={`${selected.platform}-${selected.cycle}`}
                  onChange={(e) => setFloatKey(e.target.value)}
                  className="bg-navy-deep border border-navy-border rounded-lg px-2 py-1 text-[11px] text-text-body"
                >
                  {floats.map((p) => (
                    <option key={`${p.platform}-${p.cycle}`} value={`${p.platform}-${p.cycle}`}>
                      {p.split === 'test' ? '★ ' : ''}WMO {p.platform} · {p.date} · {p.lat.toFixed(1)}°N {p.lon.toFixed(1)}°E
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex bg-navy-deep/80 p-0.5 rounded-xl border border-navy-border text-xs font-mono gap-0.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === m.id
                      ? m.id === 'error'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold'
                        : 'bg-accent/12 text-accent border border-accent/25 shadow-glow-sm font-bold'
                      : 'text-text-body hover:text-text-heading'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="shrink-0 glass-card border border-navy-border rounded-xl p-5 flex flex-col">
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} layout="vertical" margin={{ top: 5, right: 30, left: 15, bottom: 10 }}>
                <XAxis
                  type="number"
                  domain={viewMode === 'error' ? [0, 'auto'] : ['auto', 'auto']}
                  unit={viewMode === 'error' ? ' Δ°C' : '°C'}
                  stroke="#334155"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="depth"
                  reversed
                  domain={[0, 1000]}
                  unit="m"
                  stroke="#334155"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Row;
                    return (
                      <div className="bg-navy-deep/95 border border-navy-border p-3 rounded-lg text-xs font-mono shadow-glow-sm space-y-1">
                        <div className="text-accent font-bold">Depth: {d.depth} m</div>
                        {(viewMode === 'comparison' || viewMode === 'prediction') && (
                          <div className="text-cyan-300">
                            OceanEmbed: {d.prediction.toFixed(2)} °C
                            {d.lo !== undefined && ` (90%: ${d.lo}–${d.hi})`}
                          </div>
                        )}
                        {(viewMode === 'comparison' || viewMode === 'truth') && (
                          <div className="text-slate-300">{truthLabel}: {d.argo} °C</div>
                        )}
                        {d.glorys !== undefined && viewMode === 'comparison' && (
                          <div className="text-violet-300">GLORYS12: {d.glorys} °C</div>
                        )}
                        {viewMode === 'error' && <div className="text-amber-400">|Error|: {d.error} °C</div>}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: 8, fontFamily: 'Inter', fontSize: 11, color: '#94a3b8' }} />
                {(viewMode === 'comparison' || viewMode === 'prediction') && (
                  <Line name="OceanEmbed" type="monotone" dataKey="prediction" stroke="#22d3ee" strokeWidth={2.5}
                    dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }} />
                )}
                {(viewMode === 'comparison' || viewMode === 'prediction') && rows.some((r) => r.lo !== undefined) && (
                  <Line name="90% interval" type="monotone" dataKey="lo" stroke="#22d3ee" strokeOpacity={0.45}
                    strokeDasharray="2 3" dot={false} />
                )}
                {(viewMode === 'comparison' || viewMode === 'prediction') && rows.some((r) => r.hi !== undefined) && (
                  <Line name=" " legendType="none" type="monotone" dataKey="hi" stroke="#22d3ee" strokeOpacity={0.45}
                    strokeDasharray="2 3" dot={false} />
                )}
                {(viewMode === 'comparison' || viewMode === 'truth') && (
                  <Line name={truthLabel} type="monotone" dataKey="argo" stroke="#f8fafc" strokeDasharray="5 4"
                    strokeWidth={2} dot={{ r: 3, fill: '#f8fafc', strokeWidth: 0 }} />
                )}
                {viewMode === 'comparison' && argoMode && (
                  <Line name="GLORYS12" type="monotone" dataKey="glorys" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
                )}
                {viewMode === 'error' && (
                  <Line name={`|OceanEmbed − ${truthLabel}|`} type="monotone" dataKey="error" stroke="#f59e0b"
                    strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Metrics row */}
          <div className="mt-4 pt-4 border-t border-navy-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {metricsRow.map((m) => (
                <div key={m.label} className="glass-card px-4 py-2 rounded-lg border border-navy-border flex flex-col">
                  <span className="text-[9px] font-mono text-text-muted">{m.label}</span>
                  <span className="font-mono text-sm text-accent font-semibold text-glow">{m.value}</span>
                </div>
              ))}
            </div>
            {argoMode && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                <span>Matched to grid cell {selected.grid_point.lat.toFixed(2)}°N {selected.grid_point.lng.toFixed(2)}°E, same UTC day</span>
              </div>
            )}
          </div>
        </div>

        {/* Benchmark over all held-out float profiles */}
        {summary && bench && (
          <div className="glass-card border border-navy-border rounded-xl p-5 shrink-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 className="text-xs font-semibold text-text-heading">
                ARGO benchmark · {summary.n_profiles_test} held-out profiles ({summary.n_profiles} total from {summary.n_floats} floats)
              </h3>
              <span className="text-[10px] font-mono text-text-muted">
                90% interval coverage vs ARGO: {summary.coverage.test !== null ? `${Math.round(summary.coverage.test * 100)}%` : '—'} (target 90%)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-text-muted text-left">
                    <th className="py-1 pr-4 font-normal">Predictor</th>
                    <th className="py-1 pr-4 font-normal">RMSE</th>
                    <th className="py-1 pr-4 font-normal">MAE</th>
                    <th className="py-1 pr-4 font-normal">Bias</th>
                    <th className="py-1 font-normal">RMSE 50–200 m</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(PREDICTOR_LABELS) as ArgoPredictor[]).map((p) => {
                    const o = bench.overall[p];
                    const thermo = bench.per_depth.filter((d) => d.depth_m >= 50 && d.depth_m <= 200);
                    const n = thermo.reduce((a, d) => a + d[p].n, 0);
                    const mse = thermo.reduce((a, d) => a + (d[p].rmse ?? 0) ** 2 * d[p].n, 0) / Math.max(1, n);
                    return (
                      <tr key={p} className={`border-t border-navy-border/60 ${p === 'model' ? 'text-accent font-semibold' : 'text-text-body'}`}>
                        <td className="py-1.5 pr-4">{PREDICTOR_LABELS[p]}</td>
                        <td className="py-1.5 pr-4">{o.rmse?.toFixed(3)} °C</td>
                        <td className="py-1.5 pr-4">{o.mae?.toFixed(3)} °C</td>
                        <td className="py-1.5 pr-4">{o.bias !== null ? `${o.bias >= 0 ? '+' : ''}${o.bias.toFixed(3)}` : '—'} °C</td>
                        <td className="py-1.5">{Math.sqrt(mse).toFixed(3)} °C</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-text-muted">
              {summary.source}. Profiles interpolated to the 15 standard depths and matched to the nearest ocean cell on the same day.
              ARGO measures a point while the grid is a 0.25° average, so part of every predictor's error is representativeness.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
