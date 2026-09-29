import { useEffect, useState } from 'react';
import { ActiveRegion } from '../utils/oceanPhysics';
import { DataSource, DEFAULT_DATE, fetchProfile, ReconstructResponse } from '../utils/api';

export type NeuralStatus = 'idle' | 'loading' | 'live' | 'offline';

export function useNeuralProfile(
  lat: number,
  lng: number,
  region?: ActiveRegion,
  date = DEFAULT_DATE,
  source: DataSource = 'archive',
) {
  const [result, setResult] = useState<ReconstructResponse | null>(null);
  const [status, setStatus] = useState<NeuralStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Drop the previous point's result so it is never shown against the new coordinates
    setResult(null);
    setStatus('loading');
    setError(null);
    fetchProfile(lat, lng, region, date, source)
      .then((r: ReconstructResponse) => {
        if (cancelled) return;
        setResult(r);
        setStatus('live');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setResult(null);
        setStatus('offline');
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, region, date, source]);

  return { result, status, error };
}
