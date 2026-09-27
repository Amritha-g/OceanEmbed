import React, { useState, useRef } from 'react';
import {
  Layers, MapPin, ChevronRight, X,
  Thermometer, Wind, Anchor, Download,
  Sliders, ShieldCheck, Navigation, Crosshair,
  Waves, Sparkles, ChevronDown, Plus, Minus, Maximize2
} from 'lucide-react';

interface SelectedPoint {
  lat: number;
  lng: number;
}

interface OceanExplorerProps {
  onExploreProfile?: (lat: number, lng: number) => void;
  onNavigateTo?: (view: 'dive' | 'reconstruction' | 'truth-check' | 'intelligence', coords: { lat: number; lng: number }) => void;
}

// Bounding Box: 8°N - 22°N, 80°E - 100°E
const MIN_LAT = 8, MAX_LAT = 22, MIN_LNG = 80, MAX_LNG = 100;

const PRESETS = [
  { name: 'Central BoB Basin', lat: 15.50, lng: 88.50, tag: 'Abyssal' },
  { name: 'Ganges Delta Plume', lat: 21.20, lng: 89.20, tag: 'Low Salinity' },
  { name: 'Chennai Shelf', lat: 13.10, lng: 80.80, tag: 'Shelf' },
  { name: 'Sri Lanka Dome', lat: 8.80, lng: 83.20, tag: 'Upwelling' },
  { name: 'Andaman Trench', lat: 11.50, lng: 93.80, tag: 'Deep Arc' },
  { name: 'Odisha MHW Hotspot', lat: 19.40, lng: 86.80, tag: 'Anomaly' },
];

const ARGO_FLOATS = [
  { id: '6904117', lat: 14.22, lng: 88.41, depth: 1000, cycles: 142, status: 'Active' },
  { id: '6904231', lat: 17.85, lng: 91.07, depth: 2000, cycles: 89, status: 'Active' },
  { id: '6903821', lat: 11.53, lng: 84.66, depth: 1000, cycles: 201, status: 'Active' },
  { id: '6904019', lat: 20.14, lng: 89.32, depth: 500,  cycles: 67, status: 'Calibrating' },
  { id: '6903904', lat: 13.80, lng: 93.10, depth: 1000, cycles: 115, status: 'Active' },
];

const CYCLONE_EVENT = {
  name: 'Cyclone "Michaung"',
  lat: 16.2,
  lng: 87.8,
  wind: '65 kn',
};

const CHANNEL_THEMES = {
  sst: { name: 'Sea Surface Temp', unit: '°C', accent: '#22d3ee', badge: 'OSTIA' },
  sss: { name: 'Sea Surface Salinity', unit: 'PSU', accent: '#10b981', badge: 'GLORYS' },
  ssh: { name: 'Sea Surface Height', unit: 'm', accent: '#38bdf8', badge: 'DUACS' },
  current: { name: 'Surface Currents', unit: 'm/s', accent: '#818cf8', badge: 'GLORYS' },
  wind: { name: 'Surface Winds', unit: 'm/s', accent: '#c084fc', badge: 'CCMP' },
};

const getPointValues = (lat: number, lng: number) => {
  const sst = (27.6 + ((lat * 0.12 + lng * 0.06) % 2.7)).toFixed(2);
  const sss = (32.2 + (((lat - 8) * 0.18 + (lng - 80) * 0.08) % 3.8)).toFixed(2);
  const ssh = (0.05 + ((lat * 0.01 + lng * 0.008) % 0.20)).toFixed(3);
  const curr = (0.28 + ((lat * 0.02 + lng * 0.01) % 0.35)).toFixed(2);
  const wind = (4.6 + ((lat * 0.14 + lng * 0.05) % 3.8)).toFixed(1);
  const thermocline = Math.round(65 + (lat * 1.6) % 30);

  const isSevere = parseFloat(sst) > 29.8;
  const isModerate = parseFloat(sst) > 29.0;
  const severity = isSevere ? 'High Heat Anomaly' : isModerate ? 'Moderate Anomaly' : 'Optimal';
  const severityColor = isSevere ? '#ef4444' : isModerate ? '#f59e0b' : '#10b981';

  return { sst, sss, ssh, curr, wind, thermocline, severity, severityColor };
};

