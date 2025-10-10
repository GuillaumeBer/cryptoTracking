'use client';

import { useMemo, useState } from 'react';
import type { HyperliquidOpportunityFilters } from '../types';
import { useHyperliquidRecommendation } from '../hooks/useHyperliquidRecommendation';
import { formatCurrency, formatNumber, formatPercent } from '../utils/formatters';

interface RecommendationSectionProps {
  walletAddress: string;
  filters: HyperliquidOpportunityFilters;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function RecommendationSection({ walletAddress, filters }: RecommendationSectionProps) {
  const [liquidityOverride, setLiquidityOverride] = useState('');
  const [targetLeverageInput, setTargetLeverageInput] = useState('3');
  const [maxLeverageInput, setMaxLeverageInput] = useState('5');
  const [bufferPercentInput, setBufferPercentInput] = useState('20');
  const [maxOiPercentInput, setMaxOiPercentInput] = useState('5');
  const [maxVolumePercentInput, setMaxVolumePercentInput] = useState('10');
  const [candidateCountInput, setCandidateCountInput] = useState('5');

  const parsedLiquidityOverride = useMemo(() => {
    const normalized = Number.parseFloat(liquidityOverride.replace(/,/g, ''));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }, [liquidityOverride]);

  const sanitizedTargetLeverage = useMemo(() => {
    const numeric = Number.parseFloat(targetLeverageInput);
    if (!Number.isFinite(numeric) || numeric <= 0) return 1;
    return clamp(numeric, 1, 25);
  }, [targetLeverageInput]);

  const sanitizedMaxLeverage = useMemo(() => {
    const numeric = Number.parseFloat(maxLeverageInput);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return Math.max(1, sanitizedTargetLeverage);
    }
    return Math.max(Math.min(numeric, 50), sanitizedTargetLeverage);
  }, [maxLeverageInput, sanitizedTargetLeverage]);

  const sanitizedBufferPercent = useMemo(() => {
    const numeric = Number.parseFloat(bufferPercentInput);
    if (!Number.isFinite(numeric) || numeric < 0) return 20;
    return clamp(numeric, 0, 75);
  }, [bufferPercentInput]);

  const sanitizedMaxOiPercent = useMemo(() => {
    const numeric = Number.parseFloat(maxOiPercentInput);
    if (!Number.isFinite(numeric) || numeric <= 0) return 5;
    return clamp(numeric, 1, 50);
  }, [maxOiPercentInput]);

  const sanitizedMaxVolumePercent = useMemo(() => {
    const numeric = Number.parseFloat(maxVolumePercentInput);
    if (!Number.isFinite(numeric) || numeric <= 0) return 10;
    return clamp(numeric, 1, 100);
  }, [maxVolumePercentInput]);

  const sanitizedCandidateCount = useMemo(() => {
    const numeric = Number.parseInt(candidateCountInput, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) return 5;
    return clamp(Math.round(numeric), 1, 20);
  }, [candidateCountInput]);

  const recommendationParams = useMemo(
    () => ({
      candidates: sanitizedCandidateCount,
      minOpenInterestUsd: filters.minOpenInterestUsd,
      minVolumeUsd: filters.minVolumeUsd,
      notionalUsd: filters.notionalUsd,
      tradingCostDaily: filters.tradingCostDaily,
      liquidityBufferPercent: sanitizedBufferPercent,
      targetLeverage: sanitizedTargetLeverage,
      maxLeverage: sanitizedMaxLeverage,
      maxOiPercent: sanitizedMaxOiPercent,
      maxVolumePercent: sanitizedMaxVolumePercent,
      liquidityUsd: parsedLiquidityOverride,
    }),
    [
      sanitizedCandidateCount,
      filters.minOpenInterestUsd,
      filters.minVolumeUsd,
      filters.notionalUsd,
      filters.tradingCostDaily,
      sanitizedBufferPercent,
      sanitizedTargetLeverage,
      sanitizedMaxLeverage,
      sanitizedMaxOiPercent,
      sanitizedMaxVolumePercent,
      parsedLiquidityOverride,
    ],
  );

  const { data, loading, error, lastUpdated, refresh } = useHyperliquidRecommendation(
    walletAddress,
    recommendationParams,
  );

  const liquidity = data?.liquidity;
  const recommendation = data?.recommendation;
  const reason = data?.reason;

