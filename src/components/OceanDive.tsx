import React, { useState } from 'react';
import { ArrowLeft, Sliders, Cpu, Activity, Info, Eye } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts';
import {
  ActiveRegion,
  REGION_CONFIGS,
  getPhysicalVariables,
  getDepthProfile,
} from '../utils/oceanPhysics';

interface OceanDiveProps {
  coordinates: { lat: number; lng: number };
  region?: ActiveRegion;
  onBackToExplorer: () => void;
}

export const OceanDive: React.FC<OceanDiveProps> = ({
  coordinates,
  region = 'bob',
  onBackToExplorer,
}) => {
  const [selectedDepthIndex, setSelectedDepthIndex] = useState(0);
  const [showConfidence, setShowConfidence] = useState(false);
  const [activeMetric, setActiveMetric] = useState<'temp' | 'salinity'>('temp');

  const regionData = REGION_CONFIGS[region];
  const activeVars = getPhysicalVariables(coordinates.lat, coordinates.lng, region);
  const profileData = getDepthProfile(coordinates.lat, coordinates.lng, region);

  const currentLevel = profileData[selectedDepthIndex];

  const getGradientBg = (temp: number) => {
    const ratio = Math.max(0, Math.min(1, (temp - 4) / 25));
    const cyanOpacity = (ratio * 0.45).toFixed(2);
    return `linear-gradient(180deg, rgba(34,211,238,${cyanOpacity}) 0%, rgba(5,11,20,0.98) 100%)`;
  };

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-14 glass-panel border-b border-navy-border px-6 md:px-8 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-colors bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30"
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
            <span className="text-[10px] font-mono text-text-muted">TARGET:</span>
            <span className="font-mono text-xs text-accent font-bold text-glow">
              {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Temperature / Salinity toggle */}
          <div className="flex bg-[#040c1a]/90 p-0.5 rounded-lg border border-navy-border text-xs font-mono">
            <button
              onClick={() => setActiveMetric('temp')}
              className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                activeMetric === 'temp'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Temperature (°C)
            </button>
            <button
              onClick={() => setActiveMetric('salinity')}
              className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                activeMetric === 'salinity'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Salinity (PSU)
            </button>
          </div>

          <button
            onClick={() => setShowConfidence((v) => !v)}
            className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
              showConfidence
                ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                : 'text-text-muted border-navy-border hover:border-accent/30'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>Uncertainty</span>
          </button>

          <div className="flex items-center gap-1.5 bg-accent/5 border border-accent/20 px-3 py-1 rounded-lg text-[10px] font-mono text-accent">
            <Info className="w-3 h-3" />
            <span>PHYSICALLY SYNCHRONIZED</span>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5">
        {/* Left: Depth Scrubber & Basin Physics */}
        <div className="flex-1 glass-card border border-navy-border rounded-xl p-5 flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-text-heading">Water Column Depth Scrubber</h3>
            </div>
            <span className="font-mono text-[10px] text-text-muted">0m – 1000m · 15 Vertical Levels</span>
          </div>

          <div className="flex-1 flex gap-5 items-center relative overflow-hidden">
            {/* Ambient dot grid */}
            <div
              className="absolute inset-0 pointer-events-none opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, #22d3ee 1px, transparent 1px)',
                backgroundSize: '18px 18px',
              }}
            />

            {/* Depth bar indicator */}
            <div
              className="w-20 h-full rounded-xl border border-navy-border relative flex flex-col justify-between p-2 transition-all duration-500 shadow-inner overflow-hidden"
              style={{ background: getGradientBg(currentLevel.temp) }}
            >
              {showConfidence && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(139,92,246,0.0) 0%, rgba(139,92,246,0.18) 60%, rgba(139,92,246,0.35) 100%)',
                  }}
                />
              )}
              <span className="text-[9px] font-mono text-accent/90 font-bold z-10">0m (SST)</span>
              <span className="text-[9px] font-mono text-text-muted text-center z-10">500m</span>
              <span className="text-[9px] font-mono text-text-muted font-bold z-10">1000m</span>
              {/* Scrub line indicator */}
              <div
                className="absolute left-0 right-0 h-0.5 bg-accent shadow-glow-sm transition-all duration-150 z-10"
                style={{
                  top: `${(selectedDepthIndex / (profileData.length - 1)) * 92 + 4}%`,
                }}
              />
            </div>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={profileData.length - 1}
              step={1}
              value={selectedDepthIndex}
              onChange={(e) => setSelectedDepthIndex(+e.target.value)}
              className="h-full w-2 cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
              style={{
                background: 'rgba(34,211,238,0.1)',
                borderRadius: '4px',
                border: '1px solid rgba(34,211,238,0.2)',
              }}
            />

            {/* Readout cards */}
            <div className="flex-1 flex flex-col justify-center gap-3 pl-2 z-10">
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-3.5 rounded-xl border border-navy-border">
                  <div className="text-[9px] font-mono text-text-muted mb-1">TARGET DEPTH</div>
                  <div className="font-mono text-2xl font-bold text-accent text-glow">
                    {currentLevel.depth}
                    <span className="text-sm font-normal text-text-body ml-1">m</span>
                  </div>
                </div>

                <div className="glass-card p-3.5 rounded-xl border border-navy-border">
                  <div className="text-[9px] font-mono text-text-muted mb-1">
                    {activeMetric === 'temp' ? 'TEMPERATURE' : 'SALINITY'}
                  </div>
                  <div className="font-mono text-2xl font-bold text-text-heading">
                    {activeMetric === 'temp' ? currentLevel.temp : currentLevel.salinity}
                    <span className="text-sm font-normal text-accent ml-1">
                      {activeMetric === 'temp' ? '°C' : 'PSU'}
                    </span>
                  </div>
                  {showConfidence && (
                    <div className="mt-1 text-[10px] font-mono text-violet-400">
                      ± {currentLevel.ci}°C uncertainty
                    </div>
                  )}
                </div>
              </div>

              {/* Surface Telemetry synced with map */}
              <div className="p-3 rounded-xl bg-[#030914]/80 border border-cyan-500/15 space-y-1.5 font-mono text-[11px]">
                <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Basin Parameters ({regionData.name})
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Surface SST (Map):</span>
                  <span className="text-cyan-300 font-bold">{activeVars.sst} °C</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Mixed Layer Depth (MLD):</span>
                  <span className="text-emerald-300 font-bold">{activeVars.mld} m</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Ocean Heat Content (OHC):</span>
                  <span className="text-cyan-300 font-bold">{activeVars.ohc} kJ/cm²</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Surface Salinity (SSS):</span>
                  <span className="text-amber-300 font-bold">{activeVars.sss} PSU</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline diagram */}
          <div className="mt-4 pt-3 border-t border-navy-border">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                Reconstruction Pipeline (0.25° Resolution)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['Surface Inputs', 'Ocean Embedding', 'Depth Decoder', 'Temp Profile'].map((step, i) => (
                <div
                  key={step}
                  className={`glass-card p-2 rounded-lg border text-center transition-all ${
                    i === 3 ? 'border-accent/30 bg-accent/5' : 'border-navy-border'
                  }`}
                >
                  <div
                    className={`text-[9px] font-mono mb-0.5 ${
                      i === 3 ? 'text-accent font-bold' : 'text-accent/70'
                    }`}
                  >
                    STEP {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className={`text-[10px] font-medium ${i === 3 ? 'text-accent' : 'text-text-heading'}`}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Profile chart */}
        <div className="w-[460px] glass-card border border-navy-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-text-heading">
                {activeMetric === 'temp' ? 'Temperature vs. Depth' : 'Salinity vs. Depth'}
              </h3>
            </div>
            <span className="font-mono text-[10px] text-text-muted">MLD: {activeVars.mld}m</span>
          </div>

          <div className="flex-1 relative min-h-0">
            {showConfidence && activeMetric === 'temp' && (
              <div className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden">
                <div
                  className="w-full h-full"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(139,92,246,0.0) 0%, rgba(139,92,246,0.06) 40%, rgba(139,92,246,0.12) 100%)',
                  }}
                />
                <div className="absolute bottom-2 right-2 text-[9px] font-mono text-violet-400 roadmap-badge">
                  95% CI overlay
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={profileData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={activeMetric === 'temp' ? [0, 32] : [32, 37]}
                  unit={activeMetric === 'temp' ? '°C' : ' PSU'}
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
                      <div className="bg-navy-deep/95 border border-navy-border p-2.5 rounded-lg text-xs font-mono shadow-glow-sm">
                        <div className="text-accent font-bold">{d.depth} m</div>
                        <div className="text-text-heading">Temperature: {d.temp} °C</div>
                        <div className="text-amber-300">Salinity: {d.salinity} PSU</div>
                        {showConfidence && <div className="text-violet-400">± {d.ci}°C</div>}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={activeMetric === 'temp' ? 'temp' : 'salinity'}
                  stroke={activeMetric === 'temp' ? '#22d3ee' : '#f59e0b'}
                  strokeWidth={2}
                  dot={{ r: 3, fill: activeMetric === 'temp' ? '#22d3ee' : '#f59e0b', strokeWidth: 0 }}
                  activeDot={{
                    r: 5,
                    fill: '#f0f9ff',
                    stroke: activeMetric === 'temp' ? '#22d3ee' : '#f59e0b',
                    strokeWidth: 2,
                  }}
                />
                <ReferenceLine
                  y={currentLevel.depth}
                  stroke="#22d3ee"
                  strokeDasharray="3 3"
                  opacity={0.6}
                  label={{
                    value: `${currentLevel.depth}m`,
                    fill: '#22d3ee',
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono',
                    position: 'insideRight',
                  }}
                />
                {/* MLD Indicator Line */}
                <ReferenceLine
                  y={activeVars.mld}
                  stroke="#10b981"
                  strokeDasharray="4 2"
                  opacity={0.7}
                  label={{
                    value: `MLD ${activeVars.mld}m`,
                    fill: '#10b981',
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono',
                    position: 'insideLeft',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 p-3 rounded-lg bg-navy-deep/60 border border-navy-border font-mono text-xs flex justify-between items-center text-text-muted">
            <span>ACTIVE LEVEL:</span>
            <span className="text-accent font-bold text-glow">
              {activeMetric === 'temp' ? `${currentLevel.temp} °C` : `${currentLevel.salinity} PSU`} @ {currentLevel.depth}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
