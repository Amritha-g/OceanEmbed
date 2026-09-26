import React from 'react';

export const OceanExplorerPlaceholder: React.FC = () => {
  return (
    <div className="w-full h-screen bg-navy-deep flex items-center justify-center p-6">
      <div className="glass-panel p-8 rounded-lg border border-navy-border max-w-md text-center">
        <div className="font-mono text-xs text-accent uppercase tracking-wider mb-2">
          MODULE // OCEAN EXPLORER
        </div>
        <h2 className="text-2xl font-bold text-text-heading mb-2">
          Ocean Explorer
        </h2>
        <p className="text-text-body text-sm mb-6">
          Ocean Explorer interface placeholder. Awaiting Phase 2 implementation.
        </p>
        <div className="font-mono text-xs text-text-muted bg-navy-deep/80 py-2 px-4 rounded border border-navy-border inline-block">
          STATUS: READY FOR NEXT PHASE
        </div>
      </div>
    </div>
  );
};
