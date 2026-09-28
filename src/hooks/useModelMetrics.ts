import { useEffect, useState } from 'react';
import { fetchMetrics, MetricsResponse } from '../utils/api';

export type MetricsStatus = 'idle' | 'loading' | 'live' | 'offline';

export function useModelMetrics() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [status, setStatus] = useState<MetricsStatus>('idle');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchMetrics().then((data) => {
      if (cancelled) return;
      if (data) {
        setMetrics(data);
        setStatus('live');
      } else {
        setStatus('offline');
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { metrics, status };
}
