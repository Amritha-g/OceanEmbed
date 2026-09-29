import React from 'react';
import { Sparkles } from 'lucide-react';
import { MetricsResponse } from '../utils/api';

type Importance = NonNullable<NonNullable<MetricsResponse['validation']>['importance']>;

const CHANNEL_LABELS: Record<string, string> = {
  sst: 'SST', sss: 'SSS', sla: 'SLA', u_cur: 'Cur U', v_cur: 'Cur V', u_wind: 'Wind U', v_wind: 'Wind V',
};

/** Depth × input heatmap: how much the test RMSE rises when one input is replaced by its mean. */
export const InputImportance: React.FC<{ importance?: Importance }> = ({ importance }) => {
  if (!importance) return null;
  const max = Math.max(0.05, ...importance.delta_rmse.flat());

  return (
    <div className="glass-card border border-navy-border rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-navy-border mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span className="text-xs font-semibold text-text-heading">What drives each depth</span>
        </div>
        <span className="text-[10px] font-mono text-text-muted">
          RMSE increase (°C) when an input is replaced by its mean · test days
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-[10px] font-mono border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left text-text-muted font-normal pr-2">Depth</th>
              {importance.channels.map((c) => (
                <th key={c} className="text-text-muted font-normal px-1 w-14">{CHANNEL_LABELS[c] ?? c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {importance.depths_m.map((z, d) => (
              <tr key={z}>
                <td className="text-text-muted pr-2 text-right">{z} m</td>
                {importance.channels.map((c, k) => {
                  const v = importance.delta_rmse[k][d];
                  const a = Math.max(0, Math.min(1, v / max));
                  return (
                    <td
                      key={c}
                      className="text-center rounded"
                      style={{
                        background: `rgba(251, 146, 60, ${0.08 + a * 0.82})`,
                        color: a > 0.55 ? '#1a0f05' : '#e2e8f0',
                      }}
                      title={`${CHANNEL_LABELS[c] ?? c} at ${z} m: RMSE +${v.toFixed(3)} °C`}
                    >
                      {v >= 0.005 ? v.toFixed(2) : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-text-muted">
        Darker = the reconstruction at that depth relies more on that input. SST controls the mixed layer;
        sea-level anomaly (SLA) moves the thermocline.
      </p>
    </div>
  );
};
