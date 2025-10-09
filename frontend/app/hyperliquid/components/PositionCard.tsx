'use client';

import type { HyperliquidPosition } from '../types';
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from '../utils/formatters';
import { FundingRateTrend } from './position/FundingRateTrend';

interface PositionCardProps {
  position: HyperliquidPosition;
  isClient: boolean;
}

interface RiskLevel {
  level: 'critical' | 'high' | 'medium' | 'safe';
  color: string;
  textColor: string;
  borderColor: string;
  bgColor: string;
}

const RISK_LEVEL_DESCRIPTIONS: Record<RiskLevel['level'], string> = {
  critical: 'Critical',
  high: 'High risk',
  medium: 'Moderate',
  safe: 'Comfortable',
};

const RISK_BANNERS: Partial<
  Record<
    RiskLevel['level'],
    {
      background: string;
      message: string;
    }
  >
> = {
  critical: {
    background: 'bg-rose-500',
    message: 'CRITICAL - NEAR LIQUIDATION',
  },
  high: {
    background: 'bg-amber-500',
    message: 'WARNING - Monitor Position',
  },
};

function getRiskLevel(distancePercent: number): RiskLevel {
  if (distancePercent < 5) {
    return {
      level: 'critical',
      color: 'bg-rose-500',
      textColor: 'text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-500/50',
      bgColor: 'bg-rose-50/50 dark:bg-rose-950/20',
    };
  }

  if (distancePercent < 10) {
    return {
      level: 'high',
      color: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-500/50',
      bgColor: 'bg-amber-50/50 dark:bg-amber-950/20',
    };
  }

  if (distancePercent < 20) {
    return {
      level: 'medium',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      borderColor: 'border-yellow-500/50',
      bgColor: 'bg-yellow-50/50 dark:bg-yellow-950/20',
    };
  }

  return {
    level: 'safe',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-500/50',
    bgColor: 'bg-emerald-50/50 dark:bg-emerald-950/20',
  };
}

