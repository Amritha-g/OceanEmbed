import React from 'react';
import { ArrowLeft, BrainCircuit, TrendingUp, AlertCircle, Info } from 'lucide-react';

interface OceanIntelligenceProps {
  coordinates: { lat: number; lng: number };
  onBackToExplorer: () => void;
}

export const OceanIntelligence: React.FC<OceanIntelligenceProps> = ({
  coordinates,
  onBackToExplorer,
}) => {
  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Top Header */}
      <header className="h-16 glass-panel border-b border-navy-border px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-colors bg-navy-deep/80 px-3 py-1.5 rounded border border-navy-border"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ocean Explorer</span>
          </button>
          <div className="h-4 w-[1px] bg-navy-border"></div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-muted">LOCATION:</span>
            <span className="font-mono text-xs text-accent font-semibold">
              {coordinates.lat.toFixed(4)}° N, {coordinates.lng.toFixed(4)}° E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-navy-deep/80 px-3 py-1 rounded border border-navy-border text-[11px] font-mono text-text-muted">
          <Info className="w-3 h-3 text-accent flex-shrink-0" />
          <span>SYNTHETIC DERIVED METRICS</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 p-8 flex flex-col justify-between max-w-5xl mx-auto w-full">
        <div>
          {/* Page Title Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-lg glass-panel border border-navy-border text-accent">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-heading font-sans">
                Ocean Intelligence Indicators
              </h1>
              <p className="text-xs text-text-muted font-sans">
                Derived physical indices derived from AI subsurface temperature reconstructions
              </p>
            </div>
          </div>

          {/* Indicator Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Card 1: Marine Heat Anomaly */}
            <div className="glass-panel border border-navy-border rounded-lg p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                  INDICATOR 01
                </span>
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>

              <h2 className="text-base font-semibold text-text-heading mb-4 font-sans">
                Marine Heat Anomaly
              </h2>

              <div className="my-2 flex items-baseline gap-3">
                <span className="font-mono text-3xl font-bold text-amber-400 tracking-tight">
                  MODERATE
                </span>
                <span className="text-xs font-mono text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  ANOMALY DETECTED
                </span>
              </div>

              <div className="pt-4 border-t border-navy-border mt-4 flex justify-between items-center text-xs font-mono">
                <span className="text-text-muted">AFFECTED DEPTH RANGE:</span>
                <span className="text-accent font-medium">0m – 150m</span>
              </div>
            </div>

            {/* Card 2: Upper Ocean Heat Content */}
            <div className="glass-panel border border-navy-border rounded-lg p-6 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                  INDICATOR 02
                </span>
                <TrendingUp className="w-4 h-4 text-accent" />
              </div>

              <h2 className="text-base font-semibold text-text-heading mb-4 font-sans">
                Upper Ocean Heat Content
              </h2>

              <div className="my-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-accent tracking-tight flex items-center gap-1">
                  <span className="text-xl">↑</span> +18%
                </span>
                <span className="text-xs font-mono text-text-muted">vs. BASELINE</span>
              </div>

              <div className="pt-4 border-t border-navy-border mt-4 flex justify-between items-center text-xs font-mono">
                <span className="text-text-muted">CONTEXT:</span>
                <span className="text-text-body font-sans text-[11px]">
                  Relative to 10-year seasonal baseline
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Disclosure Line */}
        <div className="pt-6 border-t border-navy-border/60 text-center font-mono text-xs text-text-muted/70">
          Decision-support indicator — not an operational forecast
        </div>
      </div>
    </div>
  );
};
