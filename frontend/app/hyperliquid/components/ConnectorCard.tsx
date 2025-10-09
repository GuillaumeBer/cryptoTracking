'use client';

import type { PerpConnectorResult, PerpConnectorSummary } from '../types';
import { formatCurrency, formatNumber, formatPercent } from '../utils/formatters';

interface ConnectorCardProps {
  connector: PerpConnectorResult;
  summary?: PerpConnectorSummary;
}

export function ConnectorCard({ connector, summary }: ConnectorCardProps) {
  const topMarkets = [...connector.markets]
    .sort((a, b) => b.fundingRateAnnualized - a.fundingRateAnnualized)
    .slice(0, 3);

  return (
    <div
      className="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col"
    >
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{connector.meta.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{connector.meta.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {summary?.source === 'live' ? 'Live feed' : 'Mock feed'}
              </span>
              {connector.meta.requiresApiKey && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  API key required
                </span>
              )}
              {summary?.lastUpdated && <span>Updated {new Date(summary.lastUpdated).toLocaleTimeString()}</span>}
              {summary?.marketCount !== undefined && <span>{summary.marketCount} markets</span>}
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
          <p className="text-sm text-slate-500 dark:text-slate-400">No market data available.</p>
        ) : (
          topMarkets.map((market) => (
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
                    Maker {formatNumber(market.makerFeeBps / 100, 2)} bps – Taker {formatNumber(market.takerFeeBps / 100, 2)} bps
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
}
