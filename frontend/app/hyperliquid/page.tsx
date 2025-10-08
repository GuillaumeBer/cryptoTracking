'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { endpoints } from '@/lib/api-config';

interface DeltaNeutralAction {
  action: 'buy' | 'sell' | 'increase_short' | 'decrease_short';
  amount: number;
  reason: string;
}

interface FundingRateData {
  currentRate: number;
  currentRateApr: number;
  nextFundingTime: number;
  avgRate7d: number;
  avgRate7dApr: number;
  history: Array<{ time: number; rate: number; rateApr: number }>;
  estimatedDailyRevenue: number;
  estimatedMonthlyRevenue: number;
}

interface HyperliquidPosition {
  coin: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  positionSize: number;
  positionValueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  leverage: number;
  distanceToLiquidation: number;
  distanceToLiquidationUsd: number;
  fundingPnl?: number;
  currentSessionFunding?: number;
  spotBalance?: number;
  isDeltaNeutral?: boolean;
  deltaImbalance?: number;
  deltaImbalanceValue?: number;
  deltaNeutralAction?: DeltaNeutralAction;
  hyperliquidFees?: number;
  binanceEquivalentFees?: number;
  totalFees?: number;
  futureClosingFees?: number;
  netGain?: number;
  netGainAdjusted?: number;
  tradeCount?: number;
  fundingRate?: FundingRateData;
}

interface PerpMarketData {
  symbol: string;
  markPrice: number;
  fundingRateHourly: number;
  fundingRateAnnualized: number;
  openInterestUsd: number;
  takerFeeBps: number;
  makerFeeBps: number;
  minQty: number;
  depthTop5: Array<{ side: 'bid' | 'ask'; price: number; size: number }>;
  extra?: Record<string, unknown>;
}

interface PerpConnectorMeta {
  id: string;
  name: string;
  description: string;
  website?: string;
  docs?: string;
  requiresApiKey: boolean;
}

interface PerpConnectorResult {
  meta: PerpConnectorMeta;
  markets: PerpMarketData[];
  lastUpdated: string;
  source: 'mock' | 'live';
}

interface PerpConnectorSummary {
  id: string;
  name: string;
  requiresApiKey: boolean;
  lastUpdated: string;
  marketCount: number;
  source: 'mock' | 'live';
}

