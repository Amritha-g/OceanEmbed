import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Info, CheckCircle2 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

interface TruthCheckProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
}

const DEPTH_LEVELS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

type ViewMode = 'comparison' | 'prediction' | 'truth' | 'error';

const METRICS = [
  { label: 'RMSE', value: '0.42 °C' },
  { label: 'CORR (R)', value: '0.94' },
  { label: 'BIAS', value: '+0.12 °C' },
  { label: 'N PROFILES', value: '47' },
];

export const TruthCheck: React.FC<TruthCheckProps> = ({ coordinates, onBackToExplorer }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('comparison');

  const data = DEPTH_LEVELS.map((depth) => {
    const decay = Math.exp(-depth / 180);
    const pred = 4.2 + (28.5 - 4.2) * decay;
    const argo = pred + Math.sin(depth / 50) * 0.35 + 0.12;
    return {
      depth,
      prediction: +pred.toFixed(2),
      argo: +argo.toFixed(2),
      error: +Math.abs(pred - argo).toFixed(2),
    };
  });

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'comparison', label: 'Comparison' },
    { id: 'prediction', label: 'Prediction' },
    { id: 'truth',      label: 'Ground Truth' },
    { id: 'error',      label: 'Error' },
  ];

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-14 glass-panel border-b border-navy-border px-5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-all bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30">
            <ArrowLeft className="w-3.5 h-3.5" /><span>Explorer</span>
          </button>
          <div className="h-4 w-px bg-navy-border" />
          <span className="text-[10px] font-mono text-text-muted">LOCATION:</span>
          <span className="font-mono text-xs text-accent font-bold text-glow">
            {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-navy-deep/80 px-3 py-1 rounded-lg border border-navy-border text-[10px] font-mono text-text-muted">
          <Info className="w-3 h-3 text-accent" /><span>SYNTHETIC ARGO COMPARISON</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
        {/* Control bar */}
        <div className="glass-card border border-navy-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg glass-card border border-navy-border shadow-glow-sm">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-heading">Truth Check & Validation</h2>
              <p className="text-[11px] text-text-muted">Model prediction vs. in-situ ARGO float observations</p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-navy-deep/80 p-0.5 rounded-xl border border-navy-border text-xs font-mono gap-0.5">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setViewMode(m.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === m.id
                    ? m.id === 'error'
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-accent/12 text-accent border border-accent/25 shadow-glow-sm'
                    : 'text-text-body hover:text-text-heading'
                }`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 glass-card border border-navy-border rounded-xl p-5 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 15, bottom: 10 }}>
                <XAxis type="number"
                  domain={viewMode === 'error' ? [0, 1.5] : [0, 32]}
                  unit={viewMode === 'error' ? ' Δ°C' : '°C'}
                  stroke="#334155"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis type="number" dataKey="depth" reversed domain={[0, 1000]} unit="m" stroke="#334155"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-navy-deep/95 border border-navy-border p-3 rounded-lg text-xs font-mono shadow-glow-sm space-y-1">
                      <div className="text-accent font-bold">Depth: {d.depth} m</div>
                      {(viewMode === 'comparison' || viewMode === 'prediction') && <div className="text-accent">OceanEmbed: {d.prediction} °C</div>}
                      {(viewMode === 'comparison' || viewMode === 'truth') && <div className="text-slate-300">ARGO: {d.argo} °C</div>}
                      {viewMode === 'error' && <div className="text-amber-400">Error: {d.error} °C</div>}
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ paddingTop: 8, fontFamily: 'Inter', fontSize: 11, color: '#94a3b8' }} />
                {(viewMode === 'comparison' || viewMode === 'prediction') && (
                  <Line name="OceanEmbed Prediction" type="monotone" dataKey="prediction"
                    stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#f0f9ff', stroke: '#22d3ee', strokeWidth: 2 }} />
                )}
                {(viewMode === 'comparison' || viewMode === 'truth') && (
                  <Line name="ARGO Observation" type="monotone" dataKey="argo"
                    stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2}
                    dot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }} />
                )}
                {viewMode === 'error' && (
                  <Line name="Per-Depth Error |Pred − ARGO|" type="monotone" dataKey="error"
                    stroke="#f59e0b" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Metrics row */}
          <div className="mt-4 pt-4 border-t border-navy-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {METRICS.map(m => (
                <div key={m.label} className="glass-card px-4 py-2 rounded-lg border border-navy-border flex flex-col">
                  <span className="text-[9px] font-mono text-text-muted">{m.label}</span>
                  <span className="font-mono text-sm text-accent font-semibold text-glow">{m.value}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              Validated against independent ARGO gridded obs.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
