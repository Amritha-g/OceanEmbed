import React from 'react';
import { DataSource } from '../utils/api';

interface SourceToggleProps {
  value: DataSource;
  onChange: (source: DataSource) => void;
}

/** Switch between the validated 2024 satellite archive and experimental live Open-Meteo inputs. */
export const SourceToggle: React.FC<SourceToggleProps> = ({ value, onChange }) => (
  <div className="flex bg-[#040c1a]/90 p-0.5 rounded-lg border border-navy-border text-[10px] font-mono">
    {([
      ['archive', 'Archive 2024', 'Validated satellite archive with GLORYS12 ground truth'],
      ['live', 'Live (exp.)', 'Current Open-Meteo SST, currents and winds — experimental'],
    ] as const).map(([id, label, title]) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        title={title}
        className={`px-2.5 py-1 rounded transition-all ${
          value === id
            ? id === 'live'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30 font-bold'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-bold'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
);
