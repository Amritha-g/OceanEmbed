import { ActiveRegion, SurfaceInputs } from './oceanPhysics';

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL) ?? '/api/v1';

export interface ReconstructResponse {
  depths_m: number[];
  temperatures: number[];
  /** GLORYS12 reanalysis profile at the same grid cell/day; null below the seafloor or outside the domain */
  truth: Array<number | null> | null;
  valid_depths: boolean[];
  seafloor_depth_m: number | null;
  /** Per-depth test RMSE (°C), usable as a ±1σ band */
  uncertainty_c: number[] | null;
  embedding: number[];
  embedding_dim: number;
  surface: SurfaceInputs & { lat: number; lng: number; doy: number };
  date?: string;
  date_exact: boolean;
  region?: string;
  source: 'neural';
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
): Promise<ReconstructResponse> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), date });
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
): Promise<ReconstructResponse> {
  const res = await fetch(`${API_BASE}/reconstruct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, date, region, surface }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reconstruction failed (${res.status}): ${text}`);
  }
  return res.json();
}
