'use client';

import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { endpoints } from '@/lib/api-config';
import type {
  HyperliquidOpportunity,
  HyperliquidOpportunityFilters,
  HyperliquidOpportunityResponse,
  HyperliquidOpportunityTotals,
  PerpConnectorResult,
} from '../types';

interface UseHyperliquidOpportunitiesOptions {
  initialFilters: HyperliquidOpportunityFilters;
  connectors: PerpConnectorResult[];
}

interface UseHyperliquidOpportunitiesResult {
  opportunities: HyperliquidOpportunity[];
  totals: HyperliquidOpportunityTotals | null;
  filters: HyperliquidOpportunityFilters;
  setFilters: Dispatch<SetStateAction<HyperliquidOpportunityFilters>>;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 120_000;

function computeScores(
  fundingRateAnnualized: number,
  openInterestUsd: number,
  dayNotionalVolumeUsd: number,
) {
  const liquidityScore = Math.min(1, openInterestUsd / 5_000_000);
  const volumeScore = Math.min(1, dayNotionalVolumeUsd / 2_000_000);
  const opportunityScore = Math.abs(fundingRateAnnualized) * (0.6 + 0.25 * liquidityScore + 0.15 * volumeScore);
  return { liquidityScore, volumeScore, opportunityScore };
}

export function useHyperliquidOpportunities({
  initialFilters,
  connectors,
}: UseHyperliquidOpportunitiesOptions): UseHyperliquidOpportunitiesResult {
  const [opportunities, setOpportunities] = useState<HyperliquidOpportunity[]>([]);
  const [totals, setTotals] = useState<HyperliquidOpportunityTotals | null>(null);
  const [filters, setFilters] = useState<HyperliquidOpportunityFilters>(initialFilters);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const buildFallbackFromConnectors = useCallback(() => {
    if (connectors.length === 0) {
      return null;
    }

    const candidateMarkets: HyperliquidOpportunity[] = [];

    connectors.forEach((connector) => {
      connector.markets.forEach((market) => {
        if (!Number.isFinite(market.markPrice) || market.markPrice <= 0) {
          return;
        }

        const markPrice = Number(market.markPrice);
        const openInterestUsd = Number(market.openInterestUsd ?? 0);
        const openInterestBase = markPrice > 0 ? openInterestUsd / markPrice : 0;
        const dayNotionalVolumeUsd = (() => {
          if (typeof market.extra === 'object' && market.extra !== null && 'dayNotionalVolumeUsd' in market.extra) {
            const raw = (market.extra as Record<string, unknown>)['dayNotionalVolumeUsd'];
            if (typeof raw === 'number') {
              return raw;
            }
            if (typeof raw === 'string') {
              const parsed = Number(raw);
              return Number.isFinite(parsed) ? parsed : 0;
            }
          }
          return 0;
        })();
        const fundingRateHourly = Number(market.fundingRateHourly ?? 0);
        const fundingRateAnnualized = Number.isFinite(market.fundingRateAnnualized)
          ? Number(market.fundingRateAnnualized)
          : fundingRateHourly * 24 * 365;
        const fundingRateDaily = fundingRateHourly * 24;
        const { liquidityScore, volumeScore, opportunityScore } = computeScores(
          fundingRateAnnualized,
          openInterestUsd,
          dayNotionalVolumeUsd,
        );
        const direction = fundingRateHourly >= 0 ? 'short' : 'long';

        candidateMarkets.push({
          coin: `${connector.meta.name}: ${market.symbol}`,
          markPrice,
          oraclePrice: null,
          fundingRateHourly,
          fundingRateDaily,
          fundingRateAnnualized,
          openInterestBase,
          openInterestUsd,
          dayNotionalVolumeUsd,
          dayBaseVolume: undefined,
          premium: undefined,
          direction,
          opportunityScore,
          liquidityScore,
          volumeScore,
          expectedDailyReturnPercent: fundingRateDaily,
          estimatedDailyPnlUsd: filters.notionalUsd * fundingRateDaily,
          estimatedMonthlyPnlUsd: filters.notionalUsd * fundingRateDaily * 30,
          notionalUsd: filters.notionalUsd,
          maxLeverage: undefined,
          szDecimals: undefined,
          onlyIsolated: undefined,
          marginTableId: undefined,
        });
      });
    });

    if (candidateMarkets.length === 0) {
      return null;
    }

    const filtered = candidateMarkets.filter((market) => {
      if (filters.direction !== 'all' && market.direction !== filters.direction) {
        return false;
      }
      if (market.openInterestUsd < filters.minOpenInterestUsd) {
        return false;
      }
      if (market.dayNotionalVolumeUsd < filters.minVolumeUsd) {
        return false;
      }
      return true;
    });

    const sorter = (a: HyperliquidOpportunity, b: HyperliquidOpportunity) => {
      switch (filters.sort) {
        case 'funding':
          return Math.abs(b.fundingRateAnnualized) - Math.abs(a.fundingRateAnnualized);
        case 'liquidity':
          return b.openInterestUsd - a.openInterestUsd;
        case 'volume':
          return b.dayNotionalVolumeUsd - a.dayNotionalVolumeUsd;
        case 'score':
        default:
          return b.opportunityScore - a.opportunityScore;
      }
    };

    const sorted = [...filtered].sort(sorter);
    const limited = sorted.slice(0, filters.limit);

    const averageFunding =
      limited.length > 0 ? limited.reduce((sum, item) => sum + item.fundingRateAnnualized, 0) / limited.length : 0;
    const averageAbsFunding =
      limited.length > 0
        ? limited.reduce((sum, item) => sum + Math.abs(item.fundingRateAnnualized), 0) / limited.length
        : 0;

    return {
      markets: limited,
      totals: {
        availableMarkets: candidateMarkets.length,
        filteredMarkets: filtered.length,
        averageFundingAnnualized: averageFunding,
        averageAbsoluteFundingAnnualized: averageAbsFunding,
      } satisfies HyperliquidOpportunityTotals,
    };
  }, [connectors, filters]);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);

