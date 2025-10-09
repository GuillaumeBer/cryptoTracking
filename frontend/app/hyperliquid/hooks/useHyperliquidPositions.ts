'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { endpoints } from '@/lib/api-config';
import type { HyperliquidPosition } from '../types';

interface UseHyperliquidPositionsResult {
  walletAddress: string;
  setWalletAddress: (value: string) => void;
  positions: HyperliquidPosition[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  totalNetGain: number;
  totalNetGainAllTime: number;
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useHyperliquidPositions(initialWallet: string): UseHyperliquidPositionsResult {
  const [walletAddress, setWalletAddress] = useState(initialWallet);
  const [positions, setPositions] = useState<HyperliquidPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const { totalNetGain, totalNetGainAllTime } = useMemo(() => {
    const totalNet = positions.reduce((sum, pos) => sum + (pos.netGain ?? 0), 0);
    const totalAllTime = positions.reduce(
      (sum, pos) => sum + (pos.netRevenueAllTime ?? pos.netGainAdjusted ?? pos.netGain ?? 0),
      0,
    );

    return { totalNetGain: totalNet, totalNetGainAllTime: totalAllTime };
  }, [positions]);

  const fetchPositions = useCallback(
    async (address?: string) => {
      const targetAddress = (address ?? walletAddress).trim();

      if (!targetAddress) {
        setError('Please enter a wallet address');
        setPositions([]);
        setLastUpdate(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(endpoints.hyperliquid(targetAddress));
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch positions');
        }

        const positionsData: HyperliquidPosition[] = Array.isArray(result.data?.positions)
          ? result.data.positions
          : [];

        setPositions(positionsData);
        setLastUpdate(new Date());
      } catch (err) {
        setPositions([]);
        setLastUpdate(null);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [walletAddress],
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (walletAddress.trim()) {
      fetchPositions(walletAddress);
      interval = setInterval(() => {
        void fetchPositions(walletAddress);
      }, REFRESH_INTERVAL_MS);
    } else {
      setError('Please enter a wallet address');
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [walletAddress, fetchPositions]);

  const refresh = useCallback(async () => {
    await fetchPositions(walletAddress);
  }, [fetchPositions, walletAddress]);

  return {
    walletAddress,
    setWalletAddress,
    positions,
    loading,
    error,
    lastUpdate,
    totalNetGain,
    totalNetGainAllTime,
    refresh,
  };
}
