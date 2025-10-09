'use client';

import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import {
  HyperliquidOpportunity,
  HyperliquidOpportunityFilters,
  HyperliquidOpportunityTotals,
  OpportunityDirectionFilter,
  OpportunitySort,
} from '../types';
import { formatCurrency, formatNumber, formatPercent } from '../utils/formatters';

interface OpportunitiesSectionProps {
  filters: HyperliquidOpportunityFilters;
  setFilters: Dispatch<SetStateAction<HyperliquidOpportunityFilters>>;
  totals: HyperliquidOpportunityTotals | null;
  opportunities: HyperliquidOpportunity[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

const OPEN_INTEREST_OPTIONS = [
  { label: '$0', value: 0 },
  { label: '$250k', value: 250_000 },
  { label: '$500k', value: 500_000 },
  { label: '$1M', value: 1_000_000 },
  { label: '$5M', value: 5_000_000 },
] as const;

const VOLUME_OPTIONS = [
  { label: '$0', value: 0 },
  { label: '$100k', value: 100_000 },
  { label: '$250k', value: 250_000 },
  { label: '$1M', value: 1_000_000 },
  { label: '$5M', value: 5_000_000 },
] as const;

const LIMIT_OPTIONS = [6, 12, 18, 24, 30] as const;

export function OpportunitiesSection({
  filters,
  setFilters,
  totals,
  opportunities,
  loading,
  error,
  lastUpdated,
  onRefresh,
}: OpportunitiesSectionProps) {
  const [draftNotional, setDraftNotional] = useState(String(filters.notionalUsd));

  useEffect(() => {
    setDraftNotional(String(filters.notionalUsd));
  }, [filters.notionalUsd]);

  const bestOpportunityScore = useMemo(() => {
    return opportunities.reduce((max, item) => Math.max(max, item.opportunityScore), 0);
  }, [opportunities]);

  const handleDirectionChange = (direction: OpportunityDirectionFilter) => {
    setFilters((previous) => (previous.direction === direction ? previous : { ...previous, direction }));
  };

  const handleSortChange = (sort: OpportunitySort) => {
    setFilters((previous) => (previous.sort === sort ? previous : { ...previous, sort }));
  };

  const handleOpenInterestChange = (value: number) => {
    setFilters((previous) =>
      previous.minOpenInterestUsd === value ? previous : { ...previous, minOpenInterestUsd: value },
    );
  };

  const handleVolumeChange = (value: number) => {
    setFilters((previous) => (previous.minVolumeUsd === value ? previous : { ...previous, minVolumeUsd: value }));
  };

  const handleLimitChange = (value: number) => {
    const boundedValue = Math.min(Math.max(value, 5), 30);
    setFilters((previous) => (previous.limit === boundedValue ? previous : { ...previous, limit: boundedValue }));
  };

  const applyNotional = () => {
    const parsed = Number.parseFloat(draftNotional.replace(/,/g, ''));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraftNotional(String(filters.notionalUsd));
      return;
    }

    const normalized = Math.max(100, Math.round(parsed / 100) * 100);

    if (normalized !== filters.notionalUsd) {
      setFilters((previous) => ({ ...previous, notionalUsd: normalized }));
    }

    setDraftNotional(String(normalized));
  };

  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/50 shadow-sm">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800/60 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Hyperliquid Funding Opportunities</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Scan live markets where funding works in your favor. Estimates assume a{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(filters.notionalUsd)}</span> delta-neutral
              short per market.
            </p>
            {totals && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {Math.min(filters.limit, totals.filteredMarkets)} of {totals.filteredMarkets} matches · Universe{' '}
                {totals.availableMarkets} markets
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/50 p-1">
              {(['short', 'all', 'long'] as OpportunityDirectionFilter[]).map((option) => {
                const isActive = filters.direction === option;
                const activeClasses =
                  option === 'short'
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : option === 'long'
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-slate-900 text-white hover:bg-slate-950';

                return (
                  <button
                    key={option}
                    onClick={() => handleDirectionChange(option)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 ${
                      isActive
                        ? activeClasses
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    {option === 'short' ? 'Short Collect' : option === 'long' ? 'Long Collect' : 'All'}
                  </button>
                );
              })}
            </div>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7.5 7.5 0 0117 6.5M18.5 15A7.5 7.5 0 017 17.5" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Sort</span>
            <select
              value={filters.sort}
              onChange={(event) => handleSortChange(event.target.value as OpportunitySort)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              <option value="score">Score (blended)</option>
              <option value="funding">Funding (|APR|)</option>
              <option value="liquidity">Open Interest</option>
              <option value="volume">24h Volume</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Open Interest ≥</span>
            <select
              value={filters.minOpenInterestUsd}
              onChange={(event) => handleOpenInterestChange(Number(event.target.value))}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              {OPEN_INTEREST_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">24h Volume ≥</span>
            <select
              value={filters.minVolumeUsd}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              {VOLUME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Show</span>
            <select
              value={filters.limit}
              onChange={(event) => handleLimitChange(Number(event.target.value))}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              {LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Notional</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">$</span>
                <input
                  type="number"
                  value={draftNotional}
                  onChange={(event) => setDraftNotional(event.target.value)}
                  onBlur={applyNotional}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyNotional();
                    }
                  }}
                  className="pl-5 pr-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 w-28"
                />
              </div>
              <button
                onClick={applyNotional}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400 border-b border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/15">
          {error}
        </div>
      )}

      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>Avg |funding| APR {formatPercent(totals?.averageAbsoluteFundingAnnualized ?? 0, 2)}</span>
          <span>Avg signed APR {formatPercent(totals?.averageFundingAnnualized ?? 0, 2)}</span>
          {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          {loading && (
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4m8-8h-4M8 12H4" />
              </svg>
              Refreshing…
            </span>
          )}
        </div>

        {loading && opportunities.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4m8-8h-4M8 12H4" />
            </svg>
            Loading funding opportunities...
          </div>
        ) : (
          <div className="space-y-4">
            {opportunities.map((market) => {
              const normalizedScore = bestOpportunityScore > 0 ? Math.min(market.opportunityScore / bestOpportunityScore, 1) : 0;
              const scoreBarWidth = `${Math.max(8, normalizedScore * 100)}%`;
              const directionBadgeClasses =
                market.direction === 'short'
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-rose-500/90 text-white';
              const directionLabel = market.direction === 'short' ? 'Short collects funding' : 'Long collects funding';
              const fundingColor =
                market.fundingRateAnnualized >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400';

              return (
                <div
                  key={market.coin}
                  className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/50 p-5 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{market.coin}</h3>
                        {typeof market.maxLeverage === 'number' && (
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            Max {formatNumber(market.maxLeverage, 0)}x
                          </span>
                        )}
                        {market.onlyIsolated && (
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            Isolated only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Mark {formatCurrency(market.markPrice)}
                        {market.oraclePrice && Math.abs(market.markPrice - market.oraclePrice) / (market.oraclePrice || 1) > 0.002
                          ? ` · Oracle ${formatCurrency(market.oraclePrice)}`
                          : ''}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full ${directionBadgeClasses}`}>
                      {directionLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Funding (Annual)
                      </span>
                      <p className={`text-lg font-semibold ${fundingColor}`}>{formatPercent(market.fundingRateAnnualized, 2)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Daily {formatPercent(market.expectedDailyReturnPercent, 2)}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Open Interest
                      </span>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(market.openInterestUsd)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Base {formatNumber(market.openInterestBase, 2)}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Volume (24h)
                      </span>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(market.dayNotionalVolumeUsd)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Score {formatNumber(market.volumeScore * 100, 0)} / 100
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Expected Daily PnL
                      </span>
                      <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(market.estimatedDailyPnlUsd)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Monthly {formatCurrency(market.estimatedMonthlyPnlUsd)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>Opportunity score</span>
                      <span>{formatNumber(market.opportunityScore, 2)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-500 to-purple-500"
                        style={{ width: scoreBarWidth }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {opportunities.length === 0 && !loading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No markets match your filters yet. Try relaxing the liquidity thresholds.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
