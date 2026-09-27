import React from 'react';
import { Compass, Waves, Cpu, ShieldCheck, BrainCircuit } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}

const navItems: NavItem[] = [
  { id: 'explorer',      label: 'Ocean Explorer',     icon: Compass,      active: true  },
  { id: 'dive',          label: 'OceanDive',           icon: Waves,        active: true  },
  { id: 'reconstruction',label: 'Reconstruction',      icon: Cpu,          active: false },
  { id: 'truth-check',   label: 'Truth Check',         icon: ShieldCheck,  active: true  },
  { id: 'intelligence',  label: 'Ocean Intelligence',  icon: BrainCircuit, active: true  },
];

interface SidebarProps {
  activeTab: string;
  onSelectTab: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <aside className="fixed top-0 left-0 h-screen w-16 md:w-64 glass-panel z-30 flex flex-col justify-between py-6 px-2 md:px-4 select-none border-r border-navy-border">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded border border-accent/40 flex items-center justify-center text-accent font-mono text-sm font-bold glow-accent-sm shrink-0">
            OE
          </div>
          <div className="hidden md:block">
            <span className="text-text-heading font-bold tracking-wide text-base leading-none">OceanEmbed</span>
            <div className="text-[10px] font-mono text-text-muted mt-0.5">v0.1.0-alpha</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && item.active;
            return (
              <button
                key={item.id}
                disabled={!item.active}
                onClick={() => item.active && onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
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
                  <span className="hidden md:inline truncate font-medium text-xs">
                    {item.label}
                  </span>
                </div>
                {isActive && (
                  <span className="hidden md:block w-1.5 h-1.5 rounded-full bg-accent glow-accent-sm shrink-0" />
                )}
                {!item.active && (
                  <span className="hidden md:inline-block text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-navy-border/30 text-text-muted/30 bg-navy-deep/30 select-none">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="px-2 pt-4 border-t border-navy-border hidden md:flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>SYSTEM ONLINE</span>
        </div>
        <div className="text-[10px] text-text-muted/50 font-mono leading-tight">
          Bay of Bengal · Arabian Sea<br />
          0.25° · 15 depth levels
        </div>
      </div>
    </aside>
  );
};
