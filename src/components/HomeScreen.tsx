import React from 'react';
import { WireframeGlobe } from './3d/WireframeGlobe';

interface HomeScreenProps {
  onExplore: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onExplore }) => {
  return (
    <div className="relative w-full h-screen bg-navy-deep overflow-hidden flex flex-col justify-center items-center px-6">
      {/* Background 3D Anchor */}
      <WireframeGlobe />

      {/* Foreground Content Card */}
      <div className="relative z-10 max-w-2xl text-center glass-panel p-8 md:p-12 rounded-lg border border-navy-border flex flex-col items-center">
        <div className="inline-block font-mono text-xs uppercase tracking-widest text-accent mb-4 px-3 py-1 rounded bg-navy-deep/80 border border-accent/20">
          SYSTEM INFRASTRUCTURE // DEEP OCEAN AI
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-text-heading tracking-tight mb-4 font-sans">
          OceanEmbed
        </h1>

        <p className="text-text-body text-base md:text-lg font-normal mb-8 leading-relaxed max-w-xl font-sans">
          AI reconstruction of subsurface ocean temperature from surface satellite observations
        </p>

        <button
          onClick={onExplore}
          className="bg-accent text-navy-deep font-semibold px-6 py-3 rounded text-sm hover:bg-opacity-90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-navy-deep font-sans"
        >
          Explore Ocean
        </button>
      </div>

      {/* Footer Readouts (using font-mono ONLY for numeric/data metrics) */}
      <div className="absolute bottom-6 right-6 z-10 hidden md:flex items-center gap-6 text-xs text-text-muted font-mono">
        <div>
          <span className="text-text-muted">LAT/LON: </span>
          <span className="text-accent">00.0000° N, 00.0000° E</span>
        </div>
        <div>
          <span className="text-text-muted">GRID RESOLUTION: </span>
          <span className="text-accent">0.25° x 0.25°</span>
        </div>
      </div>
    </div>
  );
};