    const requestUrl = endpoints.hyperliquidOpportunities(filters);

    try {
      const response = await fetch(requestUrl);
      const rawBody = await response.text();

      let parsed: HyperliquidOpportunityResponse | null = null;

      if (rawBody.trim().length > 0) {
        try {
          parsed = JSON.parse(rawBody) as HyperliquidOpportunityResponse;
        } catch {
          const snippet = rawBody.slice(0, 140).replace(/\s+/g, ' ').trim();
          console.warn('Hyperliquid opportunities response was not JSON:', {
            status: response.status,
            url: requestUrl,
            snippet,
          });
          throw new Error(`Received non-JSON response (HTTP ${response.status}) from ${requestUrl}.`);
        }
      }

      if (!response.ok || !parsed?.success || !parsed.data) {
        const message = parsed?.error || `Failed to fetch opportunities (HTTP ${response.status} ${response.statusText || ''})`;
        throw new Error(message);
      }

      setOpportunities(parsed.data.markets ?? []);
      setTotals(parsed.data.totals ?? null);
      setLastUpdated(new Date(parsed.data.fetchedAt));
    } catch (err) {
      console.error('Failed to load Hyperliquid opportunities:', err);
      const fallbackData = buildFallbackFromConnectors();
      const baseMessage = err instanceof Error ? err.message : 'Unable to load Hyperliquid opportunities';

      if (fallbackData) {
        setOpportunities(fallbackData.markets);
        setTotals(fallbackData.totals);
        setLastUpdated(new Date());
        setError(`${baseMessage}. Showing fallback from connector feed.`);
      } else {
        setOpportunities([]);
        setTotals(null);
        setLastUpdated(null);
        setError(baseMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [buildFallbackFromConnectors, filters]);

  useEffect(() => {
    void fetchOpportunities();
    const interval = setInterval(() => {
      void fetchOpportunities();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [fetchOpportunities]);

  const refresh = useCallback(async () => {
    await fetchOpportunities();
  }, [fetchOpportunities]);

  return {
    opportunities,
    totals,
    filters,
    setFilters,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}
