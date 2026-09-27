import React, { useState, useRef } from 'react';
import {
  Calendar, Layers, MapPin, ChevronRight, X,
  Thermometer, Wind, Anchor, Download
} from 'lucide-react';

interface SelectedPoint {
  lat: number; lng: number; xPercent: number; yPercent: number;
}

interface OceanExplorerProps {
  onExploreProfile?: (lat: number, lng: number) => void;
}

// ── Mock data ──────────────────────────────────────────────────────────────
const HEATWAVE_ALERTS = [
  { id: 'HW-001', date: '2024-03-18', region: 'Bay of Bengal NW', severity: 'HIGH',   delta: '+1.8°C', duration: '12 days' },
  { id: 'HW-002', date: '2024-03-09', region: 'Arabian Sea E',    severity: 'MODERATE',delta: '+1.1°C', duration: '7 days' },
  { id: 'HW-003', date: '2024-02-22', region: 'Andaman Sea',      severity: 'LOW',    delta: '+0.6°C', duration: '4 days' },
];

const ARGO_FLOATS = [
  { id: '6904117', lat: 14.22, lng: 88.41, lastProfile: '2024-03-29', depth: 1000, cycles: 142 },
  { id: '6904231', lat: 17.85, lng: 91.07, lastProfile: '2024-03-27', depth: 2000, cycles: 89  },
  { id: '6903821', lat: 11.53, lng: 84.66, lastProfile: '2024-03-25', depth: 1000, cycles: 201 },
  { id: '6904019', lat: 20.14, lng: 94.32, lastProfile: '2024-03-22', depth: 500,  cycles: 67  },
];

const CYCLONE_EVENT = { name: 'Low-Pressure Area 03B', lat: 18.5, lng: 91.0, status: 'Monitoring', maxWind: '35 kn' };

const severityColor = (s: string) =>
  s === 'HIGH' ? 'text-red-400 border-red-500/30 bg-red-500/8' :
  s === 'MODERATE' ? 'text-amber-400 border-amber-500/30 bg-amber-500/8' :
  'text-emerald-400 border-emerald-500/30 bg-emerald-500/8';

