import React, { useState } from 'react';
import { ArrowLeft, Sliders, Cpu, Activity, Info } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface OceanDiveProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
}

// 15 standard oceanographic depth levels (m)
const DEPTH_LEVELS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

// Generate plausible mock temperature profile based on depth level
const getMockTempForDepth = (depth: number, lat: number) => {
  const surfaceTemp = 28.5 + (lat % 2) * 0.5;
  const deepTemp = 4.2;
  // Thermocline exponential decay model
  const decay = Math.exp(-depth / 180);
  const temp = deepTemp + (surfaceTemp - deepTemp) * decay;
  return Number(temp.toFixed(2));
};

export const OceanDive: React.FC<OceanDiveProps> = ({ coordinates, onBackToExplorer }) => {
  const [selectedDepthIndex, setSelectedDepthIndex] = useState<number>(0);

  // Generate 15-point dataset for Recharts profile
  const profileData = DEPTH_LEVELS.map((depth, idx) => ({
    index: idx,
    depth: depth,
    temp: getMockTempForDepth(depth, coordinates.lat),
  }));

  const currentLevel = profileData[selectedDepthIndex];

  // Interpolate color based on temperature (Warm Cyan #22d3ee -> Deep Navy #0a1628)
  const getGradientBg = (temp: number) => {
    const ratio = Math.max(0, Math.min(1, (temp - 4) / 25));
    const cyanOpacity = (ratio * 0.45).toFixed(2);
    return `linear-gradient(180deg, rgba(34, 211, 238, ${cyanOpacity}) 0%, rgba(5, 11, 20, 0.95) 100%)`;
  };

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Top Header */}
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

        <div className="flex items-center gap-2 bg-accent-glow px-3 py-1 rounded border border-accent-muted text-[11px] font-mono text-accent">
          <Info className="w-3 h-3 flex-shrink-0" />
          <span>MOCK MODEL SYNTHETIC PROFILE</span>
        </div>
      </header>

      {/* Workspace Body */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left/Center: Vertical Depth Scrubber Panel */}
        <div className="flex-1 glass-panel border border-navy-border rounded-lg p-6 flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-text-heading font-sans">
                Water Column Depth Scrubber
              </h3>
            </div>
            <div className="font-mono text-xs text-text-muted">
              RANGE: <span className="text-accent">0m – 1000m</span> (15 Standard Levels)
            </div>
          </div>

          {/* Interactive Depth Visualization Column */}
          <div className="flex-1 flex gap-6 items-center relative overflow-hidden">
            {/* Ambient Particle Background Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="w-full h-full bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:16px_16px] animate-pulse"></div>
            </div>

            {/* Visual Depth Bar with dynamic gradient based on scrubbed temp */}
            <div
              className="w-24 h-full rounded-md border border-navy-border relative flex flex-col justify-between p-2 transition-all duration-300 shadow-inner"
              style={{ background: getGradientBg(currentLevel.temp) }}
            >
              {/* Depth Markers */}
              <span className="text-[10px] font-mono text-accent/80 font-bold">0m (Surface)</span>
              <span className="text-[10px] font-mono text-text-muted text-center">500m</span>
              <span className="text-[10px] font-mono text-text-muted font-bold">1000m (Deep)</span>

              {/* Indicator marker for current scrubbed level */}
              <div
                className="absolute left-0 right-0 h-1 bg-accent shadow-[0_0_8px_#22d3ee] transition-all duration-150"
                style={{
                  top: `${(selectedDepthIndex / (DEPTH_LEVELS.length - 1)) * 92 + 4}%`,
                }}
              />
            </div>

            {/* Vertical Slider Controller */}
            <div className="h-full flex flex-col justify-between items-center py-2">
              <input
                type="range"
                min={0}
                max={DEPTH_LEVELS.length - 1}
                step={1}
                value={selectedDepthIndex}
                onChange={(e) => setSelectedDepthIndex(Number(e.target.value))}
                className="h-full w-2 accent-accent cursor-pointer appearance-none bg-navy-deep rounded border border-navy-border [writing-mode:vertical-lr] [direction:rtl]"
              />
            </div>

            {/* Active Depth & Temp Readout Cards */}
            <div className="flex-1 flex flex-col justify-center gap-4 pl-4 z-10">
              <div className="glass-panel p-4 rounded border border-navy-border">
                <div className="text-xs font-mono text-text-muted mb-1">TARGET DEPTH LEVEL</div>
                <div className="font-mono text-2xl font-bold text-accent">
                  {currentLevel.depth} <span className="text-sm font-normal text-text-body">meters</span>
                </div>
              </div>

              <div className="glass-panel p-4 rounded border border-navy-border">
                <div className="text-xs font-mono text-text-muted mb-1">RECONSTRUCTED TEMPERATURE</div>
                <div className="font-mono text-2xl font-bold text-text-heading">
                  {currentLevel.temp} <span className="text-sm font-normal text-text-accent text-accent">°C</span>
                </div>
              </div>

              <div className="text-xs text-text-muted font-sans border-t border-navy-border/50 pt-3">
                Scrub through 15 standardized depth levels to inspect predicted thermal profile.
              </div>
            </div>
          </div>

          {/* Pipeline Diagram: Reconstruction Horizontal Flow */}
          <div className="mt-6 pt-4 border-t border-navy-border">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                Reconstruction Pipeline Architecture
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="glass-panel p-2.5 rounded border border-navy-border text-center">
                <div className="text-[10px] font-mono text-accent">STEP 01</div>
                <div className="text-xs font-medium text-text-heading">Surface Inputs</div>
              </div>
              <div className="glass-panel p-2.5 rounded border border-navy-border text-center relative">
                <div className="text-[10px] font-mono text-accent">STEP 02</div>
                <div className="text-xs font-medium text-text-heading">Ocean Embedding</div>
              </div>
              <div className="glass-panel p-2.5 rounded border border-navy-border text-center">
                <div className="text-[10px] font-mono text-accent">STEP 03</div>
                <div className="text-xs font-medium text-text-heading">Depth Decoder</div>
              </div>
              <div className="glass-panel p-2.5 rounded border border-navy-border text-center bg-accent-glow/50 border-accent-muted">
                <div className="text-[10px] font-mono text-accent font-bold">OUTPUT</div>
                <div className="text-xs font-medium text-accent">Temp Profile</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Depth-Profile Line Chart (Recharts) */}
        <div className="w-[450px] glass-panel border border-navy-border rounded-lg p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-text-heading font-sans">
                Temperature vs. Depth Profile
              </h3>
            </div>
            <span className="font-mono text-[10px] text-text-muted">15 LEVELS</span>
          </div>

          {/* Recharts Temperature Profile Curve */}
          <div className="w-full h-80 relative py-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={profileData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 32]}
                  unit="°C"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="depth"
                  reversed
                  domain={[0, 1000]}
                  unit="m"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-navy-deep/95 border border-navy-border p-2 rounded text-xs font-mono">
                          <div className="text-accent">{data.depth} m</div>
                          <div className="text-text-heading font-semibold">{data.temp} °C</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#22d3ee' }}
                  activeDot={{ r: 6, fill: '#f8fafc', stroke: '#22d3ee' }}
                />
                {/* Active scrub depth line synchronization */}
                <ReferenceLine
                  y={currentLevel.depth}
                  stroke="#22d3ee"
                  strokeDasharray="3 3"
                  label={{
                    value: `Active: ${currentLevel.depth}m`,
                    fill: '#22d3ee',
                    fontSize: 10,
                    fontFamily: 'JetBrains Mono',
                    position: 'insideRight',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sync Information */}
          <div className="p-3 rounded bg-navy-deep/80 border border-navy-border font-mono text-xs flex justify-between items-center text-text-muted">
            <span>SCRUBBED VALUE:</span>
            <span className="text-accent font-bold">{currentLevel.temp} °C @ {currentLevel.depth}m</span>
          </div>
        </div>
      </div>
    </div>
  );
};
