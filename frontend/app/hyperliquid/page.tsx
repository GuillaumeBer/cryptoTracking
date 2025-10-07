'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { endpoints } from '@/lib/api-config';

interface DeltaNeutralAction {
  action: 'buy' | 'sell' | 'increase_short' | 'decrease_short';
  amount: number;
  reason: string;
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
}

export default function HyperliquidPage() {
  const [walletAddress, setWalletAddress] = useState(process.env.NEXT_PUBLIC_DEFAULT_EVM_ADDRESS || '');
  const [positions, setPositions] = useState<HyperliquidPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalFundingPnl, setTotalFundingPnl] = useState(0);
  const [totalNetGain, setTotalNetGain] = useState(0);

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
        setTotalNetGain(totalNet);

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

  const totalPositionValue = positions.reduce((sum, pos) => sum + Math.abs(pos.positionValueUsd), 0);
  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
  const deltaNeutralPositions = positions.filter(p => p.isDeltaNeutral);

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
                  <p className={`text-sm ${
                    totalNetGain >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    From {positions.length} short position{positions.length !== 1 ? 's' : ''}
                  </p>
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

                return (
                  <details
                    key={`${position.coin}-${index}`}
                    className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300"
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

                      {/* Simplified Liquidation Risk */}
                      <div className={`mb-4 p-5 rounded-lg border ${riskLevel.borderColor} ${riskLevel.bgColor}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Liquidation Risk</span>
                          <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md ${riskLevel.color} text-white`}>
                            {riskLevel.level}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold ${riskLevel.textColor}`}>
                            {formatCurrency(position.liquidationPrice)}
                          </span>
                          <span className={`text-base font-semibold ${riskLevel.textColor}`}>
                            ({priceToLiquidation > 0 ? '+' : ''}{formatNumber(priceToLiquidation, 1)}%)
                          </span>
                        </div>
                      </div>

                      {/* Delta Neutral Status - Simplified */}
                      <div className={`mb-4 p-4 rounded-lg border ${
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
                        </div>
                      </div>

                      <div className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400 font-medium">
                        Click to view detailed information ↓
                      </div>
                    </summary>

                    {/* Level 2: Detailed Information (Expandable) */}
                    <div className="px-6 pb-8 space-y-8 border-t border-slate-200 dark:border-slate-700 pt-8 bg-slate-50/50 dark:bg-slate-900/30">

                      {/* SECTION 1: Position Overview */}
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

                      {/* SECTION 2: Revenue & Fees Breakdown */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
                          </svg>
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Revenue & Fees</h4>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700 space-y-3">
                          {/* Funding Revenue */}
                          <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-4 border border-emerald-200/30 dark:border-emerald-700/30">
                            <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Funding Revenue</span>
                            <span className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency(position.fundingPnl || 0)}
                            </span>
                          </div>

                          {/* Hyperliquid Fees */}
                          <div className="flex justify-between items-center bg-rose-50/50 dark:bg-rose-950/20 rounded-lg p-4 border border-rose-200/30 dark:border-rose-700/30">
                            <div>
                              <span className="text-sm text-rose-700 dark:text-rose-400 font-medium">Hyperliquid Fees</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">({position.tradeCount || 0} trades)</span>
                            </div>
                            <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                              -{formatCurrency(position.hyperliquidFees || 0)}
                            </span>
                          </div>

                          {/* Binance Equivalent Fees */}
                          <div className="flex justify-between items-center bg-rose-50/50 dark:bg-rose-950/20 rounded-lg p-4 border border-rose-200/30 dark:border-rose-700/30">
                            <div>
                              <span className="text-sm text-rose-700 dark:text-rose-400 font-medium">Binance Equiv. Fees</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">(0.1% SPOT)</span>
                            </div>
                            <span className="font-mono text-base font-semibold text-rose-600 dark:text-rose-400">
                              -{formatCurrency(position.binanceEquivalentFees || 0)}
                            </span>
                          </div>

                          {/* Future Closing Fees */}
                          <div className="flex justify-between items-center bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-4 border border-amber-200/30 dark:border-amber-700/30">
                            <div>
                              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">Future Closing Fees</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">(Est.)</span>
                            </div>
                            <span className="font-mono text-base font-semibold text-amber-600 dark:text-amber-400">
                              -{formatCurrency(position.futureClosingFees || 0)}
                            </span>
                          </div>

                          {/* Delta Imbalance Exposure (if exists) */}
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

                          {/* Net Gain/Loss Summary */}
                          <div className={`flex justify-between items-center rounded-lg p-5 mt-4 border ${
                            (position.netGain || 0) >= 0
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                              : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30'
                          }`}>
                            <span className={`text-sm font-bold ${
                              (position.netGain || 0) >= 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}>
                              NET {(position.netGain || 0) >= 0 ? 'GAIN' : 'LOSS'}
                            </span>
                            <span className={`font-mono text-xl font-bold ${
                              (position.netGain || 0) >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {(position.netGain || 0) >= 0 ? '+' : ''}{formatCurrency(position.netGain || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 3: Price Analysis */}
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

                      {/* SECTION 4: Delta Neutral Action (if not neutral) */}
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
