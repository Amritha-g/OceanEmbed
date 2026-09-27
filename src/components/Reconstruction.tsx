import React, { useState } from 'react';
import { ArrowLeft, Cpu, Layers, Sparkles, Database, CheckCircle2, Sliders } from 'lucide-react';

interface ReconstructionProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
  onExploreDive?: () => void;
}

const INPUT_CHANNELS = [
  { id: 'sst', name: 'SST (OSTIA)', value: '28.42', unit: '°C', desc: 'Operational Sea Surface Temp', color: 'text-cyan-400', border: 'border-cyan-500/30' },
  { id: 'sss', name: 'SSS (GLORYS12)', value: '33.85', unit: 'PSU', desc: 'Sea Surface Practical Salinity', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  { id: 'ssh', name: 'SSH / SLA (DUACS)', value: '+0.11', unit: 'm', desc: 'Sea Surface Height Anomaly', color: 'text-sky-400', border: 'border-sky-500/30' },
  { id: 'u_curr', name: 'Current U (GLORYS)', value: '+0.28', unit: 'm/s', desc: 'Zonal Surface Velocity', color: 'text-blue-400', border: 'border-blue-500/30' },
  { id: 'v_curr', name: 'Current V (GLORYS)', value: '-0.14', unit: 'm/s', desc: 'Meridional Surface Velocity', color: 'text-blue-400', border: 'border-blue-500/30' },
  { id: 'u_wind', name: 'Wind U (CCMP)', value: '-3.80', unit: 'm/s', desc: 'Cross-Calibrated Zonal Wind', color: 'text-violet-400', border: 'border-violet-500/30' },
  { id: 'v_wind', name: 'Wind V (CCMP)', value: '+2.15', unit: 'm/s', desc: 'Cross-Calibrated Meridional Wind', color: 'text-violet-400', border: 'border-violet-500/30' },
];

const DEPTH_OUTPUTS = [
  { depth: 0, temp: 28.42 },
  { depth: 5, temp: 28.38 },
  { depth: 10, temp: 28.25 },
  { depth: 20, temp: 27.90 },
  { depth: 30, temp: 26.85 },
  { depth: 50, temp: 24.10 },
  { depth: 75, temp: 19.80 },
  { depth: 100, temp: 16.20 },
  { depth: 125, temp: 14.10 },
  { depth: 150, temp: 12.85 },
  { depth: 200, temp: 11.20 },
  { depth: 300, temp: 8.90 },
  { depth: 500, temp: 6.40 },
  { depth: 700, temp: 5.10 },
  { depth: 1000, temp: 4.25 },
];

export const Reconstruction: React.FC<ReconstructionProps> = ({ coordinates, onBackToExplorer, onExploreDive }) => {
  const [selectedChannel, setSelectedChannel] = useState<string>('sst');
  const [activeEmbeddingLayer, setActiveEmbeddingLayer] = useState<number>(2);

  return (
    <div className="w-full min-h-screen bg-navy-deep flex flex-col text-text-body select-none">
      {/* Header bar */}
      <div className="h-14 glass-panel border-b border-navy-border px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-all bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Explorer</span>
          </button>
          <div className="h-4 w-px bg-navy-border" />
          <span className="text-[10px] font-mono text-text-muted">LOCATION:</span>
          <span className="font-mono text-xs text-accent font-bold text-glow">
            {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="roadmap-badge">Phase 1 Active</span>
          <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 px-3 py-1 rounded-lg text-[10px] font-mono text-accent">
            <Cpu className="w-3 h-3" />
            <span>INFERENCE: 11.4 ms</span>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 p-5 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl glass-card border border-navy-border text-accent shadow-glow-sm">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-heading">Subsurface Reconstruction Engine</h1>
              <p className="text-xs text-text-muted mt-0.5">
                Mapping 7-channel surface satellite telemetry into 15 discrete standard ocean depth levels
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onExploreDive && (
              <button
                onClick={onExploreDive}
                className="btn-accent px-4 py-2 rounded-lg text-xs flex items-center gap-2"
              >
                <span>Launch OceanDive Inspector</span>
                <Sliders className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 3-Stage Pipeline Diagram */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* STAGE 1: 7 SURFACE INPUT CHANNELS */}
          <div className="glass-card border border-navy-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-navy-border mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-text-heading">1. Surface Observations (7 Ch)</span>
              </div>
              <span className="text-[10px] font-mono text-text-muted">0.25° Resolution</span>
            </div>

            <div className="space-y-2 flex-1">
              {INPUT_CHANNELS.map((ch) => {
                const isSelected = selectedChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannel(ch.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-accent/10 border-accent/40 shadow-glow-sm'
                        : 'bg-navy-deep/60 border-navy-border/60 hover:border-navy-border'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium text-text-heading">{ch.name}</div>
                      <div className="text-[10px] text-text-muted">{ch.desc}</div>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-sm font-bold ${ch.color}`}>{ch.value}</span>
                      <span className="text-[10px] font-mono text-text-muted ml-1">{ch.unit}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STAGE 2: NEURAL LATENT EMBEDDING */}
          <div className="glass-card border border-navy-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-navy-border mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-semibold text-text-heading">2. Ocean Latent Embedding</span>
              </div>
              <span className="text-[10px] font-mono text-violet-400">128-dim Vector</span>
            </div>

            <div className="flex-1 flex flex-col justify-between gap-4">
              <p className="text-xs text-text-muted leading-relaxed">
                A spatial-temporal ocean foundation backbone compresses atmospheric & surface altimetry data into a continuous oceanographic latent state representation.
              </p>

              {/* Interactive Latent Grid Visualization */}
              <div className="p-4 rounded-xl bg-navy-deep/80 border border-navy-border">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-mono text-text-muted">LATENT TENSOR SLICE [16x8]</span>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((l) => (
                      <button
                        key={l}
                        onClick={() => setActiveEmbeddingLayer(l)}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded ${
                          activeEmbeddingLayer === l
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                            : 'text-text-muted hover:text-text-body'
                        }`}
                      >
                        L{l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-8 gap-1.5 py-2">
                  {Array.from({ length: 32 }).map((_, i) => {
                    const weight = (Math.sin(i * 0.4 + activeEmbeddingLayer) * 0.5 + 0.5).toFixed(2);
                    const opacity = Math.max(0.15, Number(weight));
                    return (
                      <div
                        key={i}
                        className="h-6 rounded bg-violet-500 border border-violet-400/30 flex items-center justify-center transition-all duration-300"
                        style={{ opacity }}
                        title={`Dimension ${i}: ${weight}`}
                      >
                        <span className="text-[8px] font-mono text-white/80">{i + 1}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-navy-deep/60 border border-navy-border/60 text-[11px] font-mono text-text-muted space-y-1">
                <div className="flex justify-between">
                  <span>ACTIVATION:</span>
                  <span className="text-accent font-semibold">GELU Non-linear</span>
                </div>
                <div className="flex justify-between">
                  <span>PARAMS:</span>
                  <span className="text-text-heading font-semibold">4.8M Float32</span>
                </div>
              </div>
            </div>
          </div>

          {/* STAGE 3: 15-DEPTH RECONSTRUCTED OUTPUT */}
          <div className="glass-card border border-navy-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-navy-border mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-text-heading">3. Reconstructed Profile</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">15 Depth Levels</span>
            </div>

            <div className="space-y-1.5 flex-1 max-h-[360px] overflow-y-auto pr-1">
              {DEPTH_OUTPUTS.map((item) => {
                const ratio = Math.max(0, Math.min(1, (item.temp - 4) / 25));
                return (
                  <div
                    key={item.depth}
                    className="p-2 rounded-lg bg-navy-deep/60 border border-navy-border/50 flex items-center justify-between text-xs font-mono hover:border-accent/30 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-12 text-text-muted">{item.depth} m</span>
                      <div className="w-24 h-1.5 bg-navy-deep rounded-full overflow-hidden border border-navy-border/40">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-accent font-semibold">{item.temp.toFixed(2)} °C</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-navy-border flex items-center justify-between text-[11px] font-mono text-text-muted">
              <span>TARGET REGION:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 8°N-22°N, 80°E-100°E
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
