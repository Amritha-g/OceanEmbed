import React, { useState } from 'react';
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

interface TruthCheckProps {
  coordinates: { lat: number; lng: number };
  region?: ActiveRegion;
  onBackToExplorer: () => void;
  onNavigateTo?: (view: any, coords?: { lat: number; lng: number }) => void;
}

type ViewMode = 'comparison' | 'prediction' | 'truth' | 'error';

export const TruthCheck: React.FC<TruthCheckProps> = ({
  coordinates,
  region = 'bob',
  onBackToExplorer,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('comparison');

  const regionData = REGION_CONFIGS[region];
  const activeFloat = regionData.argoFloats[0];
  const activeVars = getPhysicalVariables(coordinates.lat, coordinates.lng, region);
  const rawProfile = getDepthProfile(coordinates.lat, coordinates.lng, region);
  const { result, status } = useNeuralProfile(coordinates.lat, coordinates.lng, region);
  const truth = status === 'live' ? result?.truth : null;
  const live = !!truth && !!result;

  // Live: model prediction vs. GLORYS12 reanalysis at the same grid cell and day (levels above the seafloor).
  // Offline: physics-engine profile vs. a simulated float.
  const data = live
    ? result.depths_m.flatMap((depth, i) => {
        const t = truth[i];
        if (t === null) return [];
        const prediction = Number(result.temperatures[i].toFixed(2));
        return [{ depth, prediction, argo: t, error: Number(Math.abs(prediction - t).toFixed(3)) }];
      })
    : rawProfile.map((pt) => ({
        depth: pt.depth,
        prediction: pt.temp,
        argo: pt.argoTemp,
        error: pt.tempError,
      }));
  const truthLabel = live ? 'GLORYS12 Reanalysis' : `Simulated ARGO #${activeFloat.id}`;

  // Validation statistics over the plotted levels
  const n = Math.max(1, data.length);
  const rmse = Math.sqrt(data.reduce((acc, d) => acc + (d.prediction - d.argo) ** 2, 0) / n).toFixed(3);
  const bias = (data.reduce((acc, d) => acc + (d.prediction - d.argo), 0) / n).toFixed(3);
  const meanP = data.reduce((a, d) => a + d.prediction, 0) / n;
  const meanT = data.reduce((a, d) => a + d.argo, 0) / n;
  const cov = data.reduce((a, d) => a + (d.prediction - meanP) * (d.argo - meanT), 0);
  const varP = data.reduce((a, d) => a + (d.prediction - meanP) ** 2, 0);
  const varT = data.reduce((a, d) => a + (d.argo - meanT) ** 2, 0);
  const corr = (cov / Math.sqrt(varP * varT || 1)).toFixed(4);

  const dynamicMetrics = [
    { label: 'SURFACE SST', value: `${live ? result.surface.sst.toFixed(2) : activeVars.sst} °C` },
    { label: 'RMSE', value: `${rmse} °C` },
    { label: 'CORR (R)', value: corr },
    { label: 'BIAS', value: `${+bias >= 0 ? '+' : ''}${bias} °C` },
    live
      ? { label: 'GRID CELL', value: `${result.grid_point?.lat.toFixed(2)}°N ${result.grid_point?.lng.toFixed(2)}°E` }
      : { label: 'ACTIVE ARGO', value: `#${activeFloat.id}` },
  ];

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'comparison', label: 'Comparison' },
    { id: 'prediction', label: 'Prediction' },
    { id: 'truth', label: 'Ground Truth' },
    { id: 'error', label: 'Residual Error' },
  ];

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

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">LOCATION:</span>
            <span className="font-mono text-xs text-accent font-bold text-glow">
              {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-navy-deep/80 px-3 py-1 rounded-lg border border-navy-border text-[10px] font-mono text-slate-300">
            <Anchor className="w-3 h-3 text-cyan-400" />
            <span>{live ? `GLORYS12 · ${result.date}` : `IN-SITU FLOAT WMO #${activeFloat.id}`}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-accent/5 px-3 py-1 rounded-lg border border-accent/25 text-[10px] font-mono text-accent">
            <Info className="w-3 h-3 text-accent" />
            <span>{live ? 'NEURAL MODEL LIVE' : 'API OFFLINE · SIMULATED'}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
        {/* Control bar */}
        <div className="glass-card border border-navy-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg glass-card border border-cyan-500/30 text-cyan-300 shadow-glow-sm">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text-heading">Truth Check & Validation Analysis</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {regionData.name}
                </span>
              </div>
              <p className="text-[11px] text-text-muted">
                {live
                  ? `OceanEmbed neural reconstruction vs. GLORYS12 reanalysis at the nearest ocean cell (${result.date}, seafloor ≈ ${result.seafloor_depth_m} m)`
                  : `Physics-engine profile vs. simulated ARGO float #${activeFloat.id} (start the API for real validation)`}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
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

        {/* Chart */}
        <div className="flex-1 glass-card border border-navy-border rounded-xl p-5 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 15, bottom: 10 }}
              >
                <XAxis
                  type="number"
                  domain={viewMode === 'error' ? [0, 'auto'] : [0, 32]}
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
                    const d = payload[0].payload;
                    return (
                      <div className="bg-navy-deep/95 border border-navy-border p-3 rounded-lg text-xs font-mono shadow-glow-sm space-y-1">
                        <div className="text-accent font-bold">Depth: {d.depth} m</div>
                        {(viewMode === 'comparison' || viewMode === 'prediction') && (
                          <div className="text-cyan-300">OceanEmbed: {d.prediction} °C</div>
                        )}
                        {(viewMode === 'comparison' || viewMode === 'truth') && (
                          <div className="text-slate-300">{truthLabel}: {d.argo} °C</div>
                        )}
                        {viewMode === 'error' && (
                          <div className="text-amber-400">Residual Error: {d.error} °C</div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 8, fontFamily: 'Inter', fontSize: 11, color: '#94a3b8' }}
                />
                {(viewMode === 'comparison' || viewMode === 'prediction') && (
                  <Line
                    name="OceanEmbed Prediction"
                    type="monotone"
                    dataKey="prediction"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#f0f9ff', stroke: '#22d3ee', strokeWidth: 2 }}
                  />
                )}
                {(viewMode === 'comparison' || viewMode === 'truth') && (
                  <Line
                    name={`Ground Truth (${truthLabel})`}
                    type="monotone"
                    dataKey="argo"
                    stroke="#94a3b8"
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
                  />
                )}
                {viewMode === 'error' && (
                  <Line
                    name="Absolute Error |Prediction − Truth|"
                    type="monotone"
                    dataKey="error"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Metrics row */}
          <div className="mt-4 pt-4 border-t border-navy-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {dynamicMetrics.map((m) => (
                <div
                  key={m.label}
                  className="glass-card px-4 py-2 rounded-lg border border-navy-border flex flex-col"
                >
                  <span className="text-[9px] font-mono text-text-muted">{m.label}</span>
                  <span className="font-mono text-sm text-accent font-semibold text-glow">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              <span>
                {live
                  ? `Snapped ${result.grid_point?.snap_km ?? 0} km to nearest ocean cell`
                  : `Independent WMO CTD Float cycle ${activeFloat.cycles} (${activeFloat.lastProfile})`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
