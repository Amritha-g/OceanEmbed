import { useEffect, useState } from 'react';
import { ArgoMatchup, ArgoSummary, fetchArgo } from '../utils/api';

export type ArgoStatus = 'loading' | 'live' | 'offline';

/** Real ARGO float matchups and the benchmark summary from the API (fetched once). */
export function useArgo() {
  const [profiles, setProfiles] = useState<ArgoMatchup[]>([]);
  const [summary, setSummary] = useState<ArgoSummary | null>(null);
  const [status, setStatus] = useState<ArgoStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchArgo()
      .then((r) => {
        if (cancelled) return;
        setProfiles(r.profiles);
        setSummary(r.summary);
        setStatus('live');
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { profiles, summary, status };
}
