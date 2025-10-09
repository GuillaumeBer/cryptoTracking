'use client';

import { useMemo } from 'react';
import type { HyperliquidPosition } from '../types';
import { formatCurrency, formatNumber, formatSignedCurrency } from '../utils/formatters';
import { PositionCard } from './PositionCard';

interface PositionsSectionProps {
  positions: HyperliquidPosition[];
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  walletAddress: string;
  onWalletAddressChange: (value: string) => void;
  onRefresh: () => Promise<void>;
  totalNetGain: number;
  totalNetGainAllTime: number;
  isClient: boolean;
}

export function PositionsSection({
  positions,
  loading,
  error,
  lastUpdate,
  walletAddress,
  onWalletAddressChange,
  onRefresh,
  totalNetGain,
  totalNetGainAllTime,
  isClient,
}: PositionsSectionProps) {
  const totalPositionValue = useMemo(
    () => positions.reduce((sum, pos) => sum + Math.abs(pos.positionValueUsd), 0),
    [positions],
  );

  const deltaNeutralCount = useMemo(() => positions.filter((position) => position.isDeltaNeutral).length, [positions]);

  return (
    <section className="space-y-8">
      {positions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Total Position Value</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mb-1">${formatNumber(totalPositionValue)}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Delta Neutral: {deltaNeutralCount}/{positions.length} positions
            </p>
          </div>

          <div
            className={`border rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200 ${
              totalNetGain >= 0
                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/30'
            }`}
          >
            <p
              className={`text-sm font-medium mb-2 ${
                totalNetGain >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              Total Net {totalNetGain >= 0 ? 'Gain' : 'Loss'} (After Fees)
            </p>
            <p
              className={`text-3xl font-bold mb-1 ${
                totalNetGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {totalNetGain >= 0 ? '+' : ''}
              {formatCurrency(totalNetGain)}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={totalNetGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                From {positions.length} short position{positions.length !== 1 ? 's' : ''}
              </span>
              <span className="text-slate-500 dark:text-slate-400">({formatSignedCurrency(totalNetGainAllTime)} all time)</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Hyperliquid Wallet Address
          </label>
          <input
            type="text"
            value={walletAddress}
            onChange={(event) => onWalletAddressChange(event.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
          />
        </div>
        <button
          onClick={() => {
            void onRefresh();
          }}
          disabled={loading}
          className="w-full px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          ) : (
            'Fetch Positions'
          )}
        </button>

        {lastUpdate && (
          <div className="flex items-center gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Last updated: {lastUpdate.toLocaleTimeString()} · Auto-refresh: 30s
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg">
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
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
            {positions.map((position, index) => (
              <PositionCard key={`${position.coin}-${index}`} position={position} isClient={isClient} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
