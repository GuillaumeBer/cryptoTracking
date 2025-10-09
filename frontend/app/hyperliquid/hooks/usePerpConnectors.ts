'use client';

import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '@/lib/api-config';
import type { PerpConnectorMode, PerpConnectorResult, PerpConnectorSummary } from '../types';

interface UsePerpConnectorsResult {
  connectors: PerpConnectorResult[];
  summaries: PerpConnectorSummary[];
  mode: PerpConnectorMode;
  loading: boolean;
  error: string | null;
  refresh: (mode?: PerpConnectorMode) => Promise<void>;
}

const REFRESH_INTERVAL_MS = 60_000;

export function usePerpConnectors(): UsePerpConnectorsResult {
  const [connectors, setConnectors] = useState<PerpConnectorResult[]>([]);
  const [summaries, setSummaries] = useState<PerpConnectorSummary[]>([]);
  const [mode, setMode] = useState<PerpConnectorMode>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = useCallback(
    async (nextMode: PerpConnectorMode = 'auto') => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(endpoints.perpConnectors(nextMode));

        if (!response.ok) {
          throw new Error(`Failed to fetch connectors: ${response.statusText}`);
        }

        const data = await response.json();
        setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
        setSummaries(Array.isArray(data.summary) ? data.summary : []);
        setMode((data.mode as PerpConnectorMode | undefined) ?? nextMode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load perp connectors');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchConnectors('auto');
    const interval = setInterval(() => {
      void fetchConnectors('auto');
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [fetchConnectors]);

  const refresh = useCallback(
    async (nextMode?: PerpConnectorMode) => {
      await fetchConnectors(nextMode ?? mode);
    },
    [fetchConnectors, mode],
  );

  return { connectors, summaries, mode, loading, error, refresh };
}
