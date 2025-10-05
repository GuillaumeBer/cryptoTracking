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
  positionSize: number; // negative for shorts
  positionValueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  leverage: number;
  distanceToLiquidation: number; // percentage
  distanceToLiquidationUsd: number;
  fundingPnl?: number;
  spotBalance?: number;
  isDeltaNeutral?: boolean;
  deltaImbalance?: number;
  deltaNeutralAction?: DeltaNeutralAction;
}

export default function HyperliquidPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [positions, setPositions] = useState<HyperliquidPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [totalFundingPnl, setTotalFundingPnl] = useState(0);

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
        setPositions(result.data.positions || []);
        setTotalFundingPnl(result.data.totalFundingPnl || 0);
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
    if (distancePercent < 5) return { level: 'critical', color: 'bg-red-600', textColor: 'text-red-600', borderColor: 'border-red-600' };
    if (distancePercent < 10) return { level: 'high', color: 'bg-orange-500', textColor: 'text-orange-500', borderColor: 'border-orange-500' };
    if (distancePercent < 20) return { level: 'medium', color: 'bg-yellow-500', textColor: 'text-yellow-500', borderColor: 'border-yellow-500' };
    return { level: 'safe', color: 'bg-green-500', textColor: 'text-green-500', borderColor: 'border-green-500' };
  };

  const totalPositionValue = positions.reduce((sum, pos) => sum + Math.abs(pos.positionValueUsd), 0);
  const totalUnrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
  const deltaNeutralPositions = positions.filter(p => p.isDeltaNeutral);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a0a] dark:to-[#1a1a1a] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>

          <div className="flex flex-col gap-4 mb-6">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-red-600 to-pink-600 dark:from-red-400 dark:to-pink-400 bg-clip-text text-transparent">
              Hyperliquid Delta Neutral Strategy
            </h1>
            {positions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl px-6 py-4 shadow-xl">
                  <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 font-semibold">Total Position Value</p>
                  <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-red-600 to-pink-600 dark:from-red-400 dark:to-pink-400 bg-clip-text text-transparent">
                    ${formatNumber(totalPositionValue)}
                  </p>
                  <p className={`text-sm mt-1 font-semibold ${totalUnrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    Unrealized PnL: {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-500 dark:border-green-600 rounded-2xl px-6 py-4 shadow-xl">
                  <p className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400 mb-1 font-semibold">Funding PnL (All Time)</p>
                  <p className={`text-3xl sm:text-4xl font-bold ${totalFundingPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {totalFundingPnl >= 0 ? '+' : ''}{formatCurrency(totalFundingPnl)}
                  </p>
                  <p className="text-sm mt-1 font-semibold text-green-700 dark:text-green-400">
                    Delta Neutral: {deltaNeutralPositions.length}/{positions.length} positions
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Wallet Input */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-800">
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Hyperliquid Wallet Address</label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="w-full px-8 py-3 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
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
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last updated: {lastUpdate.toLocaleTimeString()} • Auto-refresh: 30s
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shadow-md">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800 dark:text-red-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {loading && positions.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-red-600 dark:border-t-red-400"></div>
            <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 font-medium">Loading positions...</p>
          </div>
        )}

        {!loading && positions.length === 0 && walletAddress && !error && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">No short positions found</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">This address has no active short positions on Hyperliquid</p>
          </div>
        )}

        {positions.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {positions.length} Position{positions.length !== 1 ? 's' : ''}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {positions.map((position, index) => {
                const riskLevel = getRiskLevel(position.distanceToLiquidation);
                const priceChangePercent = ((position.markPrice - position.entryPrice) / position.entryPrice) * 100;
                // For shorts, calculate how much the price can rise before liquidation
                const priceToLiquidation = ((position.liquidationPrice - position.markPrice) / position.markPrice) * 100;

                return (
                  <div
                    key={`${position.coin}-${index}`}
                    className={`relative bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border-2 ${riskLevel.borderColor} rounded-2xl overflow-hidden hover:shadow-2xl hover:scale-[1.01] transition-all duration-300`}
                  >
                    {/* Warning Banner for High Risk */}
                    {riskLevel.level === 'critical' && (
                      <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-2 font-bold text-sm">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        CRITICAL - NEAR LIQUIDATION
                      </div>
                    )}
                    {riskLevel.level === 'high' && (
                      <div className="bg-orange-500 text-white px-4 py-2 flex items-center gap-2 font-semibold text-sm">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        WARNING - Monitor Position
                      </div>
                    )}

                    <div className="p-6">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-5">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">
                              {position.coin}
                            </h3>
                            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-500 text-white shadow-md">
                              SHORT
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{Math.abs(position.leverage)}x Leverage • Margin: {formatCurrency(position.margin)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Position</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {formatCurrency(position.positionValueUsd)}
                          </p>
                        </div>
                      </div>

                      {/* Liquidation Risk - PROMINENT */}
                      <div className={`mb-5 p-4 rounded-xl border-2 ${riskLevel.borderColor} ${riskLevel.level === 'critical' ? 'bg-red-50 dark:bg-red-950/30' : riskLevel.level === 'high' ? 'bg-orange-50 dark:bg-orange-950/30' : riskLevel.level === 'medium' ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300">Liquidation Risk</span>
                          <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-full ${riskLevel.color} text-white shadow-lg`}>
                            {riskLevel.level}
                          </span>
                        </div>

                        {/* Large Liquidation Price Display */}
                        <div className="mb-3">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Liquidation at</span>
                            <span className={`text-2xl font-black ${riskLevel.textColor}`}>
                              {formatCurrency(position.liquidationPrice)}
                            </span>
                            <span className={`text-lg font-bold ${riskLevel.textColor}`}>
                              ({priceToLiquidation > 0 ? '+' : ''}{formatNumber(priceToLiquidation, 1)}%)
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Price needs to move {formatCurrency(position.distanceToLiquidationUsd)} ({formatNumber(position.distanceToLiquidation, 1)}%)
                          </p>
                        </div>

                        {/* Improved Progress Bar - Shows danger level */}
                        <div className="relative w-full h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                          {/* Danger zones */}
                          <div className="absolute inset-0 flex">
                            <div className="w-[5%] bg-red-600"></div>
                            <div className="w-[5%] bg-orange-500"></div>
                            <div className="w-[10%] bg-yellow-500"></div>
                            <div className="flex-1 bg-green-500"></div>
                          </div>

                          {/* Marker showing current position */}
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
                            style={{ left: `${Math.min(position.distanceToLiquidation, 100)}%` }}
                          >
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-gray-900"></div>
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-gray-900"></div>
                          </div>

                          {/* Labels */}
                          <div className="absolute inset-0 flex items-center justify-between px-2 text-xs font-bold text-white pointer-events-none">
                            <span className="drop-shadow-lg">DANGER</span>
                            <span className="drop-shadow-lg">SAFE</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {/* Delta Neutral Badge */}
                        {position.isDeltaNeutral && (
                          <div className="bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 border-2 border-green-500 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-bold text-green-700 dark:text-green-300">DELTA NEUTRAL</span>
                              </div>
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                Spot: {formatNumber(position.spotBalance || 0, 2)} {position.coin}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Not Delta Neutral - Show Warning with Action */}
                        {!position.isDeltaNeutral && position.deltaNeutralAction && (
                          <details className="group bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 border-2 border-yellow-500 rounded-lg overflow-hidden">
                            <summary className="p-3 cursor-pointer list-none hover:bg-yellow-200/50 dark:hover:bg-yellow-900/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-sm font-bold text-yellow-700 dark:text-yellow-300">NOT DELTA NEUTRAL</span>
                                  <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                                  Spot: {formatNumber(position.spotBalance || 0, 2)} {position.coin}
                                </span>
                              </div>
                            </summary>
                            <div className="px-4 pb-4 pt-2 bg-white/50 dark:bg-gray-900/50 border-t border-yellow-300 dark:border-yellow-700">
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Recommendation to reach delta neutral:</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{position.deltaNeutralAction.reason}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-2">
                                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                    position.deltaNeutralAction.action === 'buy'
                                      ? 'bg-green-500 text-white'
                                      : 'bg-red-500 text-white'
                                  }`}>
                                    {position.deltaNeutralAction.action.toUpperCase()}: {formatNumber(position.deltaNeutralAction.amount, 2)} {position.coin}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </details>
                        )}

                        {/* PnL Section - Split between Unrealized and Funding */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                            <div className="text-center">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">Unrealized PnL</span>
                              <p className={`font-mono text-lg font-black ${position.unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {position.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnl)}
                              </p>
                              <p className={`text-xs font-bold ${position.unrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {position.unrealizedPnl >= 0 ? '+' : ''}{formatNumber(position.unrealizedPnlPercent, 2)}%
                              </p>
                            </div>
                          </div>
                          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                            <div className="text-center">
                              <span className="text-xs font-semibold text-green-700 dark:text-green-400 block mb-1">Funding PnL</span>
                              <p className={`font-mono text-lg font-black ${(position.fundingPnl || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {(position.fundingPnl || 0) >= 0 ? '+' : ''}{formatCurrency(position.fundingPnl || 0)}
                              </p>
                              <p className="text-xs font-bold text-green-700 dark:text-green-400">
                                All Time
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Size and Spot Balance */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Short Size</span>
                            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                              {formatNumber(Math.abs(position.positionSize), 4)} {position.coin}
                            </span>
                          </div>
                          {(position.spotBalance || 0) > 0 && (
                            <div className="flex justify-between items-center py-2 bg-green-50 dark:bg-green-900/20 rounded px-2">
                              <span className="text-sm text-green-700 dark:text-green-400 font-semibold">Spot Balance</span>
                              <span className="font-mono text-sm font-bold text-green-700 dark:text-green-300">
                                {formatNumber(position.spotBalance || 0, 4)} {position.coin}
                              </span>
                            </div>
                          )}
                          {position.deltaImbalance !== undefined && Math.abs(position.deltaImbalance) > 0.01 && (
                            <div className="flex justify-between items-center py-1">
                              <span className="text-xs text-gray-500 dark:text-gray-400">Delta Imbalance</span>
                              <span className={`font-mono text-xs font-semibold ${Math.abs(position.deltaImbalance) < Math.abs(position.positionSize) * 0.05 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                {position.deltaImbalance > 0 ? '+' : ''}{formatNumber(position.deltaImbalance, 4)} {position.coin}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Prices Compact */}
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Entry</p>
                            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                              {formatCurrency(position.entryPrice)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current</p>
                            <p className={`font-mono text-sm font-bold ${priceChangePercent < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {formatCurrency(position.markPrice)}
                            </p>
                            <p className={`text-xs font-medium ${priceChangePercent < 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {priceChangePercent > 0 ? '+' : ''}{formatNumber(priceChangePercent, 1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-red-700 dark:text-red-400 font-semibold mb-1">Liquidation</p>
                            <p className="font-mono text-sm font-bold text-red-600 dark:text-red-400">
                              {formatCurrency(position.liquidationPrice)}
                            </p>
                            <p className="text-xs font-medium text-red-600">
                              {priceToLiquidation > 0 ? '+' : ''}{formatNumber(priceToLiquidation, 1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
