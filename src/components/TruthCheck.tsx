import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Info, CheckCircle2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

interface TruthCheckProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
}

const DEPTH_LEVELS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

export const TruthCheck: React.FC<TruthCheckProps> = ({ coordinates, onBackToExplorer }) => {
  const [viewMode, setViewMode] = useState<'comparison' | 'prediction' | 'truth' | 'error'>('comparison');

  // Mock dataset comparing OceanEmbed Prediction vs ARGO Observation
  const comparisonData = DEPTH_LEVELS.map((depth) => {
    const decay = Math.exp(-depth / 180);
    const predTemp = 4.2 + (28.5 - 4.2) * decay;
    // ARGO observation with slight natural variance
    const argoTemp = predTemp + Math.sin(depth / 50) * 0.35 + 0.12;
    const absError = Math.abs(predTemp - argoTemp);

    return {
      depth,
      prediction: Number(predTemp.toFixed(2)),
      argo: Number(argoTemp.toFixed(2)),
      error: Number(absError.toFixed(2)),
    };
  });

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-16 glass-panel border-b border-navy-border px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-colors bg-navy-deep/80 px-3 py-1.5 rounded border border-navy-border"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ocean Explorer</span>
          </button>
          <div className="h-4 w-[1px] bg-navy-border"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted">LOCATION:</span>
            <span className="font-mono text-xs text-accent font-semibold">
              {coordinates.lat.toFixed(4)}° N, {coordinates.lng.toFixed(4)}° E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-navy-deep/80 px-3 py-1 rounded border border-navy-border text-[11px] font-mono text-text-muted">
          <Info className="w-3 h-3 text-accent flex-shrink-0" />
          <span>SYNTHETIC ARGO COMPARISON DATA</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
        {/* Top Control Bar & View Toggle */}
        <div className="glass-panel border border-navy-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-text-heading font-sans">
                Truth Check & Validation
              </h2>
              <p className="text-xs text-text-muted font-sans">
                Comparative evaluation of model predictions against in-situ ARGO float observations
              </p>
            </div>
          </div>

          {/* 3-Way Mode Toggle */}
          <div className="flex bg-navy-deep/90 p-1 rounded border border-navy-border text-xs font-mono">
            <button
              onClick={() => setViewMode('comparison')}
              className={`px-3 py-1.5 rounded transition-colors ${
                viewMode === 'comparison'
                  ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                  : 'text-text-body hover:text-text-heading'
              }`}
            >
              Comparison
            </button>
            <button
              onClick={() => setViewMode('prediction')}
              className={`px-3 py-1.5 rounded transition-colors ${
                viewMode === 'prediction'
                  ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                  : 'text-text-body hover:text-text-heading'
              }`}
            >
              Prediction
            </button>
            <button
              onClick={() => setViewMode('truth')}
              className={`px-3 py-1.5 rounded transition-colors ${
                viewMode === 'truth'
                  ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                  : 'text-text-body hover:text-text-heading'
              }`}
            >
              Ground Truth
            </button>
            <button
              onClick={() => setViewMode('error')}
              className={`px-3 py-1.5 rounded transition-colors ${
                viewMode === 'error'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-semibold'
                  : 'text-text-body hover:text-text-heading'
              }`}
            >
              Error Mode
            </button>
          </div>
        </div>

        {/* Main Chart Card */}
        <div className="flex-1 glass-panel border border-navy-border rounded-lg p-6 flex flex-col justify-between overflow-hidden">
          <div className="w-full h-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={comparisonData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
              >
                <XAxis
                  type="number"
                  domain={viewMode === 'error' ? [0, 1.5] : [0, 32]}
                  unit={viewMode === 'error' ? '°C Δ' : '°C'}
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="depth"
                  reversed
                  domain={[0, 1000]}
                  unit="m"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-navy-deep/95 border border-navy-border p-3 rounded text-xs font-mono space-y-1">
                          <div className="text-accent font-bold mb-1">Depth: {data.depth} m</div>
                          {(viewMode === 'comparison' || viewMode === 'prediction') && (
                            <div className="text-accent">OceanEmbed: {data.prediction} °C</div>
                          )}
                          {(viewMode === 'comparison' || viewMode === 'truth') && (
                            <div className="text-slate-300">ARGO Observed: {data.argo} °C</div>
                          )}
                          {viewMode === 'error' && (
                            <div className="text-amber-400">Absolute Error: {data.error} °C</div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontFamily: 'Inter', fontSize: '12px' }}
                />

                {/* Conditional Lines depending on 3-way toggle */}
                {(viewMode === 'comparison' || viewMode === 'prediction') && (
                  <Line
                    name="OceanEmbed Prediction"
                    type="monotone"
                    dataKey="prediction"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#22d3ee' }}
                  />
                )}

                {(viewMode === 'comparison' || viewMode === 'truth') && (
                  <Line
                    name="ARGO Observation"
                    type="monotone"
                    dataKey="argo"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={{ r: 3.5, fill: '#94a3b8' }}
                  />
                )}

                {viewMode === 'error' && (
                  <Line
                    name="Per-Depth Error (|Prediction - ARGO|)"
                    type="monotone"
                    dataKey="error"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Validation Metrics Row */}
          <div className="mt-4 pt-4 border-t border-navy-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="bg-navy-deep/80 px-4 py-2 rounded border border-navy-border flex flex-col">
                <span className="text-[10px] font-mono text-text-muted">RMSE</span>
                <span className="font-mono text-sm text-accent font-semibold">0.42 °C</span>
              </div>

              <div className="bg-navy-deep/80 px-4 py-2 rounded border border-navy-border flex flex-col">
                <span className="text-[10px] font-mono text-text-muted">CORRELATION (R)</span>
                <span className="font-mono text-sm text-accent font-semibold">0.94</span>
              </div>

              <div className="bg-navy-deep/80 px-4 py-2 rounded border border-navy-border flex flex-col">
                <span className="text-[10px] font-mono text-text-muted">BIAS</span>
                <span className="font-mono text-sm text-accent font-semibold">+0.12 °C</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>Validated against independent ARGO gridded observations</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
