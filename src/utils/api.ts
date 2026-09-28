import { ActiveRegion, getSurfaceInputs, SurfaceInputs } from './oceanPhysics';

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL) ?? '/api/v1';

export interface ReconstructResponse {
  depths_m: number[];
  temperatures: number[];
  embedding: number[];
  embedding_dim: number;
  surface: SurfaceInputs & { doy: number };
  date?: string;
  region?: string;
  source: 'neural';
  surface_synthesized: boolean;
  model: {
    name: string;
    architecture: string;
    parameters: number;
    val_rmse_c: number | null;
    val_mae_c: number | null;
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

export async function reconstructPoint(
  lat: number,
  lng: number,
  region: ActiveRegion,
  date = '2024-03-15',
): Promise<ReconstructResponse> {
  const surface = getSurfaceInputs(lat, lng, region, date);
  const res = await fetch(`${API_BASE}/reconstruct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lng,
      date,
      region,
      sst: surface.sst,
      sss: surface.sss,
      sla: surface.sla,
      u_cur: surface.u_cur,
      v_cur: surface.v_cur,
      u_wind: surface.u_wind,
      v_wind: surface.v_wind,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reconstruction failed (${res.status}): ${text}`);
  }
  return res.json();
}