function formatFundingCountdown(targetTime: number, isClient: boolean) {
  if (!isClient) {
    return '--';
  }

  const now = Date.now();
  const diff = Math.max(targetTime - now, 0);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export function PositionCard({ position, isClient }: PositionCardProps) {
  const riskLevel = getRiskLevel(position.distanceToLiquidation);
  const riskBanner = RISK_BANNERS[riskLevel.level];
  const riskDescriptor = RISK_LEVEL_DESCRIPTIONS[riskLevel.level];
  const priceChangePercent = ((position.markPrice - position.entryPrice) / position.entryPrice) * 100;
  const priceToLiquidation = ((position.liquidationPrice - position.markPrice) / position.markPrice) * 100;
  const fundingCurrent = position.fundingPnl ?? 0;
  const fundingAllTime = position.fundingPnlAllTime ?? fundingCurrent;
  const hyperFeesCurrent = position.hyperliquidFeesSinceChange ?? position.hyperliquidFees ?? 0;
  const hyperFeesAllTime = position.hyperliquidFees ?? hyperFeesCurrent;
  const binanceFeesCurrent = position.binanceEquivalentFeesSinceChange ?? position.binanceEquivalentFees ?? 0;
  const binanceFeesAllTime = position.binanceEquivalentFees ?? binanceFeesCurrent;
  const futureClosingFees = position.futureClosingFees ?? 0;
  const netRevenueCurrent = position.netRevenueCurrent ?? position.netGain ?? 0;
  const netRevenueAllTime = position.netRevenueAllTime ?? position.netGainAdjusted ?? netRevenueCurrent;
  const netCurrentPositive = netRevenueCurrent >= 0;
  const netAllTimePositive = netRevenueAllTime >= 0;

  return (
    <details
      className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 open:lg:col-span-2"
    >
      {riskBanner && (
        <div className={`${riskBanner.background} text-white px-6 py-3 flex items-center gap-2 font-semibold text-sm`}>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {riskBanner.message}
        </div>
      )}

      <summary className="p-6 cursor-pointer list-none hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{position.coin}</h3>
              <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                SHORT
              </span>
              <svg
                className="w-5 h-5 text-slate-400 ml-auto transition-transform duration-200 group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {formatCurrency(position.positionValueUsd)} · {Math.abs(position.leverage)}x leverage
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Entry Price</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(position.entryPrice)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mark {formatCurrency(position.markPrice)}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Price Change</p>
            <p className={`text-lg font-semibold ${priceChangePercent <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {priceChangePercent <= 0 ? '' : '+'}
              {formatPercent(priceChangePercent / 100, 2)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">From entry</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Distance to Liq.</p>
            <p className={`text-lg font-semibold ${riskLevel.textColor}`}>
              {priceToLiquidation >= 0 ? formatPercent(priceToLiquidation / 100, 2) : '—'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Liq. price {formatCurrency(position.liquidationPrice)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg border ${riskLevel.borderColor} ${riskLevel.bgColor}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Liquidation Buffer</span>
              <span className={`inline-flex items-center gap-2 text-sm font-semibold ${riskLevel.textColor}`}>
                <span className={`w-2 h-2 rounded-full ${riskLevel.color}`} />
                {riskDescriptor}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Keep at least 10% distance to avoid forced deleveraging. Current buffer{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formatCurrency(position.distanceToLiquidationUsd)} ({formatPercent(position.distanceToLiquidation / 100, 2)})
              </span>
            </p>
          </div>

          {position.deltaNeutralAction && (
            <div className="p-4 rounded-lg border border-sky-500/40 bg-sky-50/60 dark:bg-sky-900/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">Delta Adjustment</p>
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Suggested action: {position.deltaNeutralAction.action.replace('_', ' ')}{' '}
                {formatNumber(position.deltaNeutralAction.amount, 4)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{position.deltaNeutralAction.reason}</p>
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400 font-medium">Click to view detailed information →</div>
      </summary>

      <div className="px-6 pb-8 space-y-8 border-t border-slate-200 dark:border-slate-700 pt-8 bg-slate-50/50 dark:bg-slate-900/30">
        {position.fundingRate && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Funding Rate Analytics</h4>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-6">
              <div className="flex justify-between items-center pb-6 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Funding Rate (APR)</p>
                  <p
                    className={`text-3xl font-bold ${
                      position.fundingRate.currentRateApr >= 10
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : position.fundingRate.currentRateApr >= 5
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {position.fundingRate.currentRateApr >= 0 ? '+' : ''}
                    {formatNumber(position.fundingRate.currentRateApr, 2)}%
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    1hr: {position.fundingRate.currentRate >= 0 ? '+' : ''}
                    {(position.fundingRate.currentRate * 100).toFixed(4)}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">7-Day Average</p>
                  <p
                    className={`text-2xl font-semibold ${
                      position.fundingRate.avgRate7dApr >= 10
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : position.fundingRate.avgRate7dApr >= 5
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {position.fundingRate.avgRate7dApr >= 0 ? '+' : ''}
                    {formatNumber(position.fundingRate.avgRate7dApr, 2)}%
                  </p>
                  <p
                    className={`text-xs mt-1 ${
                      position.fundingRate.currentRateApr > position.fundingRate.avgRate7dApr
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : position.fundingRate.currentRateApr < position.fundingRate.avgRate7dApr
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {position.fundingRate.currentRateApr > position.fundingRate.avgRate7dApr
                      ? '↑ Above average'
                      : position.fundingRate.currentRateApr < position.fundingRate.avgRate7dApr
                      ? '↓ Below average'
                      : '→ At average'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-4 border border-emerald-200/30 dark:border-emerald-700/30">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1">Est. Daily Revenue</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(position.fundingRate.estimatedDailyRevenue)}
                  </p>
                </div>
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-4 border border-emerald-200/30 dark:border-emerald-700/30">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1">Est. Monthly Revenue</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(position.fundingRate.estimatedMonthlyRevenue)}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Next Funding</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatFundingCountdown(position.fundingRate.nextFundingTime, isClient)}
                  </span>
                </div>
              </div>

              {position.fundingRate.history.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-medium">7-Day Funding Rate Trend (APR %, 8h Avg)</p>
                  <FundingRateTrend history={position.fundingRate.history} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Position Overview</h4>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-700">
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Total Position Value</span>
              <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                {formatCurrency(position.positionValueUsd + (position.spotBalance || 0) * position.markPrice)}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600 dark:text-slate-400">Short Position</span>
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                  {formatNumber(Math.abs(position.positionSize), 4)} {position.coin}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-500">Value</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{formatCurrency(position.positionValueUsd)}</span>
              </div>
            </div>

            {(position.spotBalance || 0) > 0 && (
              <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Long (Spot)</span>
                  <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatNumber(position.spotBalance || 0, 4)} {position.coin}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Value</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatCurrency((position.spotBalance || 0) * position.markPrice)}
                  </span>
                </div>
              </div>
            )}

            {position.deltaImbalance !== undefined && Math.abs(position.deltaImbalance) > 0.01 && (
              <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                <span className="text-sm text-slate-600 dark:text-slate-400">Delta Imbalance</span>
                <span
                  className={`font-mono text-sm font-semibold ${
                    Math.abs(position.deltaImbalance) < Math.abs(position.positionSize) * 0.05
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {position.deltaImbalance > 0 ? '+' : ''}
                  {formatNumber(position.deltaImbalance, 4)} {position.coin}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Margin</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">{formatCurrency(position.margin)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Leverage</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">{Math.abs(position.leverage)}x</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Revenue & Fees</h4>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-6">
            <div
              className={`p-5 rounded-lg border ${
                (position.netGain || 0) >= 0
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span
                  className={`text-sm font-semibold ${
                    (position.netGain || 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  Net {(position.netGain || 0) >= 0 ? 'Gain' : 'Loss'}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{position.tradeCount || 0} trades</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${
                    (position.netGain || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {(position.netGain || 0) >= 0 ? '+' : ''}
                  {formatCurrency(position.netGain || 0)}
                </span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  ({formatSignedCurrency(netRevenueAllTime)} all time)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/40 dark:border-emerald-800/30">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Funding Revenue</p>
                <p className={`mt-2 text-lg font-bold ${fundingCurrent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {fundingCurrent >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(fundingCurrent))}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {fundingAllTime >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(fundingAllTime))} all time
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Future Closing Fees</p>
                <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(futureClosingFees)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Estimated for closing the short</p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Hyperliquid Fees</p>
                <p className={`mt-2 text-lg font-bold ${hyperFeesCurrent >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {hyperFeesCurrent >= 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(hyperFeesCurrent))}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {hyperFeesAllTime >= 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(hyperFeesAllTime))} all time
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Binance Equivalent Fees</p>
                <p className={`mt-2 text-lg font-bold ${binanceFeesCurrent >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {binanceFeesCurrent >= 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(binanceFeesCurrent))}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {binanceFeesAllTime >= 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(binanceFeesAllTime))} all time
                </p>
              </div>
            </div>

            <div className={`p-5 rounded-lg border ${netCurrentPositive ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${netCurrentPositive ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                  {netCurrentPositive ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11l-6 6-6-6" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Net Revenue (Current)</p>
                  <p className={`text-lg font-bold ${netCurrentPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {netCurrentPositive ? '+' : '-'}
                    {formatCurrency(Math.abs(netRevenueCurrent))}
                  </p>
                  <p className={`text-xs ${netAllTimePositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {netAllTimePositive ? '+' : '-'}
                    {formatCurrency(Math.abs(netRevenueAllTime))} lifetime
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Low Funding Rate Alert</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Funding rate is below 8% APR threshold. Consider closing position if rate continues to decline.
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