// ── Proto toggle button ─────────────────────────────────────────────────────
const ProtoToggle: React.FC<{ label: string; active: boolean; onClick: () => void; color: string }> = ({ label, active, onClick, color }) => {
  const colorMap: Record<string, string> = {
    amber: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    red:   'text-red-400 border-red-500/40 bg-red-500/10',
    cyan:  'text-accent border-accent/40 bg-accent/10 shadow-glow-sm',
    slate: 'text-text-muted border-navy-border bg-navy-deep/60',
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
        active ? colorMap[color] : 'text-text-muted border-navy-border hover:border-accent/20'
      }`}>
      <span>{label}</span>
      <span className="roadmap-badge">P2</span>
    </button>
  );
};

// ── Bounds ─────────────────────────────────────────────────────────────────
const MIN_LAT = 8, MAX_LAT = 22, MIN_LNG = 80, MAX_LNG = 100;

const toPercent = (lat: number, lng: number) => ({
  x: ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 100,
  y: ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * 100,
});

const getMockVariables = (lat: number, lng: number) => ({
  sst:     (27.2 + ((lat * 0.1 + lng * 0.05) % 3)).toFixed(1),
  sss:     (33.5 + ((lat * 0.08 + lng * 0.03) % 1.5)).toFixed(1),
  ssh:     (0.08 + ((lat * 0.01 + lng * 0.005) % 0.15)).toFixed(2),
  current: (0.25 + ((lat * 0.02 + lng * 0.01) % 0.4)).toFixed(2),
  wind:    (4.5  + ((lat * 0.15 + lng * 0.05) % 4.0)).toFixed(1),
});

// ── Accurate Bay of Bengal / Arabian Sea coastline (SVG paths) ─────────────
// ViewBox maps to 8-22°N, 80-100°E  →  width=1000, height=700
// lat → y = (22 - lat) / 14 * 700;  lng → x = (lng - 80) / 20 * 1000
const COASTLINE_PATHS = [
  // Indian east coast (Coromandel) + tip of India
  "M 465 0 L 475 40 L 490 90 L 510 150 L 530 220 L 545 290 L 555 350 L 545 420 L 520 480 L 495 520 L 480 560 L 470 630 L 490 700",
  // Sri Lanka
  "M 485 510 L 500 490 L 530 500 L 545 530 L 535 560 L 510 570 L 490 555 Z",
  // Indian west coast (Malabar) partial
  "M 470 700 L 455 640 L 440 580 L 430 520 L 420 460 L 415 400 L 420 340 L 435 280 L 450 220 L 460 160 L 465 90 L 465 0",
  // Myanmar/Bangladesh coast
  "M 1000 0 L 940 0 L 900 30 L 870 80 L 840 140 L 810 200 L 800 260 L 790 310 L 800 360 L 810 420 L 840 480 L 870 540 L 900 600 L 930 660 L 950 700 L 1000 700",
  // Andaman Islands approximate
  "M 795 160 L 800 180 L 798 200 L 793 195 Z",
  "M 790 230 L 796 250 L 792 265 L 787 255 Z",
];

export const OceanExplorer: React.FC<OceanExplorerProps> = ({ onExploreProfile }) => {
  const [selectedRegion, setSelectedRegion] = useState<'bob' | 'as'>('bob');
  const [selectedDate, setSelectedDate]     = useState('2024-03-15');
  const [selectedPoint, setSelectedPoint]   = useState<SelectedPoint | null>({
    lat: 15.50, lng: 88.25, xPercent: toPercent(15.5, 88.25).x, yPercent: toPercent(15.5, 88.25).y,
  });
  const [showHeatwave, setShowHeatwave]     = useState(false);
  const [showCyclone, setShowCyclone]       = useState(false);
  const [showArgo, setShowArgo]             = useState(false);
  const [showExport, setShowExport]         = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const lng = MIN_LNG + (xPct / 100) * (MAX_LNG - MIN_LNG);
    const lat = MAX_LAT - (yPct / 100) * (MAX_LAT - MIN_LAT);
    setSelectedPoint({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), xPercent: +xPct.toFixed(2), yPercent: +yPct.toFixed(2) });
  };

  const activeVars = selectedPoint ? getMockVariables(selectedPoint.lat, selectedPoint.lng) : null;
  const cyclonePos = toPercent(CYCLONE_EVENT.lat, CYCLONE_EVENT.lng);

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="h-14 glass-panel border-b border-navy-border px-5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          {/* Region pill toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider hidden sm:block">REGION:</span>
            <div className="flex bg-navy-deep/80 p-0.5 rounded-lg border border-navy-border text-xs font-mono">
              {(['bob','as'] as const).map((r) => (
                <button key={r} onClick={() => setSelectedRegion(r)}
                  className={`px-3 py-1 rounded-md transition-all ${selectedRegion === r ? 'bg-accent/15 text-accent border border-accent/25 shadow-glow-sm' : 'text-text-body hover:text-text-heading'}`}>
                  {r === 'bob' ? 'Bay of Bengal' : 'Arabian Sea'}
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-1.5 bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border text-xs font-mono text-text-heading">
            <Calendar className="w-3 h-3 text-accent" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-text-heading focus:outline-none cursor-pointer" />
          </div>
        </div>

        {/* Proto feature toggles */}
        <div className="flex items-center gap-2">
          <ProtoToggle label="Heatwave" active={showHeatwave} onClick={() => setShowHeatwave(v => !v)} color="amber" />
          <ProtoToggle label="Cyclone" active={showCyclone} onClick={() => setShowCyclone(v => !v)} color="red" />
          <ProtoToggle label="ARGO Floats" active={showArgo} onClick={() => setShowArgo(v => !v)} color="cyan" />
          <ProtoToggle label="Export/API" active={showExport} onClick={() => setShowExport(v => !v)} color="slate" />
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="flex-1 flex relative overflow-hidden">

        {/* ── Map Canvas ── */}
        <div ref={gridRef} onClick={handleGridClick}
          className="flex-1 relative cursor-crosshair bg-navy-deep overflow-hidden select-none">

          {/* Grid */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: `linear-gradient(to right,rgba(34,211,238,0.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(34,211,238,0.06) 1px,transparent 1px)`, backgroundSize: '50px 50px' }} />

          {/* Scanlines */}
          <div className="absolute inset-0 pointer-events-none scanlines opacity-30" />

          {/* ── Accurate Coastline SVG ── */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 700" preserveAspectRatio="none">
            <defs>
              <filter id="coastGlow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Ocean fill */}
            <rect width="1000" height="700" fill="rgba(5,11,20,0)" />
            {/* Land masses */}
            {COASTLINE_PATHS.map((d, i) => (
              <path key={i} d={d}
                fill="rgba(8, 16, 32, 0.92)"
                stroke="rgba(34,211,238,0.28)"
                strokeWidth="1.5"
                filter="url(#coastGlow)"
              />
            ))}
            {/* Lat/lon grid labels */}
            {[10,14,18,22].map(lat => (
              <text key={lat} x="8" y={(MAX_LAT - lat) / (MAX_LAT - MIN_LAT) * 700}
                fill="rgba(100,116,139,0.6)" fontSize="10" fontFamily="JetBrains Mono" dominantBaseline="middle">
                {lat}°N
              </text>
            ))}
            {[82,86,90,94,98].map(lng => (
              <text key={lng} x={(lng - MIN_LNG) / (MAX_LNG - MIN_LNG) * 1000} y="690"
                fill="rgba(100,116,139,0.6)" fontSize="10" fontFamily="JetBrains Mono" textAnchor="middle">
                {lng}°E
              </text>
            ))}
          </svg>

          {/* ── ARGO float markers ── */}
          {showArgo && ARGO_FLOATS.map(f => {
            const pos = toPercent(f.lat, f.lng);
            return (
              <div key={f.id} className="absolute pointer-events-none z-10"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)' }}>
                <div className="w-3 h-3 rounded-full bg-cyan-400/80 border border-cyan-300 shadow-glow-sm flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-white" />
                </div>
                <div className="absolute left-4 top-0 text-[9px] font-mono text-cyan-400/80 whitespace-nowrap bg-navy-deep/80 px-1 rounded">
                  #{f.id}
                </div>
              </div>
            );
          })}

          {/* ── Cyclone marker ── */}
          {showCyclone && (
            <div className="absolute z-10 pointer-events-none"
              style={{ left: `${cyclonePos.x}%`, top: `${cyclonePos.y}%`, transform: 'translate(-50%,-50%)' }}>
              <div className="w-8 h-8 rounded-full border-2 border-red-500/60 flex items-center justify-center animate-spin" style={{ animationDuration: '3s' }}>
                <div className="w-4 h-4 rounded-full border border-red-400/40" />
              </div>
              <div className="absolute top-9 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400 whitespace-nowrap bg-navy-deep/90 px-1.5 py-0.5 rounded border border-red-500/30">
                {CYCLONE_EVENT.name}
              </div>
            </div>
          )}

          {/* ── Selected Point ── */}
          {selectedPoint && (
            <div className="absolute pointer-events-none z-20 flex items-center justify-center"
              style={{ left: `${selectedPoint.xPercent}%`, top: `${selectedPoint.yPercent}%`, transform: 'translate(-50%,-50%)' }}>
              <div className="absolute w-8 h-8 rounded-full border border-accent/40 sonar-ring" />
              <div className="absolute w-14 h-14 rounded-full border border-accent/15 sonar-ring" style={{ animationDelay: '0.4s' }} />
              <div className="w-3 h-3 rounded-full bg-accent glow-accent" />
              <MapPin className="w-4 h-4 text-accent absolute -top-5 drop-shadow-lg" />
            </div>
          )}
        </div>

        {/* ── Proto Overlay Panels ── */}

        {/* Heatwave alert feed */}
        {showHeatwave && (
          <ProtoPanel title="Marine Heatwave Alerts" icon={<Thermometer className="w-4 h-4 text-amber-400" />} onClose={() => setShowHeatwave(false)}>
            <div className="space-y-2 mt-3">
              {HEATWAVE_ALERTS.map(a => (
                <div key={a.id} className={`p-3 rounded-lg border ${severityColor(a.severity)} glass-card`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-[10px] text-text-muted">{a.date}</span>
                    <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${severityColor(a.severity)}`}>{a.severity}</span>
                  </div>
                  <div className="text-xs font-medium text-text-heading">{a.region}</div>
                  <div className="flex gap-3 mt-1 text-[10px] font-mono text-text-muted">
                    <span>ΔSST <span className="text-amber-400">{a.delta}</span></span>
                    <span>Duration <span className="text-text-body">{a.duration}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </ProtoPanel>
        )}

        {/* Cyclone info */}
        {showCyclone && (
          <ProtoPanel title="Storm / Cyclone Overlay" icon={<Wind className="w-4 h-4 text-red-400" />} onClose={() => setShowCyclone(false)}>
            <div className="mt-3 glass-card rounded-lg p-4 border border-red-500/20">
              <div className="text-xs font-semibold text-text-heading mb-3">{CYCLONE_EVENT.name}</div>
              <div className="space-y-2 text-[11px] font-mono">
                {[['Status', CYCLONE_EVENT.status], ['Position', `${CYCLONE_EVENT.lat}°N, ${CYCLONE_EVENT.lng}°E`], ['Max Wind', CYCLONE_EVENT.maxWind]].map(([k,v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-text-muted">{k}</span>
                    <span className="text-text-heading">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[9px] text-red-400/70 font-mono border-t border-red-500/20 pt-2">
                Static sample marker — real NWP feed not connected
              </div>
            </div>
          </ProtoPanel>
        )}

        {/* ARGO explorer */}
        {showArgo && (
          <ProtoPanel title="ARGO Float Explorer" icon={<Anchor className="w-4 h-4 text-accent" />} onClose={() => setShowArgo(false)}>
            <div className="space-y-2 mt-3 max-h-72 overflow-y-auto pr-1">
              {ARGO_FLOATS.map(f => (
                <div key={f.id} className="glass-card rounded-lg p-3 border border-navy-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-xs text-accent font-semibold">#{f.id}</span>
                    <span className="text-[9px] font-mono text-text-muted">{f.cycles} cycles</span>
                  </div>
                  <div className="text-[10px] font-mono space-y-1 text-text-body">
                    <div>Position: <span className="text-text-heading">{f.lat}°N, {f.lng}°E</span></div>
                    <div>Last profile: <span className="text-text-heading">{f.lastProfile}</span></div>
                    <div>Max depth: <span className="text-accent">{f.depth} m</span></div>
                  </div>
                </div>
              ))}
            </div>
          </ProtoPanel>
        )}

        {/* Export / API panel */}
        {showExport && (
          <ProtoPanel title="Export / API Access" icon={<Download className="w-4 h-4 text-text-muted" />} onClose={() => setShowExport(false)}>
            <div className="mt-3 space-y-3">
              {[
                { label: 'REST Endpoint', value: 'GET /api/v1/profile?lat={lat}&lon={lon}&date={date}' },
                { label: 'Bulk Export', value: 'GET /api/v1/bulk?region=BoB&format=netcdf' },
              ].map(ep => (
                <div key={ep.label} className="glass-card rounded-lg p-3 border border-navy-border">
                  <div className="text-[10px] font-mono text-text-muted mb-1">{ep.label}</div>
                  <div className="text-[10px] font-mono text-accent bg-navy-deep/60 p-2 rounded break-all">{ep.value}</div>
                </div>
              ))}
              <div className="text-[9px] font-mono text-text-muted/60 border-t border-navy-border pt-2">
                API not live — mockup only. Contact team for access.
              </div>
            </div>
          </ProtoPanel>
        )}

        {/* ── Point Inspection Panel ── */}
        {selectedPoint && activeVars && !showHeatwave && !showCyclone && !showArgo && !showExport && (
          <aside className="w-72 glass-panel border-l border-navy-border flex flex-col p-5 z-20">
            <div className="flex items-center justify-between pb-3 border-b border-navy-border mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-text-heading font-semibold">Point Inspection</span>
              </div>
              <button onClick={() => setSelectedPoint(null)} className="text-text-muted hover:text-text-heading p-0.5 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Coordinates */}
            <div className="bg-navy-deep/80 p-3 rounded-lg border border-navy-border mb-4 glow-accent-sm">
              <div className="text-[9px] font-mono text-text-muted uppercase mb-1">Target Coordinates</div>
              <div className="font-mono text-sm text-accent font-bold text-glow">
                {selectedPoint.lat.toFixed(4)}° N<br />{selectedPoint.lng.toFixed(4)}° E
              </div>
            </div>

            {/* Surface vars */}
            <div className="space-y-2 flex-1">
              <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-2">Surface Variables</div>
              {[
                ['SST',     activeVars.sst,     '°C'],
                ['SSS',     activeVars.sss,     'PSU'],
                ['SSH',     activeVars.ssh,     'm'],
                ['Current', activeVars.current, 'm/s'],
                ['Wind',    activeVars.wind,    'm/s'],
              ].map(([label, val, unit]) => (
                <div key={label} className="glass-card flex items-center justify-between py-2 px-3 rounded-lg border border-navy-border/60">
                  <span className="text-[11px] text-text-body">{label}</span>
                  <span className="font-mono text-xs text-accent font-semibold">{val} {unit}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="pt-4 border-t border-navy-border mt-4">
              <button
                onClick={() => onExploreProfile && onExploreProfile(selectedPoint.lat, selectedPoint.lng)}
                className="btn-accent w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2">
                <span>Explore Profile</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>
        )}

        {/* When proto panels open, show inspection summary at bottom-right instead */}
        {selectedPoint && activeVars && (showHeatwave || showCyclone || showArgo || showExport) && (
          <div className="absolute bottom-4 right-4 z-30 glass-card rounded-lg border border-navy-border p-3 text-xs font-mono">
            <span className="text-text-muted">Selected: </span>
            <span className="text-accent">{selectedPoint.lat.toFixed(2)}°N {selectedPoint.lng.toFixed(2)}°E</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Shared proto panel wrapper ────────────────────────────────────────────────
const ProtoPanel: React.FC<{ title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, icon, onClose, children }) => (
  <aside className="w-80 glass-panel border-l border-navy-border flex flex-col p-5 z-20 overflow-y-auto">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold text-text-heading">{title}</span>
        <span className="roadmap-badge">Phase 2</span>
      </div>
      <button onClick={onClose} className="text-text-muted hover:text-text-heading p-0.5 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    {children}
  </aside>
);
