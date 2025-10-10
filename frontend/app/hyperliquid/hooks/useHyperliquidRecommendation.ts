'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { endpoints } from '@/lib/api-config';
import type {
  HyperliquidRecommendationPayload,
  HyperliquidRecommendationResponse,
} from '../types';

export interface HyperliquidRecommendationRequestParams {
  candidates?: number;
  minOpenInterestUsd?: number;
  minVolumeUsd?: number;
  notionalUsd?: number;
  tradingCostDaily?: number;
  liquidityBufferPercent?: number;
  targetLeverage?: number;
  maxLeverage?: number;
  maxOiPercent?: number;
  maxVolumePercent?: number;
  liquidityUsd?: number;
}

interface UseHyperliquidRecommendationResult {
  data: HyperliquidRecommendationPayload | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 60_000;

export function useHyperliquidRecommendation(
  address: string,
  params: HyperliquidRecommendationRequestParams,
): UseHyperliquidRecommendationResult {
  const [data, setData] = useState<HyperliquidRecommendationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const normalizedParams = useMemo(() => {
    const sanitized: HyperliquidRecommendationRequestParams = {};

    (Object.keys(params) as (keyof HyperliquidRecommendationRequestParams)[]).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null) {
        return;
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return;
      }
      sanitized[key] = value;
    });

    return sanitized;
  }, [params]);

  const paramsKey = useMemo(() => JSON.stringify(normalizedParams), [normalizedParams]);

  const fetchRecommendation = useCallback(
    async (overrideAddress?: string) => {
      const targetAddress = (overrideAddress ?? address).trim();

      if (!targetAddress) {
        setData(null);
        setLastUpdated(null);
        setError('Please enter a wallet address to generate a recommendation');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          endpoints.hyperliquidRecommendation({ address: targetAddress, ...normalizedParams }),
        );
        const result: HyperliquidRecommendationResponse = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch recommendation');
        }

        setData(result.data ?? null);
        setLastUpdated(new Date());
      } catch (err) {
        setData(null);
        setLastUpdated(null);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    },
    [address, normalizedParams],
  );

  useEffect(() => {
    const trimmedAddress = address.trim();

    if (!trimmedAddress) {
      setData(null);
      setLastUpdated(null);
      setError('Please enter a wallet address to generate a recommendation');
      return;
    }

    void fetchRecommendation(trimmedAddress);

    const interval = setInterval(() => {
      void fetchRecommendation(trimmedAddress);
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [address, fetchRecommendation, paramsKey]);

  const refresh = useCallback(async () => {
    await fetchRecommendation(address);
  }, [address, fetchRecommendation]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