  const renderCandidateScore = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return <span className="text-slate-400 dark:text-slate-500">—</span>;
    }
    return formatNumber(value, 2);
  };

  const formatPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    return formatCurrency(value);
  };

  const renderGuardMultiple = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }

    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-0.5">
        Guarded to {formatNumber(value, 2)}×
      </p>
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/50 shadow-sm">
      <div className="p-6 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sizing Recommendation</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Translate your withdrawable liquidity and blended-score candidates into a concrete short suggestion.
          </p>
          {lastUpdated && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Updated {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>
        <button
          onClick={() => {
            void refresh();
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
          disabled={loading}
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7.5 7.5 0 0117 6.5M18.5 15A7.5 7.5 0 017 17.5" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Target Leverage
            </label>
            <input
              type="number"
              min={1}
              max={25}
              step={0.1}
              value={targetLeverageInput}
              onChange={(event) => setTargetLeverageInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Max Leverage Cap
            </label>
            <input
              type="number"
              min={sanitizedTargetLeverage}
              max={50}
              step={0.1}
              value={maxLeverageInput}
              onChange={(event) => setMaxLeverageInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Liquidity Buffer (%)
            </label>
            <input
              type="number"
              min={0}
              max={75}
              step={1}
              value={bufferPercentInput}
              onChange={(event) => setBufferPercentInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Max % of Market Open Interest
            </label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={maxOiPercentInput}
              onChange={(event) => setMaxOiPercentInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Max % of 24h Volume
            </label>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={maxVolumePercentInput}
              onChange={(event) => setMaxVolumePercentInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Candidates to Evaluate
            </label>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={candidateCountInput}
              onChange={(event) => setCandidateCountInput(event.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Liquidity Override (USD)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={liquidityOverride}
              onChange={(event) => setLiquidityOverride(event.target.value)}
              placeholder="Auto-detect from withdrawable balance"
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {liquidity && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Available Liquidity
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(liquidity.availableLiquidityUsd)}</p>
              {parsedLiquidityOverride !== undefined && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Override applied</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Liquidity Buffer
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">
                {formatCurrency(liquidity.liquidityBufferUsd)} ({formatPercent(liquidity.liquidityBufferPercent)})
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Usable Liquidity
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(liquidity.usableLiquidityUsd)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Withdrawable (API)
              </p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(liquidity.withdrawableUsd)}</p>
            </div>
          </div>
        )}

        {recommendation ? (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/10 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">Recommended Short</p>
                <h3 className="text-2xl font-semibold text-emerald-900 dark:text-emerald-200">{recommendation.asset}</h3>
                <p className="text-sm text-emerald-600 dark:text-emerald-300">
                  {formatNumber(recommendation.positionSize, 4)} contracts · {formatCurrency(recommendation.positionNotionalUsd)} notiona
l
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-200">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Leverage</p>
                  <p className="text-base font-semibold">{formatNumber(recommendation.leverage, 2)}×</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Funding APR</p>
                  <p className="text-base font-semibold">{formatPercent(recommendation.fundingRateAnnualized)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Expected Daily PnL</p>
                  <p className="text-base font-semibold">{formatCurrency(recommendation.expectedDailyPnlUsd)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Expected Monthly PnL</p>
                  <p className="text-base font-semibold">{formatCurrency(recommendation.expectedMonthlyPnlUsd)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-700 dark:text-slate-200">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Entry Price</p>
                  <p className="text-base font-semibold">{formatPrice(recommendation.entryPrice ?? recommendation.markPrice)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Liquidation Price</p>
                  <p className="text-base font-semibold">{formatPrice(recommendation.liquidationPrice)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Max Price Before Liquidation</p>
                  <p className="text-base font-semibold">{formatPrice(recommendation.maxPriceBeforeLiquidation)}</p>
                  {renderGuardMultiple(recommendation.guardMultiple)}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div>
                <span className="block font-medium text-slate-600 dark:text-slate-300">Blended Score</span>
                <span className="text-slate-700 dark:text-slate-200">{renderCandidateScore(recommendation.combinedScore)}</span>
              </div>
              <div>
                <span className="block font-medium text-slate-600 dark:text-slate-300">Opportunity Score</span>
                <span className="text-slate-700 dark:text-slate-200">{renderCandidateScore(recommendation.opportunityScore)}</span>
              </div>
              <div>
                <span className="block font-medium text-slate-600 dark:text-slate-300">Open Interest</span>
                <span className="text-slate-700 dark:text-slate-200">{formatCurrency(recommendation.openInterestUsd)}</span>
              </div>
              <div>
                <span className="block font-medium text-slate-600 dark:text-slate-300">24h Volume</span>
                <span className="text-slate-700 dark:text-slate-200">{formatCurrency(recommendation.dayNotionalVolumeUsd)}</span>
              </div>
            </div>
          </div>
        ) : (
          reason && (
            <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-200">
              {reason}
            </div>
          )
        )}

        {data?.candidates?.length ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top Candidates</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-4">Asset</th>
                    <th className="py-2 pr-4">Blended Score</th>
                    <th className="py-2 pr-4">Funding APR</th>
                    <th className="py-2 pr-4">Open Interest</th>
                    <th className="py-2 pr-4">24h Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.candidates.map((candidate) => (
                    <tr key={candidate.asset} className="text-slate-700 dark:text-slate-200">
                      <td className="py-2 pr-4 font-medium">{candidate.asset}</td>
                      <td className="py-2 pr-4">{renderCandidateScore(candidate.combinedScore)}</td>
                      <td className="py-2 pr-4">{formatPercent(candidate.fundingRateAnnualized)}</td>
                      <td className="py-2 pr-4">{formatCurrency(candidate.openInterestUsd)}</td>
                      <td className="py-2 pr-4">{formatCurrency(candidate.dayNotionalVolumeUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
