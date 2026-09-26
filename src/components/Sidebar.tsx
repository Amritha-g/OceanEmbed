import React from 'react';
import { Compass, Waves, Cpu, ShieldCheck, BrainCircuit } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}

const navItems: NavItem[] = [
  { id: 'explorer', label: 'Ocean Explorer', icon: Compass, active: true },
  { id: 'dive', label: 'OceanDive', icon: Waves, active: true },
  { id: 'reconstruction', label: 'Reconstruction', icon: Cpu, active: false },
  { id: 'truth-check', label: 'Truth Check', icon: ShieldCheck, active: false },
  { id: 'intelligence', label: 'Ocean Intelligence', icon: BrainCircuit, active: false },
];

interface SidebarProps {
  activeTab: string;
  onSelectTab: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  return (
    <aside className="fixed top-0 left-0 h-screen w-16 md:w-64 glass-panel z-30 flex flex-col justify-between py-6 px-2 md:px-4 select-none">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="w-8 h-8 rounded border border-accent flex items-center justify-center text-accent font-mono text-sm font-semibold">
            OE
          </div>
          <span className="hidden md:inline text-text-heading font-semibold tracking-wide text-lg">
            OceanEmbed
          </span>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1.5" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && item.active;

            return (
              <button
                key={item.id}
                disabled={!item.active}
                onClick={() => item.active && onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-accent-glow text-accent border border-accent-muted'
                    : item.active
                    ? 'text-text-body hover:text-text-heading hover:bg-navy-panel'
                    : 'text-text-muted opacity-45 cursor-not-allowed'
                }`}
                title={!item.active ? `${item.label} (Coming soon)` : item.label}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="hidden md:inline truncate font-medium">
                    {item.label}
                  </span>
                </div>

                {!item.active && (
                  <span className="hidden md:inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-navy-border/40 text-text-muted/40 bg-navy-deep/30 select-none">
                    Coming soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer System Status */}
      <div className="px-2 pt-4 border-t border-navy-border text-xs text-text-muted hidden md:flex flex-col gap-1 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
          <span>SYSTEM ONLINE</span>
        </div>
        <span className="text-[11px] opacity-75">v0.1.0-alpha</span>
      </div>
    </aside>
  );
};
