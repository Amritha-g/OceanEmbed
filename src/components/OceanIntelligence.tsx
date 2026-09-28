import React from 'react';
import { ArrowLeft, BrainCircuit, TrendingUp, AlertCircle, Info, Zap, Waves, Compass, Cpu, CheckCircle2, Activity } from 'lucide-react';
import {
  ActiveRegion,
  REGION_CONFIGS,
  getPhysicalVariables,
} from '../utils/oceanPhysics';
import { useModelMetrics } from '../hooks/useModelMetrics';

interface OceanIntelligenceProps {
  coordinates: { lat: number; lng: number };
  region?: ActiveRegion;
  onBackToExplorer: () => void;
  onNavigateTo?: (view: any, coords?: { lat: number; lng: number }) => void;
}

export const OceanIntelligence: React.FC<OceanIntelligenceProps> = ({
  coordinates,
  region = 'bob',
  onBackToExplorer,
}) => {
  const regionData = REGION_CONFIGS[region];
  const activeVars = getPhysicalVariables(coordinates.lat, coordinates.lng, region);
  const { metrics, status: metricsStatus } = useModelMetrics();

  const isBoB = region === 'bob';

  const indicators = [
    {
      id: '01',
      icon: AlertCircle,
      iconColor: activeVars.heatwaveStatus === 'HIGH HAZARD' ? 'text-rose-400' : 'text-amber-400',
      title: 'Marine Heat Anomaly',
      value: activeVars.anomalyDelta,
      unit: '',
      valueColor: activeVars.heatwaveStatus === 'HIGH HAZARD' ? 'text-rose-400' : 'text-amber-400',
      valueGlow: 'text-glow',
      badge: activeVars.heatwaveStatus,
      badgeClass:
        activeVars.heatwaveStatus === 'HIGH HAZARD'
          ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
          : 'text-amber-400 border-amber-500/30 bg-amber-500/8',
      meta: [
        ['SST READOUT', `${activeVars.sst} °C`],
        ['SOURCE', 'OSTIA L4 + Daily Reanalysis'],
        ['IMPACT', isBoB ? 'Intensifies cyclogenesis potential' : 'Warm pool expanding offshore'],
      ],
    },
    {
      id: '02',
      icon: TrendingUp,
      iconColor: 'text-accent',
      title: 'Upper Ocean Heat Content (OHC)',
      value: `${activeVars.ohc}`,
      unit: 'kJ/cm²',
      valueColor: 'text-accent',
      valueGlow: 'text-glow',
      badge: activeVars.ohc > 80 ? 'ELEVATED TCHP' : 'NORMAL RANGE',
      badgeClass: 'text-accent border-accent/30 bg-accent/8',
      meta: [
        ['INTEGRAL LAYER', '0 – 300 m thermal pool'],
        ['BASELINE REF', '10-yr Indian Ocean climatology'],
        ['CYCLONE FUEL', activeVars.ohc > 75 ? 'Sufficient for Cat-2+ genesis' : 'Moderate heat storage'],
      ],
    },
    {
      id: '03',
      icon: Zap,
      iconColor: 'text-violet-400',
      title: 'Stratification & Barrier Layer',
      value: activeVars.stratification,
      unit: '°C/100m',
      valueColor: 'text-violet-400',
      valueGlow: '',
      badge: isBoB ? 'FRESHWATER BARRIER' : 'HIGH EVAPORATION',
      badgeClass: 'text-violet-400 border-violet-500/30 bg-violet-500/8',
      meta: [
        ['SURFACE SALINITY', `${activeVars.sss} PSU`],
        ['HALOCLINE EFFECT', isBoB ? 'River discharge inhibits mixing' : 'Saline ASHSW water mass'],
        ['THERMOCLINE GRADIENT', `~${(parseFloat(activeVars.stratification) * 0.8).toFixed(2)} °C/50m`],
      ],
    },
    {
      id: '04',
      icon: Waves,
      iconColor: 'text-emerald-400',
      title: 'Mixed Layer Depth (MLD)',
      value: `${activeVars.mld}`,
      unit: 'm',
      valueColor: 'text-emerald-400',
      valueGlow: '',
      badge: activeVars.mld < 35 ? 'SHALLOW MIXING' : 'MODERATE DEPTH',
      badgeClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8',
      meta: [
        ['CRITERION', 'Δσθ = 0.03 kg/m³ threshold'],
        ['PROFILE ORIGIN', 'OceanEmbed Reconstructed column'],
        ['WIND STRESS EFFECT', `Wind speed: ${activeVars.wind} m/s`],
      ],
    },
  ];

  return (
    <div className="w-full h-screen bg-navy-deep flex flex-col overflow-hidden text-text-body select-none">
      {/* Header */}
      <header className="h-14 glass-panel border-b border-navy-border px-6 md:px-8 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToExplorer}
            className="flex items-center gap-1.5 text-xs text-text-body hover:text-accent font-medium transition-all bg-navy-deep/80 px-3 py-1.5 rounded-lg border border-navy-border hover:border-accent/30"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Map Explorer</span>
          </button>
          
          <div className="h-4 w-px bg-navy-border" />
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">BASIN:</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
              {regionData.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">LOCATION:</span>
            <span className="font-mono text-xs text-accent font-bold text-glow">
              {coordinates.lat.toFixed(4)}°N, {coordinates.lng.toFixed(4)}°E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-navy-deep/80 px-3 py-1 rounded-lg border border-navy-border text-[10px] font-mono text-text-muted">
            <Info className="w-3 h-3 text-accent" />
            <span>PHYSICALLY SYNCHRONIZED INDICES</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto w-full space-y-6">
          {/* Page title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl glass-card border border-navy-border text-accent shadow-glow-sm">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-heading">Ocean Intelligence Indicators</h1>
                <p className="text-xs text-text-muted mt-0.5">
                  AI-derived oceanographic indices computed from the live map state of {regionData.name}
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl glass-card border border-cyan-500/20 text-xs font-mono text-cyan-300">
              <Compass className="w-3.5 h-3.5" />
              <span>Current: {activeVars.current} m/s</span>
            </div>
          </div>

          {/* Basin Real-time Overview Banner */}
          <div className="glass-card p-4 rounded-xl border border-cyan-500/25 bg-[#061226]/80 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Active Cyclone Track: {regionData.cyclone.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {regionData.cyclone.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Central pressure: {regionData.cyclone.pressure} · Max sustained winds: {regionData.cyclone.maxWind} · Radius: {regionData.cyclone.radiusKm} km
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="px-3 py-1.5 rounded-lg bg-[#030914] border border-cyan-500/20 text-slate-300">
                <span className="text-slate-500">Surface Wind: </span>
                <span className="text-cyan-300 font-bold">{activeVars.wind} m/s</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-[#030914] border border-cyan-500/20 text-slate-300">
                <span className="text-slate-500">ARGO Array: </span>
                <span className="text-cyan-300 font-bold">{regionData.argoFloats.length} Floats Active</span>
              </div>
            </div>
          </div>

          {/* Indicator grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {indicators.map((ind) => {
              const Icon = ind.icon;
              return (
                <div
                  key={ind.id}
                  className="glass-card border border-navy-border rounded-xl p-6 flex flex-col relative overflow-hidden group hover:border-cyan-500/30 transition-all duration-300"
                >
                  {/* Glow orb */}
                  <div
                    className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)' }}
                  />

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                      INDICATOR {ind.id}
                    </span>
                    <Icon className={`w-4 h-4 ${ind.iconColor}`} />
                  </div>
                  <h2 className="text-sm font-semibold text-text-heading mb-4">{ind.title}</h2>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className={`font-mono text-3xl font-bold tracking-tight ${ind.valueColor} ${ind.valueGlow}`}>
                      {ind.value}
                    </span>
                    {ind.unit && <span className="text-xs font-mono text-text-muted">{ind.unit}</span>}
                    <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border ${ind.badgeClass}`}>
                      {ind.badge}
                    </span>
                  </div>
                  <div className="pt-4 border-t border-navy-border mt-auto space-y-1">
                    {ind.meta.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[10px] font-mono">
                        <span className="text-text-muted">{k}:</span>
                        <span className="text-text-body font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── AI Engine Live Panel ── */}
          <div className="glass-card border border-navy-border rounded-xl p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-text-heading">OceanEmbed AI Engine</span>
              </div>
              <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg border ${
                metricsStatus === 'live'
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                  : metricsStatus === 'loading'
                  ? 'text-amber-400 border-amber-500/30 bg-amber-500/10 animate-pulse'
                  : 'text-text-muted border-navy-border bg-navy-deep/60'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  metricsStatus === 'live' ? 'bg-emerald-400 animate-pulse' :
                  metricsStatus === 'loading' ? 'bg-amber-400 animate-pulse' :
                  'bg-slate-500'
                }`} />
                {metricsStatus === 'live' ? 'LIVE MODEL' : metricsStatus === 'loading' ? 'CONNECTING...' : 'OFFLINE — Physics Mode'}
              </div>
            </div>

            {metricsStatus === 'live' && metrics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Summary stats */}
                <div className="space-y-3">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Validation Metrics · Bay of Bengal</p>
                  {[
                    { label: 'OVERALL RMSE', value: `${metrics.validation?.overall.rmse?.toFixed(4) ?? metrics.model?.val_rmse_c?.toFixed(4)} °C`, color: 'text-emerald-400' },
                    { label: 'OVERALL MAE', value: `${metrics.validation?.overall.mae?.toFixed(4) ?? metrics.model?.val_mae_c?.toFixed(4)} °C`, color: 'text-accent' },
                    { label: 'PEARSON CORR', value: metrics.validation?.overall.corr?.toFixed(4) ?? '—', color: 'text-violet-400' },
                    { label: 'BIAS', value: `${(metrics.validation?.overall.bias ?? 0) >= 0 ? '+' : ''}${metrics.validation?.overall.bias?.toFixed(4) ?? '—'} °C`, color: 'text-slate-300' },
                    { label: 'TRAINING EPOCHS', value: `${metrics.epochs ?? metrics.model?.epoch ?? '—'}`, color: 'text-cyan-400' },
                    { label: 'MODEL PARAMETERS', value: metrics.model?.parameters ? `${(metrics.model.parameters / 1000).toFixed(0)}K` : '—', color: 'text-slate-300' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between text-[11px] font-mono">
                      <span className="text-text-muted">{label}:</span>
                      <span className={`font-semibold ${color}`}>{value}</span>
                    </div>
                  ))}

                  {metrics.validation?.overall.meets_sih_target && (
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/8 px-3 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Meets SIH RMSE target (&lt; 0.50 °C)</span>
                    </div>
                  )}
                </div>

                {/* Per-depth accuracy bars */}
                <div className="space-y-2">
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Per-Depth RMSE</p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {(metrics.validation?.per_depth ?? []).map((d) => {
                      const pct = Math.min(100, (d.rmse / 0.5) * 100);
                      const color = d.rmse < 0.25 ? 'bg-emerald-500' : d.rmse < 0.4 ? 'bg-amber-500' : 'bg-rose-500';
                      return (
                        <div key={d.depth_m} className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="w-12 text-right text-text-muted shrink-0">{d.depth_m} m</span>
                          <div className="flex-1 h-1.5 bg-navy-deep rounded-full border border-navy-border/40 overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-14 text-right text-accent">{d.rmse.toFixed(3)} °C</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : metricsStatus === 'offline' ? (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-navy-deep/60 border border-amber-500/20 text-xs text-text-muted">
                <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-medium mb-1">Backend not reachable</p>
                  <p>Start the FastAPI server to stream live model metrics:</p>
                  <code className="block mt-2 font-mono text-[10px] bg-navy-deep px-3 py-2 rounded border border-navy-border text-accent">
                    uvicorn api.main:app --host 0.0.0.0 --port 8000
                  </code>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-text-muted animate-pulse">
                <Cpu className="w-4 h-4" />
                <span>Connecting to OceanEmbed inference API…</span>
              </div>
            )}
          </div>

          <div className="text-center text-[11px] font-mono text-text-muted/50 border-t border-navy-border/40 pt-4">
            Decision-support indicator synchronized with OceanEmbed 0.25° subsurface reconstruction · v0.1.0-alpha
          </div>
        </div>
      </div>
    </div>
  );
};