export default function HyperliquidPage() {
  const [walletAddress, setWalletAddress] = useState(process.env.NEXT_PUBLIC_DEFAULT_EVM_ADDRESS || '');
  const [positions, setPositions] = useState<HyperliquidPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalFundingPnl, setTotalFundingPnl] = useState(0);
  const [totalNetGain, setTotalNetGain] = useState(0);
  const [totalNetGainAllTime, setTotalNetGainAllTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [perpConnectors, setPerpConnectors] = useState<PerpConnectorResult[]>([]);
  const [perpSummary, setPerpSummary] = useState<PerpConnectorSummary[]>([]);
  const [perpMode, setPerpMode] = useState<'auto' | 'mock' | 'live'>('auto');
  const [perpLoading, setPerpLoading] = useState(false);
  const [perpError, setPerpError] = useState<string | null>(null);

  const fetchPositions = async () => {
    if (!walletAddress) {
      setError('Please enter a wallet address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoints.hyperliquid(walletAddress));
      const result = await response.json();

      if (result.success) {
        const positionsData = result.data.positions || [];
        setPositions(positionsData);
        setTotalFundingPnl(result.data.totalFundingPnl || 0);

        // Calculate total net gain/loss from all positions
        const totalNet = positionsData.reduce((sum: number, pos: HyperliquidPosition) => sum + (pos.netGain || 0), 0);
        const totalNetAll = positionsData.reduce(
          (sum: number, pos: HyperliquidPosition) => sum + (pos.netRevenueAllTime ?? pos.netGainAdjusted ?? pos.netGain ?? 0),
          0
        );
        setTotalNetGain(totalNet);
        setTotalNetGainAllTime(totalNetAll);

        setLastUpdate(new Date());
      } else {
        setError(result.error || 'Failed to fetch positions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (walletAddress) {
      fetchPositions();
      const interval = setInterval(fetchPositions, 30000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchPerpConnectors = async (mode: 'auto' | 'mock' | 'live' = 'auto') => {
    setPerpLoading(true);
    setPerpError(null);
    try {
      const response = await fetch(endpoints.perpConnectors(mode));
      if (!response.ok) {
        throw new Error(`Failed to fetch connectors: ${response.statusText}`);
      }
      const data = await response.json();
      setPerpConnectors(data.connectors || []);
      setPerpSummary(data.summary || []);
      setPerpMode(data.mode || mode);
    } catch (err) {
      setPerpError(err instanceof Error ? err.message : 'Unable to load perp connectors');
    } finally {
      setPerpLoading(false);
    }
  };

  useEffect(() => {
    fetchPerpConnectors('auto');
    const interval = setInterval(() => fetchPerpConnectors('auto'), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatNumber = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatCurrency = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));
    return `$${formatted}`;
  };

  const formatSignedCurrency = (value: number) => {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${formatCurrency(value)}`;
  };

  const formatPercent = (value: number, decimals: number = 2) => {
    return `${formatNumber(value * 100, decimals)}%`;
  };

  const getRiskLevel = (distancePercent: number) => {
    if (distancePercent < 5) return {
      level: 'critical',
      color: 'bg-rose-500',
      textColor: 'text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-500/50',
      bgColor: 'bg-rose-50/50 dark:bg-rose-950/20'
    };
    if (distancePercent < 10) return {
      level: 'high',
      color: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-500/50',
      bgColor: 'bg-amber-50/50 dark:bg-amber-950/20'
    };
    if (distancePercent < 20) return {
      level: 'medium',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600 dark:text-yellow-400',
      borderColor: 'border-yellow-500/50',
      bgColor: 'bg-yellow-50/50 dark:bg-yellow-950/20'
    };
    return {
      level: 'safe',
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      borderColor: 'border-emerald-500/50',
      bgColor: 'bg-emerald-50/50 dark:bg-emerald-950/20'
    };
  };

  const formatFundingCountdown = (targetTime: number) => {
    const now = Date.now();
    const diff = Math.max(targetTime - now, 0);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const totalPositionValue = positions.reduce((sum, pos) => sum + Math.abs(pos.positionValueUsd), 0);
  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
  const deltaNeutralPositions = positions.filter(p => p.isDeltaNeutral);

  const renderConnectorCard = (connector: PerpConnectorResult, summary: PerpConnectorSummary | undefined) => {
    const topMarkets = [...connector.markets]
      .sort((a, b) => b.fundingRateAnnualized - a.fundingRateAnnualized)
      .slice(0, 3);

    return (
      <div
        key={connector.meta.id}
        className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col"
      >
        <div className="p-5 border-b border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{connector.meta.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {connector.meta.description}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  {summary?.source === 'live' ? 'Live feed' : 'Mock feed'}
                </span>
                {connector.meta.requiresApiKey && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    API key required
                  </span>
                )}
                {summary?.lastUpdated && (
                  <span>Updated {new Date(summary.lastUpdated).toLocaleTimeString()}</span>
                )}
                {summary?.marketCount !== undefined && (
                  <span>{summary.marketCount} markets</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {connector.meta.website && (
                <a
                  href={connector.meta.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                >
                  Website
                </a>
              )}
              {connector.meta.docs && (
                <a
                  href={connector.meta.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                >
                  Docs
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4 grow">
          {topMarkets.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No market data available.
            </p>
          ) : (
            topMarkets.map(market => (
              <div
                key={`${connector.meta.id}-${market.symbol}`}
                className="flex flex-col gap-2 rounded-xl border border-slate-200/50 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{market.symbol}</span>
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {formatPercent(market.fundingRateAnnualized)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <div>
                    <span className="block font-medium text-slate-600 dark:text-slate-300">Open Interest</span>
                    <span>{formatCurrency(market.openInterestUsd)}</span>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-600 dark:text-slate-300">Mark Price</span>
                    <span>{formatCurrency(market.markPrice)}</span>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-600 dark:text-slate-300">Fees</span>
                    <span>
                      Maker {formatNumber(market.makerFeeBps / 100, 2)} bps · Taker {formatNumber(market.takerFeeBps / 100, 2)} bps
                    </span>
                  </div>
                  <div>
                    <span className="block font-medium text-slate-600 dark:text-slate-300">Min Qty</span>
                    <span>{market.minQty}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 sm:p-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-8 transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back to Home</span>
          </Link>

          <div className="flex flex-col gap-6 mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">
              Hyperliquid Delta Neutral
            </h1>

            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/50 shadow-sm">
              <div className="p-5 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Emerging Perp Venues</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Aggregated funding and liquidity scouting across connectors. Mode: <span className="font-medium">{perpMode}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/50 p-1">
                    {(['auto', 'mock', 'live'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => fetchPerpConnectors(mode)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 ${
                          perpMode === mode
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                      >
                        {mode.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => fetchPerpConnectors(perpMode)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className={`w-3.5 h-3.5 ${perpLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7.5 7.5 0 0117 6.5M18.5 15A7.5 7.5 0 017 17.5" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>

              {perpError && (
                <div className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400 border-b border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20">
                  {perpError}
                </div>
              )}

              <div className="p-5">
                {perpLoading && perpConnectors.length === 0 ? (
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4m8-8h-4M8 12H4" />
                    </svg>
                    Loading connector data...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {perpConnectors.map(connector => renderConnectorCard(
                      connector,
                      perpSummary.find(item => item.id === connector.meta.id)
                    ))}
                    {perpConnectors.length === 0 && !perpLoading && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No connector data available yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {positions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Total Position Value Card */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Total Position Value</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                    ${formatNumber(totalPositionValue)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Delta Neutral: {deltaNeutralPositions.length}/{positions.length} positions
                  </p>
                </div>

                {/* Net Gain/Loss Card */}
                <div className={`border rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200 ${
                  totalNetGain >= 0
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30'
                }`}>
                  <p className={`text-sm font-medium mb-2 ${
                    totalNetGain >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}>
                    Total Net {totalNetGain >= 0 ? 'Gain' : 'Loss'} (After Fees)
                  </p>
                  <p className={`text-3xl font-bold mb-1 ${
                    totalNetGain >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {totalNetGain >= 0 ? '+' : ''}{formatCurrency(totalNetGain)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={
                      totalNetGain >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }>
                      From {positions.length} short position{positions.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      ({formatSignedCurrency(totalNetGainAllTime)} all time)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wallet Input */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Hyperliquid Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="w-full px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : 'Fetch Positions'}
            </button>

            {lastUpdate && (
              <div className="flex items-center gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last updated: {lastUpdate.toLocaleTimeString()} • Auto-refresh: 30s
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-rose-800 dark:text-rose-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {loading && positions.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-slate-200 dark:border-slate-700 border-t-sky-600"></div>
            <p className="mt-6 text-base text-slate-600 dark:text-slate-400 font-medium">Loading positions...</p>
          </div>
        )}

        {!loading && positions.length === 0 && walletAddress && !error && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-12 text-center border border-slate-200 dark:border-slate-700">
            <svg className="w-16 h-16 mx-auto text-slate-400 dark:text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-base text-slate-700 dark:text-slate-300 font-medium">No short positions found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">This address has no active short positions on Hyperliquid</p>
          </div>
        )}

        {positions.length > 0 && (
          <div className="space-y-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {positions.length} Position{positions.length !== 1 ? 's' : ''}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {positions.map((position, index) => {
                const riskLevel = getRiskLevel(position.distanceToLiquidation);
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
                    key={`${position.coin}-${index}`}
                    className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 open:lg:col-span-2"
                  >
                    {/* Warning Banner for High Risk */}
                    {riskLevel.level === 'critical' && (
                      <div className="bg-rose-500 text-white px-6 py-3 flex items-center gap-2 font-semibold text-sm">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        CRITICAL - NEAR LIQUIDATION
                      </div>
                    )}
                    {riskLevel.level === 'high' && (
                      <div className="bg-amber-500 text-white px-6 py-3 flex items-center gap-2 font-semibold text-sm">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        WARNING - Monitor Position
                      </div>
                    )}

                    {/* Level 1: Essential Information (Always Visible) */}
                    <summary className="p-6 cursor-pointer list-none hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                              {position.coin}
                            </h3>
                            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                              SHORT
                            </span>
                            <svg className="w-5 h-5 text-slate-400 ml-auto transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {formatCurrency(position.positionValueUsd)} • {Math.abs(position.leverage)}x leverage
                          </p>
                        </div>
                      </div>

                      {/* Price Range Visualizer */}
                      <div className="mt-4">
                        {(() => {
                          const liqPrice = position.liquidationPrice;
                          const entryPrice = position.entryPrice;
                          const markPrice = position.markPrice;

                          if (liqPrice <= 0) return null;

                          const minPoint = Math.min(entryPrice, markPrice);
                          const maxPoint = liqPrice;
                          const padding = (maxPoint - minPoint) * 0.15;
                          const chartStartPrice = minPoint - padding;
                          const chartEndPrice = maxPoint + padding;
                          const chartRange = chartEndPrice - chartStartPrice;

                          if (chartRange <= 0) return null;

                          const priceToPercent = (price: number) => (price - chartStartPrice) / chartRange * 100;

                          const entryPercent = priceToPercent(entryPrice);
                          const markPercent = priceToPercent(markPrice);
                          const liqPercent = priceToPercent(liqPrice);
                          const displayLiqPercent = Math.min(liqPercent, 95);
                          const liqCursorPercent = Math.max(0, displayLiqPercent - 1);

                          const priceAt5Percent = liqPrice * (1 - 0.05);
                          const priceAt10Percent = liqPrice * (1 - 0.10);
                          const priceAt20Percent = liqPrice * (1 - 0.20);

                          const pos5 = priceToPercent(priceAt5Percent);
                          const pos10 = priceToPercent(priceAt10Percent);
                          const pos20 = priceToPercent(priceAt20Percent);

                          return (
                            <div className="relative w-full max-w-4xl h-16 mx-auto">
                              {/* Bar with zones */}
                              <div className="relative w-full h-8 top-4 rounded-lg overflow-hidden">
                                <div className="absolute inset-0 flex">
                                  <div className="bg-emerald-500" style={{ width: `${pos20}%` }}></div>
                                  <div className="bg-yellow-500" style={{ width: `${pos10 - pos20}%` }}></div>
                                  <div className="bg-amber-500" style={{ width: `${pos5 - pos10}%` }}></div>
                                  <div className="bg-rose-500" style={{ width: `${liqPercent - pos5}%` }}></div>
                                </div>
                              </div>

                              {/* Cursors */}
                              {/* Entry Price */}
                              <div className="absolute h-8 top-4 -translate-x-1/2" style={{ left: `${entryPercent}%` }}>
                                <div className="relative w-1 h-full bg-blue-600/70 shadow-lg">
                                  <span className="absolute top-10 left-1/2 -translate-x-1/2 text-xs font-bold text-blue-800 dark:text-blue-300 whitespace-nowrap">
                                    Entry: {formatCurrency(entryPrice)}
                                  </span>
                                </div>
                              </div>

                              {/* Mark Price (Current) */}
                              <div className="absolute h-8 top-4 -translate-x-1/2" style={{ left: `${markPercent}%` }}>
                                <div className="relative w-1 h-full bg-white shadow-lg">
                                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-800 dark:text-white whitespace-nowrap">
                                    Current: {formatCurrency(markPrice)}
                                  </span>
                                </div>
                              </div>

                              {/* Liquidation Price */}
                              <div className="absolute h-8 top-4 -translate-x-1/2" style={{ left: `${liqCursorPercent}%` }}>
                                <div className="relative w-1 h-full bg-black shadow-lg">
                                  <span className="absolute top-10 left-1/2 -translate-x-1/2 text-xs font-bold text-black dark:text-white whitespace-nowrap">
                                    Liq: {formatCurrency(liqPrice)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Delta Neutral Status - Simplified */}
                      <div className={`mt-8 mb-4 p-4 rounded-lg border ${
                        position.isDeltaNeutral
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className={`w-4 h-4 ${position.isDeltaNeutral ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              {position.isDeltaNeutral ? (
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              ) : (
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              )}
                            </svg>
                            <span className={`text-sm font-semibold ${
                              position.isDeltaNeutral
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}>
                              {position.isDeltaNeutral ? 'Delta Neutral' : 'Not Delta Neutral'}
                            </span>
                          </div>
                          {position.isDeltaNeutral && (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              ✓ Balanced
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Net Gain/Loss */}
                      <div className={`p-5 rounded-lg border ${
                        (position.netGain || 0) >= 0
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30'
                      }`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-sm font-semibold ${
                            (position.netGain || 0) >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}>
                            Net {(position.netGain || 0) >= 0 ? 'Gain' : 'Loss'}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {position.tradeCount || 0} trades
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold ${
                            (position.netGain || 0) >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {(position.netGain || 0) >= 0 ? '+' : ''}{formatCurrency(position.netGain || 0)}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            ({formatSignedCurrency(netRevenueAllTime)} all time)
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400 font-medium">
                        Click to view detailed information ↓
                      </div>
                    </summary>

                    {/* Level 2: Detailed Information (Expandable) */}
                    <div className="px-6 pb-8 space-y-8 border-t border-slate-200 dark:border-slate-700 pt-8 bg-slate-50/50 dark:bg-slate-900/30">

                      {/* SECTION 1: Funding Rate Analytics */}
                      {position.fundingRate && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                            </svg>
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Funding Rate Analytics</h4>
                          </div>

                          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-6">
                            {/* Current Funding Rate */}
                            <div className="flex justify-between items-center pb-6 border-b border-slate-200 dark:border-slate-700">
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Funding Rate (APR)</p>
                                <p className={`text-3xl font-bold ${
                                  position.fundingRate.currentRateApr >= 10
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : position.fundingRate.currentRateApr >= 5
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}>
                                  {position.fundingRate.currentRateApr >= 0 ? '+' : ''}{formatNumber(position.fundingRate.currentRateApr, 2)}%
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  1hr: {position.fundingRate.currentRate >= 0 ? '+' : ''}{(position.fundingRate.currentRate * 100).toFixed(4)}%
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">7-Day Average</p>
                                <p className={`text-2xl font-semibold ${
                                  position.fundingRate.avgRate7dApr >= 10
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : position.fundingRate.avgRate7dApr >= 5
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-600 dark:text-slate-400'
                                }`}>
                                  {position.fundingRate.avgRate7dApr >= 0 ? '+' : ''}{formatNumber(position.fundingRate.avgRate7dApr, 2)}%
                                </p>
                                <p className={`text-xs mt-1 ${
                                  position.fundingRate.currentRateApr > position.fundingRate.avgRate7dApr
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : position.fundingRate.currentRateApr < position.fundingRate.avgRate7dApr
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}>
                                  {position.fundingRate.currentRateApr > position.fundingRate.avgRate7dApr
                                    ? '↑ Above average'
                                    : position.fundingRate.currentRateApr < position.fundingRate.avgRate7dApr
                                    ? '↓ Below average'
                                    : '→ At average'}
                                </p>
                              </div>
                            </div>

                            {/* Estimated Revenue */}
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

                            {/* Next Funding Time */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Next Funding</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">
                                  {isClient ? formatFundingCountdown(position.fundingRate.nextFundingTime) : '--'}
                                </span>
                              </div>
                            </div>

                            {/* Funding Rate Trend (Mini Chart) */}
                            {position.fundingRate.history.length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-medium">7-Day Funding Rate Trend (APR %, 8h Avg)</p>
                                <div className="h-48">
                                  {(() => {
                                    const history = position.fundingRate.history;
                                    
                                    // 1. Aggregate data
                                    const aggregatedHistory = [];
                                    const groupSize = 8;
                                    for (let i = 0; i < history.length; i += groupSize) {
                                      const group = history.slice(i, i + groupSize);
                                      if (group.length > 0) {
                                        const avgRateApr = group.reduce((sum, h) => sum + h.rateApr, 0) / group.length;
                                        aggregatedHistory.push({ time: group[0].time, rateApr: avgRateApr });
                                      }
                                    }

                                    // 2. SVG and Axis Setup
                                    const yAxisWidth = 35;
                                    const xAxisHeight = 20;
                                    const svgWidth = 640;
                                    const svgHeight = 192;
                                    const chartWidth = svgWidth - yAxisWidth;
                                    const chartHeight = svgHeight - xAxisHeight;
                                    const barGap = 2;
                                    const barWidth = aggregatedHistory.length > 0 ? (chartWidth - (aggregatedHistory.length - 1) * barGap) / aggregatedHistory.length : 0;

                                    const hasNegativeRates = aggregatedHistory.some(h => h.rateApr < 0);

                                    if (hasNegativeRates) {
                                      // BIPOLAR CHART (Positive and Negative)
                                      const maxAbsRate = Math.max(...aggregatedHistory.map(x => Math.abs(x.rateApr)), 0);
                                      const yZero = chartHeight / 2;

                                      return (
                                        <div className="h-full w-full mx-auto" style={{ maxWidth: svgWidth }}>
                                          <svg
                                            width="100%"
                                            height="100%"
                                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                            preserveAspectRatio="xMidYMid meet"
                                          >
                                            {/* Y-axis */}
                                            <g className="y-axis text-[10px] fill-slate-500 dark:fill-slate-400">
                                              <text x={yAxisWidth - 5} y={10} textAnchor="end">{maxAbsRate.toFixed(1)}%</text>
                                              <text x={yAxisWidth - 5} y={yZero} textAnchor="end" dy="0.3em">0%</text>
                                              <text x={yAxisWidth - 5} y={chartHeight - 10} textAnchor="end">-{maxAbsRate.toFixed(1)}%</text>
                                              <line x1={yAxisWidth} y1={yZero} x2={svgWidth} y2={yZero} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" strokeDasharray="2,2" />
                                            </g>
                                            {/* Chart Bars */}
                                            <g transform={`translate(${yAxisWidth}, 0)`}>
                                              {aggregatedHistory.map((h, i) => {
                                                const rate = h.rateApr;
                                                const barHeight = maxAbsRate > 0 ? (Math.abs(rate) / maxAbsRate) * yZero : 0;
                                                const isPositive = rate >= 0;
                                                const x = i * (barWidth + barGap);
                                                const y = isPositive ? yZero - barHeight : yZero;
                                                return (
                                                  <rect key={i} x={x} y={y} width={barWidth} height={barHeight} className={isPositive ? 'fill-emerald-500' : 'fill-rose-500'}>
                                                    <title>{`${new Date(h.time).toLocaleString()}: ${h.rateApr.toFixed(2)}% APR (8h avg)`}</title>
                                                  </rect>
                                                );
                                              })}
                                            </g>
                                            {/* X-axis */}
                                            <g className="x-axis text-[10px] fill-slate-500 dark:fill-slate-400" transform={`translate(${yAxisWidth}, ${chartHeight})`}>
                                              {['7d', '6d', '5d', '4d', '3d', '2d', '1d'].map((label, i) => (
                                                <text key={i} x={(i * 3 + 1.5) * (barWidth + barGap) - (barGap / 2)} y={15} textAnchor="middle">{label}</text>
                                              ))}
                                            </g>
                                          </svg>
                                        </div>
                                      );
                                    } else {
                                      // UNIPOLAR CHART (Only Positive)
                                      const maxRate = Math.max(...aggregatedHistory.map(x => x.rateApr), 0);
                                      return (
                                        <div className="h-full w-full mx-auto" style={{ maxWidth: svgWidth }}>
                                          <svg
                                            width="100%"
                                            height="100%"
                                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                            preserveAspectRatio="xMidYMid meet"
                                          >
                                            {/* Y-axis */}
                                            <g className="y-axis text-[10px] fill-slate-500 dark:fill-slate-400">
                                              <text x={yAxisWidth - 5} y={10} textAnchor="end">{maxRate.toFixed(1)}%</text>
                                              <text x={yAxisWidth - 5} y={chartHeight} textAnchor="end" dy="-2">{maxRate > 0 ? '0%' : ''}</text>
                                            </g>
                                            {/* Chart Bars */}
                                            <g transform={`translate(${yAxisWidth}, 0)`}>
                                              {aggregatedHistory.map((h, i) => {
                                                const rate = h.rateApr;
                                                const barHeight = maxRate > 0 ? (rate / maxRate) * chartHeight : 0;
                                                const x = i * (barWidth + barGap);
                                                const y = chartHeight - barHeight;
                                                return (
                                                  <rect key={i} x={x} y={y} width={barWidth} height={barHeight} className="fill-emerald-500">
                                                    <title>{`${new Date(h.time).toLocaleString()}: ${h.rateApr.toFixed(2)}% APR (8h avg)`}</title>
                                                  </rect>
                                                );
                                              })}
                                            </g>
                                            {/* X-axis */}
                                            <g className="x-axis text-[10px] fill-slate-500 dark:fill-slate-400" transform={`translate(${yAxisWidth}, ${chartHeight})`}>
                                              {['7d', '6d', '5d', '4d', '3d', '2d', '1d'].map((label, i) => (
                                                <text key={i} x={(i * 3 + 1.5) * (barWidth + barGap) - (barGap / 2)} y={15} textAnchor="middle">{label}</text>
                                              ))}
                                            </g>
                                          </svg>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Alert Status */}
                            {position.fundingRate.currentRateApr < 8 && (
                              <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                                </svg>
                                <div>
                                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Low Funding Rate Alert</p>
                                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                    Funding rate is below 8% APR threshold. Consider closing position if rate continues to decline.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* SECTION 2: Position Overview */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                          </svg>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Position Overview</h4>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-4">
                          {/* Total Position Value */}
                          <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-700">
                            <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Total Position Value</span>
                            <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                              {formatCurrency(position.positionValueUsd + ((position.spotBalance || 0) * position.markPrice))}
                            </span>
                          </div>

                          {/* Short Position */}
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

                          {/* Long (Spot) Position */}
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
                                <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency((position.spotBalance || 0) * position.markPrice)}</span>
                              </div>
                            </div>
                          )}

                          {/* Delta Imbalance */}
                          {position.deltaImbalance !== undefined && Math.abs(position.deltaImbalance) > 0.01 && (
                            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-700">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Delta Imbalance</span>
                              <span className={`font-mono text-sm font-semibold ${
                                Math.abs(position.deltaImbalance) < Math.abs(position.positionSize) * 0.05
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }`}>
                                {position.deltaImbalance > 0 ? '+' : ''}{formatNumber(position.deltaImbalance, 4)} {position.coin}
                              </span>
                            </div>
                          )}

                          {/* Margin & Leverage */}
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

                      {/* SECTION 3: Revenue & Fees Breakdown */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                          </svg>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Revenue & Fees</h4>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">Since Last Change</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                Snapshot from the most recent position size update.
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">All Time</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                Cumulative performance across the full history of this pair.
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-lg border border-emerald-200/30 dark:border-emerald-700/30 bg-emerald-50/50 dark:bg-emerald-950/10 p-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Funding Revenue</span>
                                <span className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatSignedCurrency(fundingCurrent)}
                                </span>
                              </div>
                            </div>
                            <div className="rounded-lg border border-emerald-200/30 dark:border-emerald-700/30 bg-emerald-50/50 dark:bg-emerald-950/10 p-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Funding Revenue</span>
                                <span className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatSignedCurrency(fundingAllTime)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border border-rose-200/40 dark:border-rose-700/30 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                              <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Hyperliquid Fees</span>
                              <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                                -{formatCurrency(hyperFeesCurrent)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-rose-200/40 dark:border-rose-700/30 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                              <div>
                                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Hyperliquid Fees</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">({position.tradeCount || 0} trades)</span>
                              </div>
                              <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                                -{formatCurrency(hyperFeesAllTime)}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border border-rose-200/40 dark:border-rose-700/30 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                              <div>
                                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Binance Equiv. Fees</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">(0.1% SPOT)</span>
                              </div>
                              <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                                -{formatCurrency(binanceFeesCurrent)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-rose-200/40 dark:border-rose-700/30 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                              <div>
                                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Binance Equiv. Fees</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">(0.1% SPOT)</span>
                              </div>
                              <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                                -{formatCurrency(binanceFeesAllTime)}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border border-amber-200/40 dark:border-amber-700/30 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                              <div>
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Future Closing Fees</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">(Est.)</span>
                              </div>
                              <span className="font-mono text-base font-semibold text-amber-600 dark:text-amber-400">
                                -{formatCurrency(futureClosingFees)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-amber-200/40 dark:border-amber-700/30 bg-amber-50/40 dark:bg-amber-950/10 p-4">
                              <div>
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Future Closing Fees</span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400">(Est.)</span>
                              </div>
                              <span className="font-mono text-base font-semibold text-amber-600 dark:text-amber-400">
                                -{formatCurrency(futureClosingFees)}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className={`rounded-lg p-5 border ${
                              netCurrentPositive
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/30'
                                : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500/30'
                            }`}>
                              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Net Gain</p>
                              <p className={`mt-1 text-lg font-bold ${
                                netCurrentPositive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {formatSignedCurrency(netRevenueCurrent)}
                              </p>
                            </div>
                            <div className={`rounded-lg p-5 border ${
                              netAllTimePositive
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/30'
                                : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500/30'
                            }`}>
                              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Net Gain</p>
                              <p className={`mt-1 text-lg font-bold ${
                                netAllTimePositive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {formatSignedCurrency(netRevenueAllTime)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {(position.deltaImbalanceValue || 0) > 0.01 && (
                          <div className="flex justify-between items-center bg-yellow-50/50 dark:bg-yellow-950/20 rounded-lg p-4 border border-yellow-200/30 dark:border-yellow-700/30">
                            <div>
                              <span className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">Position Imbalance</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                                ({Math.abs(position.deltaImbalance || 0).toFixed(2)} {position.coin})
                              </span>
                            </div>
                            <span className="font-mono text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                              Risk: {formatCurrency(position.deltaImbalanceValue || 0)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* SECTION 4: Price Analysis */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                          </svg>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Price Analysis</h4>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Entry</p>
                              <p className="font-mono text-base font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(position.entryPrice)}
                              </p>
                            </div>
                            <div className="text-center border-x border-slate-200 dark:border-slate-700">
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Current</p>
                              <p className={`font-mono text-base font-bold ${
                                priceChangePercent < 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {formatCurrency(position.markPrice)}
                              </p>
                              <p className={`text-xs font-medium mt-1 ${
                                priceChangePercent < 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {priceChangePercent > 0 ? '+' : ''}{formatNumber(priceChangePercent, 1)}%
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-rose-700 dark:text-rose-400 font-medium mb-2">Liquidation</p>
                              <p className="font-mono text-base font-bold text-rose-600 dark:text-rose-400">
                                {formatCurrency(position.liquidationPrice)}
                              </p>
                              <p className="text-xs font-medium text-rose-600 mt-1">
                                {priceToLiquidation > 0 ? '+' : ''}{formatNumber(priceToLiquidation, 1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 5: Delta Neutral Action (if not neutral) */}
                      {!position.isDeltaNeutral && position.deltaNeutralAction && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                            </svg>
                            <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400">Action Required</h4>
                          </div>

                          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-500/30 rounded-lg p-6">
                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
                              {position.deltaNeutralAction.reason}
                            </p>
                            <button className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 ${
                              position.deltaNeutralAction.action.includes('buy')
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : 'bg-rose-500 hover:bg-rose-600 text-white'
                            }`}>
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"/>
                              </svg>
                              {position.deltaNeutralAction.action.toUpperCase().replace('_', ' ')}: {formatNumber(position.deltaNeutralAction.amount, 2)} {position.coin}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
