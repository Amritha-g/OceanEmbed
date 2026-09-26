import React, { useState, useRef } from 'react';
import { Calendar, Layers, MapPin, ChevronRight, X } from 'lucide-react';

interface SelectedPoint {
  lat: number;
  lng: number;
  xPercent: number;
  yPercent: number;
}

interface OceanExplorerProps {
  onExploreProfile?: (lat: number, lng: number) => void;
}

export const OceanExplorer: React.FC<OceanExplorerProps> = ({ onExploreProfile }) => {
  const [selectedRegion, setSelectedRegion] = useState<'bob' | 'as'>('bob');
  const [selectedDate, setSelectedDate] = useState('2024-05-15');
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>({
    lat: 15.50,
    lng: 88.25,
    xPercent: 72,
    yPercent: 58,
  });

  const gridRef = useRef<HTMLDivElement>(null);

  // Bounds: 5°N to 30°N, 45°E to 105°E
  const minLat = 5;
  const maxLat = 30;
  const minLng = 45;
  const maxLng = 105;

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    // Convert pixels to Lat / Lng
    const lng = minLng + (x / rect.width) * (maxLng - minLng);
    const lat = maxLat - (y / rect.height) * (maxLat - minLat);

    setSelectedPoint({
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      xPercent: Number(xPercent.toFixed(2)),
      yPercent: Number(yPercent.toFixed(2)),
    });
  };

  // Mock variable generation based on lat/lng
  const getMockVariables = (lat: number, lng: number) => {
    const sst = (27.2 + ((lat * 0.1 + lng * 0.05) % 3)).toFixed(1);
    const sss = (33.5 + ((lat * 0.08 + lng * 0.03) % 1.5)).toFixed(1);
    const ssh = (0.08 + ((lat * 0.01 + lng * 0.005) % 0.15)).toFixed(2);
    const current = (0.25 + ((lat * 0.02 + lng * 0.01) % 0.4)).toFixed(2);
    const wind = (4.5 + ((lat * 0.15 + lng * 0.05) % 4.0)).toFixed(1);

    return { sst, sss, ssh, current, wind };
  };

  const activeVars = selectedPoint ? getMockVariables(selectedPoint.lat, selectedPoint.lng) : null;

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden">
      {/* Top Filter Bar */}
      <header className="h-16 glass-panel border-b border-navy-border px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">REGION:</span>
            <div className="flex bg-navy-deep/80 p-1 rounded border border-navy-border text-xs font-medium">
              <button
                onClick={() => setSelectedRegion('bob')}
                className={`px-3 py-1 rounded transition-colors ${
                  selectedRegion === 'bob'
                    ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                    : 'text-text-body hover:text-text-heading'
                }`}
              >
                Bay of Bengal
              </button>
              <button
                onClick={() => setSelectedRegion('as')}
                className={`px-3 py-1 rounded transition-colors ${
                  selectedRegion === 'as'
                    ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                    : 'text-text-body hover:text-text-heading'
                }`}
              >
                Arabian Sea
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">DATE:</span>
            <div className="flex items-center gap-2 bg-navy-deep/80 px-3 py-1.5 rounded border border-navy-border text-xs font-mono text-text-heading">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-text-heading focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-4 font-mono text-xs text-text-muted">
          <span>BOUNDS: <span className="text-accent">5°N-30°N, 45°E-105°E</span></span>
          <span className="w-1 h-1 bg-navy-border rounded-full"></span>
          <span>GRID: <span className="text-accent">0.25°</span></span>
        </div>
      </header>

      {/* Main Workspace (Grid + Side Panel) */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* 2D Ocean Grid Canvas Area */}
        <div
          ref={gridRef}
          onClick={handleGridClick}
          className="flex-1 relative cursor-crosshair bg-navy-deep select-none overflow-hidden"
        >
          {/* Faint 0.25° Grid Overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(34, 211, 238, 0.15) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(34, 211, 238, 0.15) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
            }}
          />

          {/* Minimal North Indian Ocean Land Outlines (SVG) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
          >
            {/* Indian Subcontinent Outline */}
            <path
              d="M 200 0 L 280 180 L 380 320 L 450 420 L 490 350 L 580 250 L 680 140 L 750 0 Z"
              fill="rgba(10, 22, 40, 0.8)"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.5"
            />
            {/* Arabian Peninsula */}
            <path
              d="M 0 0 L 140 0 L 190 120 L 130 220 L 0 280 Z"
              fill="rgba(10, 22, 40, 0.8)"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.5"
            />
            {/* Southeast Asia */}
            <path
              d="M 750 0 L 850 180 L 820 380 L 880 500 L 1000 600 L 1000 0 Z"
              fill="rgba(10, 22, 40, 0.8)"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.5"
            />
          </svg>

          {/* Grid Latitude/Longitude Axis Annotations */}
          <div className="absolute top-2 left-3 font-mono text-[10px] text-text-muted/60 pointer-events-none">
            30.0° N
          </div>
          <div className="absolute bottom-2 left-3 font-mono text-[10px] text-text-muted/60 pointer-events-none">
            05.0° N
          </div>
          <div className="absolute bottom-2 right-3 font-mono text-[10px] text-text-muted/60 pointer-events-none">
            105.0° E
          </div>

          {/* Selected Point Marker */}
          {selectedPoint && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center"
              style={{ left: `${selectedPoint.xPercent}%`, top: `${selectedPoint.yPercent}%` }}
            >
              <div className="w-6 h-6 rounded-full border border-accent/50 flex items-center justify-center animate-ping absolute"></div>
              <div className="w-3 h-3 rounded-full bg-accent border-2 border-navy-deep shadow-sm"></div>
              <MapPin className="w-4 h-4 text-accent absolute -top-5" />
            </div>
          )}
        </div>

        {/* Right-Side Surface Variables Panel */}
        {selectedPoint && activeVars && (
          <aside className="w-80 glass-panel border-l border-navy-border flex flex-col justify-between p-6 z-20 animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-navy-border mb-6">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent" />
                  <span className="text-xs font-mono uppercase tracking-wider text-text-heading font-semibold">
                    Point Inspection
                  </span>
                </div>
                <button
                  onClick={() => setSelectedPoint(null)}
                  className="text-text-muted hover:text-text-heading p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Coordinates Readout */}
              <div className="bg-navy-deep/90 p-3 rounded border border-navy-border mb-6">
                <div className="text-[10px] font-mono text-text-muted uppercase mb-1">Target Coordinates</div>
                <div className="font-mono text-sm text-accent font-semibold">
                  {selectedPoint.lat.toFixed(4)}° N, {selectedPoint.lng.toFixed(4)}° E
                </div>
              </div>

              {/* MOCK Surface Variable Readouts */}
              <div className="space-y-3 mb-6">
                <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">
                  Surface Variables
                </div>

                <div className="flex items-center justify-between py-2 px-3 rounded bg-navy-deep/50 border border-navy-border/60">
                  <span className="text-xs text-text-body font-sans">SST (Sea Surface Temp)</span>
                  <span className="font-mono text-xs text-accent font-medium">{activeVars.sst} °C</span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 rounded bg-navy-deep/50 border border-navy-border/60">
                  <span className="text-xs text-text-body font-sans">SSS (Sea Surface Salinity)</span>
                  <span className="font-mono text-xs text-accent font-medium">{activeVars.sss} PSU</span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 rounded bg-navy-deep/50 border border-navy-border/60">
                  <span className="text-xs text-text-body font-sans">SSH (Sea Surface Height)</span>
                  <span className="font-mono text-xs text-accent font-medium">{activeVars.ssh} m</span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 rounded bg-navy-deep/50 border border-navy-border/60">
                  <span className="text-xs text-text-body font-sans">Surface Current</span>
                  <span className="font-mono text-xs text-accent font-medium">{activeVars.current} m/s</span>
                </div>

                <div className="flex items-center justify-between py-2 px-3 rounded bg-navy-deep/50 border border-navy-border/60">
                  <span className="text-xs text-text-body font-sans">Surface Wind</span>
                  <span className="font-mono text-xs text-accent font-medium">{activeVars.wind} m/s</span>
                </div>
              </div>
            </div>

            {/* Explore Profile CTA */}
            <div className="pt-4 border-t border-navy-border">
              <button
                onClick={() => onExploreProfile && onExploreProfile(selectedPoint.lat, selectedPoint.lng)}
                className="w-full bg-accent text-navy-deep font-semibold py-2.5 px-4 rounded text-xs flex items-center justify-center gap-2 hover:bg-opacity-90 transition-colors cursor-pointer"
              >
                <span>Explore Profile</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
