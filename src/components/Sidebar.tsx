import React from 'react';
import { Compass, Waves, Cpu, ShieldCheck, BrainCircuit, ChevronLeft, ChevronRight } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}

const navItems: NavItem[] = [
  { id: 'explorer',      label: 'Ocean Explorer',    icon: Compass,      active: true  },
  { id: 'dive',          label: 'OceanDive',          icon: Waves,        active: true  },
  { id: 'reconstruction',label: 'Reconstruction',     icon: Cpu,          active: false },
  { id: 'truth-check',   label: 'Truth Check',        icon: ShieldCheck,  active: true  },
  { id: 'intelligence',  label: 'Ocean Intelligence', icon: BrainCircuit, active: true  },
];

interface SidebarProps {
  activeTab: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTab: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, isOpen, onToggle, onSelectTab }) => {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen glass-panel z-40 flex flex-col justify-between py-6 border-r border-navy-border transition-transform duration-300 select-none w-64 px-4 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Brand Header with Integrated Collapse Button */}
      <div>
        <div className="flex items-center justify-between px-2 mb-8 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded border border-accent/40 flex items-center justify-center text-accent font-mono text-sm font-bold glow-accent-sm shrink-0">
              OE
            </div>
            <div>
              <span className="text-text-heading font-bold tracking-wide text-base leading-none">OceanEmbed</span>
              <div className="text-[10px] font-mono text-text-muted mt-0.5">v0.1.0-alpha</div>
            </div>
          </div>

          {/* Toggle button part of the sidebar header */}
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg border border-navy-border hover:border-cyan-400/50 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-all duration-200"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="space-y-1 px-2" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && item.active;
            return (
              <button
                key={item.id}
                disabled={!item.active}
                onClick={() => item.active && onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/25 shadow-glow-sm'
                    : item.active
                    ? 'text-text-body hover:text-text-heading hover:bg-white/[0.04] border border-transparent hover:border-navy-border'
                    : 'text-text-muted/40 opacity-40 cursor-not-allowed border border-transparent'
                }`}
                title={!item.active ? `${item.label} (Coming soon)` : item.label}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-accent' : ''}`} />
                  <span className="truncate font-medium text-xs">{item.label}</span>
                </div>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent glow-accent-sm shrink-0" />
                )}
                {!item.active && (
                  <span className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-navy-border/30 text-text-muted/30 bg-navy-deep/30 select-none">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="px-2 pt-4 border-t border-navy-border flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>SYSTEM ONLINE</span>
        </div>
        <div className="text-[10px] text-text-muted/50 font-mono leading-tight whitespace-nowrap">
          Bay of Bengal · Arabian Sea<br />
          0.25° · 15 depth levels
        </div>
      </div>

      {/* Edge Handle Tab (Part of the sidebar itself, docked on its border) */}
      <button
        onClick={onToggle}
        className="absolute -right-7 top-1/2 -translate-y-1/2 py-4 px-1 rounded-r-xl glass-panel border border-l-0 border-cyan-500/35 text-cyan-300 hover:text-white hover:bg-cyan-500/15 hover:border-cyan-400 transition-all shadow-glow-sm flex items-center justify-center group cursor-pointer"
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isOpen ? (
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        ) : (
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        )}
      </button>
    </aside>
  );
};
