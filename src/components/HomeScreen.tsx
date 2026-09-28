import React, { useState } from 'react';
import { ArrowUpRight, Plus, Minus, Crosshair } from 'lucide-react';
import { ViewType } from './Navbar';
import { OceanTerrain3D } from './3d/OceanTerrain3D';

interface HomeScreenProps {
  onExplore: () => void;
  onSelectView?: (view: ViewType) => void;
}

const WAYPOINTS = [
  {
    id: 'WP1',
    name: 'Chennai Coastal Shelf',
    tag: 'ARGO #6903821',
    lat: '13.10°N',
    lng: '80.80°E',
    depth: '75m',
    temp: '28.4°C',
    status: 'ACTIVE',
    color: '#10b981',
    x: 16,
    y: 52,
    role: 'COASTAL CTD',
  },
  {
    id: 'WP2',
    name: 'Central BoB Basin',
    tag: 'ARGO #6904117',
    lat: '15.50°N',
    lng: '88.50°E',
    depth: '500m',
    temp: '22.8°C',
    status: 'ACTIVE',
    color: '#38bdf8',
    x: 42,
    y: 62,
    role: 'DEEP BASIN',
  },
  {
    id: 'WP3',
    name: 'Odisha Thermal MHW',
    tag: 'HEATWAVE ALERT',
    lat: '19.40°N',
    lng: '86.80°E',
    depth: '30m',
    temp: '29.9°C',
    status: 'ANOMALY',
    color: '#ef4444',
    x: 62,
    y: 44,
    role: 'MHW HOTSPOT',
  },
  {
    id: 'WP4',
    name: 'Andaman Deep Trench',
    tag: 'ARGO #6903904',
    lat: '11.50°N',
    lng: '93.80°E',
    depth: '1000m',
    temp: '4.2°C',
    status: 'SCANNING',
    color: '#f59e0b',
    x: 82,
    y: 56,
    role: 'ABYSSAL ARC',
  },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({ onExplore, onSelectView }) => {
  const [activeWp, setActiveWp] = useState(WAYPOINTS[2]);

  const selectTab = (view: ViewType) => {
    if (onSelectView) onSelectView(view);
    else onExplore();
  };

  return (
    <div className="w-full h-full bg-[#070b12] text-slate-200 p-3.5 md:p-4 flex flex-col justify-between select-none font-sans overflow-hidden gap-3">
      {/* ── TOP SECTION: DYNAMIC 3D OCEAN BASIN & TACTICAL PROBE BEACONS ── */}
      <div className="relative w-full flex-1 min-h-0 bg-[#090e18] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between p-4 md:p-5">
        {/* Real-Time 3D Ocean Bathymetry Waves Canvas */}
        <OceanTerrain3D activeTarget={activeWp.id} />

        {/* Ambient Dark Stars / Grid Overlay */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(56,189,248,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.12) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        {/* ── Top Left: Mode Tag (3D OCEAN) & Tactical Legend ── */}
        <div className="relative z-20 flex items-start gap-3">
          {/* 3D OCEAN Tag */}
          <div className="flex items-center gap-2 bg-[#0c1220]/90 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-cyan-500/30 shadow-xl font-mono text-xs font-bold text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
            <span>3D OCEAN</span>
          </div>

          {/* Tactical Legend Card */}
          <div className="hidden sm:flex items-center gap-4 bg-[#0c1220]/90 backdrop-blur-xl px-4 py-1.5 rounded-2xl border border-white/10 shadow-xl text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Optimal CTD</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-300">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span>MHW Hotspot</span>
            </div>
            <div className="flex items-center gap-1.5 text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>ARGO Fleet</span>
            </div>
          </div>
        </div>

        {/* ── Floating Tactical Callouts Over 3D Ocean Surface (Reference Style) ── */}
        {WAYPOINTS.map((wp) => {
          const isSelected = activeWp.id === wp.id;
          return (
            <div
              key={wp.id}
              onClick={() => setActiveWp(wp)}
              className="absolute z-20 cursor-pointer group transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
              style={{ left: `${wp.x}%`, top: `${wp.y}%` }}
            >
              {/* Radar Scan Rings on Anomaly / Active WP */}
              {wp.id === 'WP3' && (
                <div className="absolute -inset-10 rounded-full bg-red-500/15 animate-ping pointer-events-none border border-red-500/30" />
              )}
              {wp.id === 'WP2' && (
                <div className="absolute -inset-8 rounded-full bg-cyan-500/10 pointer-events-none border border-cyan-400/20" />
              )}

              {/* Tactical Callout Card (Floating Badge) */}
              <div
                className={`bg-[#0a101e]/90 backdrop-blur-xl border px-3 py-2 rounded-2xl shadow-2xl transition-all duration-300 flex items-center gap-2.5 font-mono ${
                  isSelected
                    ? 'border-white scale-110 shadow-[0_0_24px_rgba(34,211,238,0.5)] bg-[#0f172a]'
                    : 'border-white/15 hover:border-cyan-400/60'
                }`}
              >
                {/* Status Dot */}
                <div
                  className="w-6 h-6 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shadow-inner"
                  style={{ backgroundColor: `${wp.color}30`, border: `1px solid ${wp.color}` }}
                >
                  {wp.id}
                </div>

                <div className="text-left leading-tight">
                  <div className="text-[11px] font-bold text-white group-hover:text-cyan-300 flex items-center gap-1">
                    <span>{wp.name}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span style={{ color: wp.color }} className="font-semibold">{wp.role}</span>
                    <span>·</span>
                    <span className="text-cyan-300 font-bold">{wp.temp}</span>
                    <span>·</span>
                    <span className="text-slate-300">{wp.depth}</span>
                  </div>
                </div>
              </div>

              {/* Downward Tether Line to Ocean Floor */}
              <div
                className="w-px h-5 mx-auto border-r border-dashed"
                style={{ borderColor: wp.color }}
              />
              <div
                className="w-2 h-2 rounded-full mx-auto shadow-md"
                style={{ backgroundColor: wp.color }}
              />
            </div>
          );
        })}

        {/* ── Center Target Telemetry Banner ── */}
        <div className="relative z-20 self-center bg-[#0a101e]/95 backdrop-blur-xl border border-white/15 px-6 py-1.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-slate-400 uppercase text-[10px]">LOCKED TARGET:</span>
            <span className="font-bold text-white">{activeWp.name}</span>
          </div>
          <div className="text-slate-600">|</div>
          <div>
            <span className="text-slate-400">COORDS: </span>
            <span className="font-bold text-cyan-300">{activeWp.lat}, {activeWp.lng}</span>
          </div>
          <div className="text-slate-600">|</div>
          <div>
            <span className="text-slate-400">RECON TEMP: </span>
            <span className="font-bold text-emerald-400">{activeWp.temp}</span>
          </div>
        </div>

        {/* ── Top Right Map Zoom Controls ── */}
        <div className="absolute top-5 right-5 z-20 flex flex-col gap-2">
          <button
            onClick={onExplore}
            className="w-8 h-8 rounded-xl bg-[#0c1220]/90 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-cyan-400 transition-all shadow-lg"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onExplore}
            className="w-8 h-8 rounded-xl bg-[#0c1220]/90 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-cyan-400 transition-all shadow-lg"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onExplore}
            className="w-8 h-8 rounded-xl bg-[#0c1220]/90 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-cyan-400 transition-all shadow-lg"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* ── BOTTOM SECTION: 4 PRECISION TACTICAL MISSION CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 h-[215px] shrink-0">
        {/* 1. MAP OVERVIEW (MINI RADAR SWEEP) */}
        <div
          onClick={() => selectTab('explorer')}
          className="bg-[#0c111c] border border-white/[0.08] hover:border-cyan-400/40 rounded-2xl p-3.5 md:p-4 cursor-pointer group transition-all shadow-xl flex flex-col justify-between h-full"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold font-mono tracking-wider text-slate-400 uppercase">
              MAP OVERVIEW
            </span>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30 font-bold">
              0.25° GRID
            </span>
          </div>

          <div className="relative h-20 my-1 flex items-center justify-center overflow-hidden rounded-xl bg-[#060911]">
            <div className="absolute w-20 h-20 rounded-full border border-cyan-500/20" />
            <div className="absolute w-14 h-14 rounded-full border border-cyan-500/30" />
            <div className="absolute w-8 h-8 rounded-full border border-cyan-500/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />

            <div className="absolute w-20 h-20 rounded-full radar-sweep-beam">
              <div
                className="w-1/2 h-1/2 absolute top-0 right-0 origin-bottom-left"
                style={{
                  background: 'conic-gradient(from 0deg at 0% 100%, rgba(34,211,238,0.4) 0deg, transparent 60deg)',
                }}
              />
            </div>

            <span className="absolute bottom-1.5 text-[9px] font-mono text-slate-500">
              NORTH INDIAN OCEAN
            </span>
          </div>

          <div className="flex justify-between items-center text-xs font-mono pt-1.5 border-t border-white/[0.06]">
            <div>
              <div className="text-[9px] text-slate-500">COVERAGE</div>
              <div className="font-bold text-white text-[11px]">8.37M KM²</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-slate-500">SCAN PROBES</div>
              <div className="font-bold text-cyan-400 text-[11px]">142 ARGO</div>
            </div>
          </div>
        </div>

        {/* 2. WATER COLUMN & STRATIFICATION ANALYSIS */}
        <div
          onClick={() => selectTab('dive')}
          className="bg-[#0c111c] border border-white/[0.08] hover:border-cyan-400/40 rounded-2xl p-3.5 md:p-4 cursor-pointer group transition-all shadow-xl flex flex-col justify-between h-full"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold font-mono tracking-wider text-slate-400 uppercase">
              DEPTH ANALYSIS
            </span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
              15 LAYERS
            </span>
          </div>

          <div className="space-y-1.5 my-1 text-xs font-mono">
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-400">Mixed Layer (MLD)</span>
                <span className="font-bold text-cyan-400">54 m</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#162032] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full w-[65%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-400">D20 Isotherm Base</span>
                <span className="font-bold text-amber-400">78 m</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#162032] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full w-[45%]" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-400">MHW Over-Heated Area</span>
                <span className="font-bold text-red-400">32%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#162032] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 to-rose-400 rounded-full w-[32%]" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] font-mono pt-1.5 border-t border-white/[0.06]">
            <span className="text-slate-500">MAX SCAN:</span>
            <span className="font-bold text-white">1000m (Abyss)</span>
          </div>
        </div>

        {/* 3. THREAT & MHW ANOMALY GAUGE */}
        <div
          onClick={() => selectTab('intelligence')}
          className="bg-[#0c111c] border border-white/[0.08] hover:border-amber-400/40 rounded-2xl p-3.5 md:p-4 cursor-pointer group transition-all shadow-xl flex flex-col justify-between h-full"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold font-mono tracking-wider text-slate-400 uppercase">
              MHW THREAT DETECTION
            </span>
            <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
              ALERT ACTIVE
            </span>
          </div>

          <div className="relative h-20 my-1 flex flex-col items-center justify-center">
            <svg className="w-36 h-18" viewBox="0 0 160 80">
              <path
                d="M 10 80 A 70 70 0 0 1 150 80"
                fill="none"
                stroke="#1e293b"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M 10 80 A 70 70 0 0 1 120 25"
                fill="none"
                stroke="url(#gaugeGrad)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="60%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute top-6 text-center">
              <div className="text-xl font-black font-mono text-white">03</div>
              <div className="text-[8px] font-mono text-amber-400 font-bold tracking-widest">
                MHW THREATS
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[9px] font-mono pt-1.5 border-t border-white/[0.06] text-center">
            <div className="bg-[#121927] p-1 rounded-lg">
              <div className="text-slate-500">MHW</div>
              <div className="text-red-400 font-bold">+2.1°C</div>
            </div>
            <div className="bg-[#121927] p-1 rounded-lg">
              <div className="text-slate-500">CYCLONE</div>
              <div className="text-amber-400 font-bold">85%</div>
            </div>
            <div className="bg-[#121927] p-1 rounded-lg">
              <div className="text-slate-500">UPPER OHC</div>
              <div className="text-cyan-400 font-bold">+18%</div>
            </div>
          </div>
        </div>

        {/* 4. ARGO FLOAT MISSION TELEMETRY */}
        <div
          onClick={() => selectTab('truth-check')}
          className="bg-[#0c111c] border border-white/[0.08] hover:border-cyan-400/40 rounded-2xl p-3.5 md:p-4 cursor-pointer group transition-all shadow-xl flex flex-col justify-between h-full"
        >
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold font-mono tracking-wider text-slate-400 uppercase">
              FLOAT TELEMETRY
            </span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
              ONLINE
            </span>
          </div>

          <div className="my-1 space-y-1 text-[11px] font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">PROBE ID:</span>
              <span className="font-bold text-white">WMO #6904117</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">CYCLE COUNT:</span>
              <span className="font-bold text-cyan-400">142 Cycles</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">PROV. TARGET:</span>
              <span className="font-bold text-slate-200">GLORYS12 T(z)</span>
            </div>

            <div>
              <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                <span>BATTERY & SENSOR HEALTH</span>
                <span className="text-emerald-400 font-bold">84.2%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#162032] overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full w-[84%]" />
              </div>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onExplore();
            }}
            className="w-full py-1.5 rounded-xl text-xs font-bold font-mono bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center gap-1.5 transition-all shadow-md mt-1"
          >
            <span>LAUNCH MISSION HUD</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
