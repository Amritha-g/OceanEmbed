import React from 'react';
import { ArrowLeft, BrainCircuit, TrendingUp, AlertCircle, Info, Zap } from 'lucide-react';

interface OceanIntelligenceProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
}

const INDICATORS = [
  {
    id: '01', icon: AlertCircle, iconColor: 'text-amber-400',
    title: 'Marine Heat Anomaly', value: 'MODERATE', unit: '',
    valueColor: 'text-amber-400', valueGlow: 'text-shadow-amber',
    badge: 'ANOMALY DETECTED', badgeClass: 'text-amber-400 border-amber-500/30 bg-amber-500/8',
    meta: [['DEPTH RANGE', '0m – 150m'], ['SOURCE', 'GLORYS12 + OSTIA SST']],
  },
  {
    id: '02', icon: TrendingUp, iconColor: 'text-accent',
    title: 'Upper Ocean Heat Content', value: '+18%', unit: '',
    valueColor: 'text-accent', valueGlow: 'text-glow',
    badge: 'ABOVE BASELINE', badgeClass: 'text-accent border-accent/30 bg-accent/8',
    meta: [['BASELINE REF', '10-yr seasonal avg'], ['LAYER', '0 – 300 m integral']],
  },
  {
    id: '03', icon: Zap, iconColor: 'text-violet-400',
    title: 'Stratification Index', value: '2.41', unit: '°C/100m',
    valueColor: 'text-violet-400', valueGlow: '',
    badge: 'STRONG', badgeClass: 'text-violet-400 border-violet-500/30 bg-violet-500/8',
    meta: [['THERMOCLINE', '~70 m depth'], ['TREND', 'Deepening seasonally']],
  },
  {
    id: '04', icon: TrendingUp, iconColor: 'text-emerald-400',
    title: 'Mixed Layer Depth', value: '68', unit: 'm',
    valueColor: 'text-emerald-400', valueGlow: '',
    badge: 'STABLE', badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8',
    meta: [['METHOD', 'Δσθ = 0.03 kg/m³'], ['INTERP', 'OceanEmbed profile']],
  },
];

export const OceanIntelligence: React.FC<OceanIntelligenceProps> = ({ coordinates, onBackToExplorer }) => {
  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-14 glass-panel border-b border-navy-border px-5 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-all bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30">
            <ArrowLeft className="w-3.5 h-3.5" /><span>Explorer</span>
          </button>
          <div className="h-4 w-px bg-navy-border" />
          <span className="text-[10px] font-mono text-text-muted">LOCATION:</span>
          <span className="font-mono text-xs text-accent font-bold text-glow">
            {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-navy-deep/80 px-3 py-1 rounded-lg border border-navy-border text-[10px] font-mono text-text-muted">
          <Info className="w-3 h-3 text-accent" /><span>SYNTHETIC DERIVED METRICS</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto w-full">
          {/* Page title */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl glass-card border border-navy-border text-accent shadow-glow-sm">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-heading">Ocean Intelligence Indicators</h1>
              <p className="text-xs text-text-muted mt-0.5">AI-derived physical indices from subsurface temperature reconstructions</p>
            </div>
          </div>

          {/* Indicator grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {INDICATORS.map(ind => {
              const Icon = ind.icon;
              return (
                <div key={ind.id}
                  className="glass-card border border-navy-border rounded-xl p-6 flex flex-col relative overflow-hidden group">
                  {/* Glow orb */}
                  <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)' }} />

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">INDICATOR {ind.id}</span>
                    <Icon className={`w-4 h-4 ${ind.iconColor}`} />
                  </div>
                  <h2 className="text-sm font-semibold text-text-heading mb-4">{ind.title}</h2>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className={`font-mono text-3xl font-bold tracking-tight ${ind.valueColor} ${ind.valueGlow}`}>{ind.value}</span>
                    {ind.unit && <span className="text-xs font-mono text-text-muted">{ind.unit}</span>}
                    <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border ${ind.badgeClass}`}>{ind.badge}</span>
                  </div>
                  <div className="pt-4 border-t border-navy-border mt-auto space-y-1">
                    {ind.meta.map(([k,v]) => (
                      <div key={k} className="flex justify-between text-[10px] font-mono">
                        <span className="text-text-muted">{k}:</span>
                        <span className="text-text-body">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center text-[11px] font-mono text-text-muted/50 border-t border-navy-border/40 pt-4">
            Decision-support indicator — not an operational forecast · OceanEmbed v0.1.0-alpha
          </div>
        </div>
      </div>
    </div>
  );
};
