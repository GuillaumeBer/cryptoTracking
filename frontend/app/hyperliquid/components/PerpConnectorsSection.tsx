'use client';

import type { PerpConnectorMode, PerpConnectorResult, PerpConnectorSummary } from '../types';
import { ConnectorCard } from './ConnectorCard';

interface PerpConnectorsSectionProps {
  connectors: PerpConnectorResult[];
  summaries: PerpConnectorSummary[];
  mode: PerpConnectorMode;
  loading: boolean;
  error: string | null;
  onModeChange: (mode: PerpConnectorMode) => void;
  onRefresh: () => void;
}

export function PerpConnectorsSection({
  connectors,
  summaries,
  mode,
  loading,
  error,
  onModeChange,
  onRefresh,
}: PerpConnectorsSectionProps) {
  return (
    <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/50 shadow-sm">
      <div className="p-5 border-b border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Emerging Perp Venues</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aggregated funding and liquidity scouting across connectors. Mode:{' '}
            <span className="font-medium">{mode}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/50 p-1">
            {(['auto', 'mock', 'live'] as PerpConnectorMode[]).map((option) => (
              <button
                key={option}
                onClick={() => onModeChange(option)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors duration-150 ${
                  mode === option
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {option.toUpperCase()}
              </button>
            ))}
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

      {error && (
        <div className="px-5 py-3 text-sm text-rose-600 dark:text-rose-400 border-b border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20">
          {error}
        </div>
      )}

      <div className="p-5">
        {loading && connectors.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4m8-8h-4M8 12H4" />
            </svg>
            Loading connector data...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {connectors.map((connector) => (
              <ConnectorCard
                key={connector.meta.id}
                connector={connector}
                summary={summaries.find((item) => item.id === connector.meta.id)}
              />
            ))}
            {connectors.length === 0 && !loading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No connector data available yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