export const OceanExplorer: React.FC<OceanExplorerProps> = ({ onExploreProfile, onNavigateTo }) => {
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint>({ lat: 15.50, lng: 88.50 });
  const [inputLat, setInputLat] = useState('15.50');
  const [inputLng, setInputLng] = useState('88.50');
  const [activeChannel, setActiveChannel] = useState<'sst' | 'sss' | 'ssh' | 'current' | 'wind'>('sst');
  const [showPresetsDropdown, setShowPresetsDropdown] = useState(false);
  const [showArgo, setShowArgo] = useState(true);
  const [showCyclone, setShowCyclone] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const theme = CHANNEL_THEMES[activeChannel];
  const pointData = getPointValues(selectedPoint.lat, selectedPoint.lng);

  const latToY = (lat: number) => ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * 100;
  const lngToX = (lng: number) => ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 100;

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    const lng = MIN_LNG + xPct * (MAX_LNG - MIN_LNG);
    const lat = MAX_LAT - yPct * (MAX_LAT - MIN_LAT);

    const clampedLat = Math.min(MAX_LAT, Math.max(MIN_LAT, +lat.toFixed(4)));
    const clampedLng = Math.min(MAX_LNG, Math.max(MIN_LNG, +lng.toFixed(4)));

    setSelectedPoint({ lat: clampedLat, lng: clampedLng });
    setInputLat(clampedLat.toFixed(2));
    setInputLng(clampedLng.toFixed(2));
  };

  const handleCoordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(inputLat);
    const lng = parseFloat(inputLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      const clampedLat = Math.min(MAX_LAT, Math.max(MIN_LAT, +lat.toFixed(4)));
      const clampedLng = Math.min(MAX_LNG, Math.max(MIN_LNG, +lng.toFixed(4)));
      setSelectedPoint({ lat: clampedLat, lng: clampedLng });
    }
  };

  const selectPreset = (p: typeof PRESETS[0]) => {
    setSelectedPoint({ lat: p.lat, lng: p.lng });
    setInputLat(p.lat.toFixed(2));
    setInputLng(p.lng.toFixed(2));
    setShowPresetsDropdown(false);
  };

  return (
    <div className="w-full h-[calc(100vh-4rem)] bg-[#070b12] text-slate-200 p-4 md:p-6 flex flex-col justify-between select-none font-sans overflow-hidden">
      {/* ── MAIN TACTICAL MAP CONTAINER ── */}
      <div className="relative flex-1 w-full bg-[#0c111c] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Floating Top Controls Header */}
        <div className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none">
          {/* Left: Channel Selector Pills */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-[#0a0f1a]/85 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl">
            {[
              { id: 'sst', label: 'SST' },
              { id: 'sss', label: 'Salinity' },
              { id: 'ssh', label: 'SSH' },
              { id: 'current', label: 'Currents' },
              { id: 'wind', label: 'Winds' },
            ].map((ch) => {
              const isActive = activeChannel === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannel(ch.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    isActive
                      ? 'bg-white text-black shadow-lg scale-[1.02]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>

          {/* Center: Tactical Coordinate Locater */}
          <div className="pointer-events-auto flex items-center gap-2">
            <form
              onSubmit={handleCoordSubmit}
              className="flex items-center gap-2 bg-[#0a0f1a]/85 backdrop-blur-xl px-3.5 py-1.5 rounded-2xl border border-white/10 shadow-2xl font-mono text-xs"
            >
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-500">N:</span>
              <input
                type="text"
                value={inputLat}
                onChange={(e) => setInputLat(e.target.value)}
                className="w-12 bg-transparent text-white font-bold focus:outline-none text-center"
              />
              <span className="text-slate-500">E:</span>
              <input
                type="text"
                value={inputLng}
                onChange={(e) => setInputLng(e.target.value)}
                className="w-12 bg-transparent text-white font-bold focus:outline-none text-center"
              />
              <button
                type="submit"
                className="bg-cyan-400 hover:bg-cyan-300 text-black font-bold px-2.5 py-0.5 rounded-lg text-[10px] uppercase transition-all shadow-md"
              >
                LOCATE
              </button>
            </form>

            {/* Presets Button */}
            <div className="relative">
              <button
                onClick={() => setShowPresetsDropdown((v) => !v)}
                className="bg-[#0a0f1a]/85 backdrop-blur-xl text-slate-300 hover:text-white px-3 py-2 rounded-2xl border border-white/10 shadow-2xl text-xs font-mono flex items-center gap-1.5 transition-all"
              >
                <span>SITES</span>
                <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              {showPresetsDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-[#0a0f1a]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl p-2 z-50 space-y-1 font-mono">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => selectPreset(p)}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs hover:bg-white/10 text-slate-200 hover:text-cyan-300 transition-all flex items-center justify-between"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-[9px] text-slate-400">[{p.tag}]</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Layer Toggles */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-[#0a0f1a]/85 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-2xl font-mono">
            <button
              onClick={() => setShowArgo((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                showArgo ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Anchor className="w-3.5 h-3.5" />
              <span>ARGO Fleet</span>
            </button>
            <button
              onClick={() => setShowCyclone((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                showCyclone ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Cyclone</span>
            </button>
          </div>
        </div>

        {/* ── MAP VIEWPORT ── */}
        <div
          ref={mapRef}
          onClick={handleMapClick}
          className="flex-1 w-full h-full relative cursor-crosshair bg-[#060911] overflow-hidden"
        >
          {/* Subtle Grid Lines */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Rotating Sonar Radar Beam */}
          <div
            className="absolute pointer-events-none rounded-full radar-sweep-beam opacity-30"
            style={{
              left: `${lngToX(90)}%`,
              top: `${latToY(15)}%`,
              width: '650px',
              height: '650px',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="w-1/2 h-1/2 absolute top-0 right-0 origin-bottom-left"
              style={{
                background: `conic-gradient(from 0deg at 0% 100%, ${theme.accent} 0deg, transparent 60deg)`,
              }}
            />
          </div>

          {/* Clean Vector Coastline SVG */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 700" preserveAspectRatio="none">
            <defs>
              <linearGradient id="landFillTactical" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0d1424" />
                <stop offset="100%" stopColor="#070b14" />
              </linearGradient>
            </defs>

            {/* Depth Contours */}
            <path d="M 240 0 C 270 120 290 260 270 390 C 250 500 210 600 170 700" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 6" />
            <path d="M 330 0 C 370 140 390 300 380 430 C 360 550 310 640 250 700" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 4" />

            {/* 1. PENINSULAR INDIA */}
            <path
              d="M 0 0 L 0 700 L 80 700 C 100 630 125 570 140 510 C 150 450 175 390 200 330 C 230 250 260 180 305 110 C 340 60 390 30 440 0 Z"
              fill="url(#landFillTactical)"
              stroke={theme.accent}
              strokeWidth="2"
              opacity="0.95"
            />

            {/* 2. SRI LANKA */}
            <path
              d="M 45 615 C 70 600 90 620 85 660 C 75 690 50 685 40 655 Z"
              fill="url(#landFillTactical)"
              stroke={theme.accent}
              strokeWidth="1.8"
            />

            {/* 3. BANGLADESH */}
            <path
              d="M 440 0 C 475 40 520 55 570 45 C 620 35 670 25 720 0 L 1000 0 L 1000 35 L 740 60 C 680 80 630 90 570 75 C 520 60 475 40 440 0 Z"
              fill="url(#landFillTactical)"
              stroke={theme.accent}
              strokeWidth="2"
            />

            {/* 4. MYANMAR */}
            <path
              d="M 720 0 L 750 60 L 780 140 L 810 230 L 850 320 L 900 420 L 950 540 L 1000 640 L 1000 0 Z"
              fill="url(#landFillTactical)"
              stroke={theme.accent}
              strokeWidth="2"
            />

            {/* 5. ANDAMANS */}
            <path d="M 648 380 C 654 400 652 430 646 450 C 640 430 642 400 648 380 Z" fill={theme.accent} />
            <path d="M 644 465 C 650 480 648 505 642 518 C 638 505 640 480 644 465 Z" fill={theme.accent} />
            <ellipse cx="640" cy="545" rx="4" ry="7" fill={theme.accent} />
            <ellipse cx="636" cy="595" rx="5" ry="9" fill={theme.accent} />
            <ellipse cx="632" cy="650" rx="6" ry="12" fill={theme.accent} />

            {/* Tactical Watermarks */}
            <text x="80" y="300" fill="rgba(255,255,255,0.3)" fontSize="24" fontWeight="bold" fontFamily="JetBrains Mono" letterSpacing="6">
              INDIA
            </text>
            <text x="50" y="645" fill="rgba(255,255,255,0.3)" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono">
              SRI LANKA
            </text>
            <text x="840" y="220" fill="rgba(255,255,255,0.25)" fontSize="20" fontWeight="bold" fontFamily="JetBrains Mono" letterSpacing="4">
              MYANMAR
            </text>
            <text x="430" y="370" fill="rgba(255,255,255,0.12)" fontSize="32" fontWeight="bold" fontFamily="JetBrains Mono" letterSpacing="10">
              BAY OF BENGAL
            </text>
          </svg>

          {/* ARGO Float Probes */}
          {showArgo &&
            ARGO_FLOATS.map((f) => {
              const isSelected = Math.abs(selectedPoint.lat - f.lat) < 0.1 && Math.abs(selectedPoint.lng - f.lng) < 0.1;
              return (
                <div
                  key={f.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPoint({ lat: f.lat, lng: f.lng });
                    setInputLat(f.lat.toFixed(2));
                    setInputLng(f.lng.toFixed(2));
                  }}
                  className="absolute cursor-pointer z-20 group"
                  style={{ left: `${lngToX(f.lng)}%`, top: `${latToY(f.lat)}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${
                      isSelected ? 'bg-white shadow-[0_0_16px_white] scale-125' : 'bg-cyan-400 border border-white/60'
                    }`}
                  >
                    <div className="w-1 h-1 rounded-full bg-black" />
                  </div>
                  <div className="absolute left-4 top-0 text-[9px] font-mono text-cyan-200 bg-[#040c1c]/90 px-1.5 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap shadow-md">
                    ARGO #{f.id}
                  </div>
                </div>
              );
            })}

          {/* Cyclone Marker */}
          {showCyclone && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ left: `${lngToX(CYCLONE_EVENT.lng)}%`, top: `${latToY(CYCLONE_EVENT.lat)}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center animate-spin">
                <div className="w-4 h-4 rounded-full border border-red-400" />
              </div>
              <div className="absolute top-11 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-300 whitespace-nowrap bg-[#1a0505]/95 px-2 py-0.5 rounded border border-red-500/40">
                🌀 {CYCLONE_EVENT.name}
              </div>
            </div>
          )}

          {/* Target Reticle */}
          <div
            className="absolute pointer-events-none z-30 flex items-center justify-center"
            style={{
              left: `${lngToX(selectedPoint.lng)}%`,
              top: `${latToY(selectedPoint.lat)}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute w-12 h-12 rounded-full border-2 sonar-pulse-wave" style={{ borderColor: theme.accent }} />
            <div className="w-4 h-4 rounded-full flex items-center justify-center shadow-lg" style={{ background: theme.accent }}>
              <div className="w-1.5 h-1.5 rounded-full bg-black" />
            </div>
            <MapPin className="w-5 h-5 absolute -top-6 drop-shadow-lg" style={{ color: theme.accent }} />
          </div>

          {/* Bottom Left Legend Tag */}
          <div className="absolute bottom-4 left-6 z-10 text-[11px] font-mono text-slate-400 bg-[#0a0f1a]/80 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/10">
            NORTH INDIAN OCEAN DOMAIN · 0.25° DAILY RESOLUTION
          </div>
        </div>

        {/* ── FLOATING TACTICAL TELEMETRY CARD (AERION STYLE) ── */}
        <div className="absolute bottom-6 right-6 z-30 w-80 bg-[#0a0f1a]/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 font-mono">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">RETICLE COORDS</div>
              <div className="text-base font-bold text-white mt-0.5">
                {selectedPoint.lat.toFixed(2)}°N · {selectedPoint.lng.toFixed(2)}°E
              </div>
            </div>
            <span
              className="text-[10px] uppercase px-2.5 py-1 rounded-full font-bold border"
              style={{
                color: pointData.severityColor,
                borderColor: `${pointData.severityColor}40`,
                backgroundColor: `${pointData.severityColor}15`,
              }}
            >
              {pointData.severity}
            </span>
          </div>

          {/* 4 Surface Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block">SST (OSTIA)</span>
              <span className="text-cyan-300 font-bold text-sm">{pointData.sst} °C</span>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block">SSS (GLORYS)</span>
              <span className="text-emerald-300 font-bold text-sm">{pointData.sss} PSU</span>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block">SSH / SLA</span>
              <span className="text-sky-300 font-bold text-sm">{pointData.ssh} m</span>
            </div>
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] text-slate-400 block">CURRENTS</span>
              <span className="text-indigo-300 font-bold text-sm">{pointData.curr} m/s</span>
            </div>
          </div>

          <button
            onClick={() => {
              if (onNavigateTo) onNavigateTo('dive', selectedPoint);
              else if (onExploreProfile) onExploreProfile(selectedPoint.lat, selectedPoint.lng);
            }}
            className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-black flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] transition-all"
            style={{ background: theme.accent, boxShadow: `0 0 20px ${theme.accent}60` }}
          >
            <Waves className="w-4 h-4" />
            <span>SCAN WATER COLUMN (0–1000m)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
