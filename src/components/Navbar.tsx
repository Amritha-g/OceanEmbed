import React from 'react';
import {
  Compass, Waves, Cpu, ShieldCheck, BrainCircuit,
  Bell, Settings, Radio, Clock, UserCheck
} from 'lucide-react';
import { ViewType } from './Navbar';

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
    <header className="h-16 bg-[#090d16] border-b border-white/[0.08] px-5 md:px-8 flex items-center justify-between z-40 sticky top-0 shrink-0 select-none">
      {/* Brand Logo & Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onSelectView('home')}
          className="flex items-center gap-2.5 group focus:outline-none"
        >
          {/* Hexagon/Radar Brand Icon */}
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-mono text-sm font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)] group-hover:border-cyan-400 transition-all">
            ⬡
          </div>
          <span className="text-white font-extrabold tracking-wider text-base uppercase font-mono group-hover:text-cyan-400 transition-colors">
            OceanEmbed
          </span>
        </button>
      </div>

      {/* Center Tactical Pills */}
      <nav className="flex items-center gap-1.5 bg-[#0e1320] p-1 rounded-2xl border border-white/10 shadow-inner">
        {navTabs.map((tab) => {
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectView(tab.id)}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider transition-all ${
                isActive
                  ? 'bg-white text-black shadow-lg scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Right Telemetry & Status Badges */}
      <div className="flex items-center gap-2.5 text-xs font-mono">
        {/* Mission Clock */}
        <div className="hidden lg:flex items-center gap-2 bg-[#0e1320] px-3.5 py-1.5 rounded-2xl border border-white/10">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <div className="text-[10px] text-slate-400">INFERENCE TIME:</div>
          <div className="font-bold text-cyan-400">11.4 MS</div>
        </div>

        {/* Data Uplink */}
        <div className="hidden sm:flex items-center gap-2 bg-[#0e1320] px-3.5 py-1.5 rounded-2xl border border-white/10">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <div className="text-[10px] text-slate-400">INCOIS LAS:</div>
          <div className="font-bold text-emerald-400">0.25° DAILY</div>
        </div>

        {/* Tactical Officer Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-400/20 border border-white/15 flex items-center justify-center text-white text-xs font-bold font-mono">
          IN
        </div>
      </div>
    </header>
  );
};
