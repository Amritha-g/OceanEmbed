import { useEffect, useState } from 'react';
import { ActiveRegion } from '../utils/oceanPhysics';
import { reconstructPoint, ReconstructResponse } from '../utils/api';

export type NeuralStatus = 'idle' | 'loading' | 'live' | 'offline';

export function useNeuralProfile(lat: number, lng: number, region: ActiveRegion) {
  const [result, setResult] = useState<ReconstructResponse | null>(null);
  const [status, setStatus] = useState<NeuralStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    reconstructPoint(lat, lng, region)
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
  }, [lat, lng, region]);

  return { result, status, error };
}
