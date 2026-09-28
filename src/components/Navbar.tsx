import React from 'react';
import { Radio, Clock } from 'lucide-react';

export type ViewType = 'home' | 'explorer' | 'dive' | 'reconstruction' | 'truth-check' | 'intelligence';

interface NavbarProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  coordinates: { lat: number; lng: number };
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, onSelectView }) => {
  const navTabs = [
    { id: 'home' as ViewType, label: 'MISSION' },
    { id: 'explorer' as ViewType, label: 'OCEAN MAP' },
    { id: 'dive' as ViewType, label: 'DEPTH SCAN' },
    { id: 'reconstruction' as ViewType, label: 'AI ENGINE' },
    { id: 'truth-check' as ViewType, label: 'ARGO TRUTH' },
    { id: 'intelligence' as ViewType, label: 'INTELLIGENCE' },
  ];

  return (
    <header className="h-12 bg-[#070b14] border-b border-white/[0.08] px-5 flex items-center justify-between z-40 sticky top-0 shrink-0 select-none">

      {/* ── Brand ─────────────────────────────────────────── */}
      <button
        onClick={() => onSelectView('home')}
        className="flex items-center gap-2 group focus:outline-none shrink-0"
      >
        <div className="w-7 h-7 rounded-full bg-cyan-950/40 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)] group-hover:border-cyan-300 transition-all">
          <div className="w-3 h-3 rounded-full border border-cyan-400 flex items-center justify-center">
            <div className="w-[3px] h-[3px] rounded-full bg-cyan-300" />
          </div>
        </div>
        <span className="text-white font-extrabold tracking-[0.18em] text-[11px] uppercase font-mono group-hover:text-cyan-300 transition-colors">
          OceanEmbed
        </span>
      </button>

      {/* ── Center Nav Pills ──────────────────────────────── */}
      <nav className="flex items-center gap-px bg-[#0b101c] p-[3px] rounded-full border border-white/10 shadow-inner">
        {navTabs.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectView(tab.id)}
              className={`px-3.5 py-[5px] rounded-full text-[10px] font-mono font-semibold tracking-wider transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-white text-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Right Telemetry ───────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">

        {/* Inference Time */}
        <div className="hidden lg:flex items-center gap-1.5 bg-[#0b101c] px-3 py-[5px] rounded-full border border-white/10">
          <Clock className="w-3 h-3 text-slate-500" />
          <span className="text-slate-500 tracking-wider">INFERENCE:</span>
          <span className="font-bold text-cyan-400">11.4 ms</span>
        </div>

        {/* INCOIS */}
        <div className="hidden sm:flex items-center gap-1.5 bg-[#0b101c] px-3 py-[5px] rounded-full border border-white/10">
          <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="text-slate-500 tracking-wider">INCOIS:</span>
          <span className="font-bold text-emerald-400">0.25° DAILY</span>
        </div>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-[#0e1626] border border-white/20 flex items-center justify-center text-white text-[10px] font-bold font-mono shadow-inner">
          IN
        </div>
      </div>
    </header>
  );
};
