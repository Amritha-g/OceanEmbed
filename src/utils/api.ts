import { ActiveRegion, SurfaceInputs } from './oceanPhysics';

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL) ?? '/api/v1';

export type DataSource = 'archive' | 'live';

export interface FieldLineage {
  source: string;
  /** Day (archive) or observation time (live); null for synthetic or client values */
  date: string | null;
  live: boolean;
}

export type SurfaceField = keyof SurfaceInputs;

export interface ReconstructResponse {
  depths_m: number[];
  temperatures: number[];
  /** GLORYS12 reanalysis profile at the same grid cell/day; null below the seafloor or outside the domain */
  truth: Array<number | null> | null;
  valid_depths: boolean[];
  seafloor_depth_m: number | null;
  /** Calibrated ensemble ±1σ (°C) at this cell and depth */
  uncertainty_c: number[] | null;
  products: ProfileProducts;
  embedding: number[];
  embedding_dim: number;
  surface: SurfaceInputs & { lat: number; lng: number; doy: number };
  date?: string;
  date_exact: boolean;
  region?: string;
  source: 'neural';
  source_mode: DataSource;
  lineage: Record<SurfaceField, FieldLineage>;
  /** Live mode only: fields Open-Meteo actually returned */
  live_fields?: SurfaceField[];
  warning?: string;
  inference_latency_ms: number;
  in_domain: boolean;
  surface_synthesized: boolean;
  grid_point: { lat: number; lng: number; snap_km: number } | null;
  model: {
    name: string;
    architecture: string;
    parameters: number;
    val_rmse_c: number | null;
    val_mae_c: number | null;
    test_rmse_c: number | null;
    test_mae_c: number | null;
    epoch: number | null;
    trained: boolean;
    device: string;
  };
}

export interface ProfileProducts {
  mld_m: number | null;
  d26_m: number | null;
  tchp_kj_cm2: number | null;
  sld_m: number | null;
  below_layer_gradient_ms_per_100m: number | null;
  sound_speed_ms: Array<number | null>;
  salinity_assumed_psu: Array<number | null>;
}

type ErrStats = { n: number; rmse: number | null; mae: number | null; bias: number | null };
export type ArgoPredictor = 'model' | 'glorys' | 'climatology' | 'persistence';
type ArgoBlock = {
  overall: Record<ArgoPredictor, ErrStats>;
  per_depth: Array<{ depth_m: number } & Record<ArgoPredictor, ErrStats>>;
};

export interface ArgoSummary extends ArgoBlock {
  source: string;
  n_profiles: number;
  n_floats: number;
  n_profiles_test: number;
  test: ArgoBlock;
  all_days: ArgoBlock;
  coverage: { nominal: number; all_days: number | null; test: number | null };
}

export interface ArgoMatchup {
  platform: string;
  cycle: number;
  time: string;
  date: string;
  data_mode: string;
  lat: number;
  lon: number;
  split: 'train' | 'val' | 'test';
  grid_point: { lat: number; lng: number };
  depths_m: number[];
  argo: Array<number | null>;
  argo_psal: Array<number | null>;
  model: Array<number | null>;
  sigma: Array<number | null>;
  glorys: Array<number | null>;
}

export type ProductVar = 'tchp' | 'd26' | 'mld' | 'sld' | 'sigma100';

export interface ProductGrid {
  var: ProductVar;
  name: string;
  units: string;
  date: string;
  lat: number[];
  lon: number[];
  values: Array<Array<number | null>>;
  stats: { min: number | null; max: number | null; mean: number | null };
  thresholds: { watch: number; high: number } | null;
}

export interface MetricsResponse {
  model: ReconstructResponse['model'];
  train_log?: {
    train_loss: number[];
    val_rmse: number[];
    val_mae: number[];
  };
  best_val_rmse?: number;
  final_val_rmse?: number;
  epochs?: number;
  validation?: {
    split?: { method: string; train: [string, string]; val: [string, string]; test: [string, string] };
    baselines?: Record<string, { rmse: number; mae: number; bias: number; corr: number }>;
    overall: { rmse: number; mae: number; bias: number; corr: number; meets_sih_target: boolean };
    per_depth: Array<{ depth_m: number; rmse: number; mae: number; bias: number; corr: number }>;
    ensemble?: { n_members: number; member_test_rmse: number[] };
    calibration?: {
      test_glorys: { nominal: number; overall: number; per_depth: number[] };
      argo?: { nominal: number; all_days: number | null; test: number | null };
    };
    importance?: {
      method: string;
      channels: string[];
      depths_m: number[];
      base_rmse: number[];
      delta_rmse: number[][];
    };
    argo?: ArgoSummary;
  };
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return body.status === 'ok' && body.model_loaded === true;
  } catch {
    return false;
  }
}

export async function fetchMetrics(): Promise<MetricsResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const DEFAULT_DATE = '2024-03-15';

export async function fetchProfile(
  lat: number,
  lng: number,
  region?: ActiveRegion,
  date = DEFAULT_DATE,
  source: DataSource = 'archive',
): Promise<ReconstructResponse> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), date, source });
  if (region) params.set('region', region);
  const res = await fetch(`${API_BASE}/profile?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Profile request failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Reconstruct with user-supplied surface values; omitted fields come from the satellite grid. */
export async function reconstructPoint(
  lat: number,
  lng: number,
  region: ActiveRegion,
  date = DEFAULT_DATE,
  surface: Partial<SurfaceInputs> = {},
  source: DataSource = 'archive',
): Promise<ReconstructResponse> {
  const res = await fetch(`${API_BASE}/reconstruct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, date, region, surface, source }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reconstruction failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** "Open-Meteo · 2026-09-29 14:45 (live)" / "GLORYS12 (Copernicus) · 2024-03-31" */
export function describeLineage(l?: FieldLineage): string | undefined {
  if (!l) return undefined;
  const when = l.date ? ` · ${l.date.replace('T', ' ')}` : '';
  return `${l.source}${when}${l.live ? ' (live)' : ''}`;
}

export const BULLETIN_URL = `${API_BASE}/bulletin`;

export async function fetchProductGrid(variable: ProductVar, date = DEFAULT_DATE): Promise<ProductGrid> {
  const res = await fetch(`${API_BASE}/products?${new URLSearchParams({ var: variable, date })}`);
  if (!res.ok) throw new Error(`Product request failed (${res.status})`);
  return res.json();
}

export async function fetchArgo(): Promise<{ summary: ArgoSummary | null; profiles: ArgoMatchup[] }> {
  const res = await fetch(`${API_BASE}/argo`);
  if (!res.ok) throw new Error(`ARGO request failed (${res.status})`);
  return res.json();
}
