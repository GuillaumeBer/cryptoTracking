'use client';

import { formatCurrency } from '../../utils/formatters';

interface PriceRiskBarProps {
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  distancePercent: number;
}

function clampPercent(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function PriceMarker({
  label,
  value,
  position,
  emphasis,
}: {
  label: string;
  value: number;
  position: number;
  emphasis?: 'low' | 'medium' | 'high';
}) {
  const baseColor =
    emphasis === 'high'
      ? 'text-rose-600 dark:text-rose-400'
      : emphasis === 'medium'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-slate-600 dark:text-slate-300';

  return (
    <div
      className="absolute -bottom-7 flex flex-col items-center"
      style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
    >
      <div className="h-4 w-px bg-slate-400 dark:bg-slate-500" />
      <div className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${baseColor}`}>
        {label}
      </div>
      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        {formatCurrency(value)}
      </div>
    </div>
  );
}

export function PriceRiskBar({ entryPrice, markPrice, liquidationPrice, distancePercent }: PriceRiskBarProps) {
  const prices = [entryPrice, markPrice, liquidationPrice];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice === minPrice) {
    return null;
  }

  const range = maxPrice - minPrice;
  const entryPosition = clampPercent(((entryPrice - minPrice) / range) * 100);
  const markPosition = clampPercent(((markPrice - minPrice) / range) * 100);
  const liquidationPosition = clampPercent(((liquidationPrice - minPrice) / range) * 100);

  const isDanger = distancePercent < 10;
  const dangerStart = clampPercent(liquidationPosition - 8);
  const dangerWidth = clampPercent(liquidationPosition - dangerStart);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>Price positioning</span>
        {isDanger ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-600 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Danger zone
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Healthy buffer
          </span>
        )}
      </div>

      <div className="relative h-3 rounded-full bg-slate-200/80 dark:bg-slate-700/60">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400/30 via-amber-400/30 to-rose-500/40" />
        <div
          className="absolute top-0 h-full rounded-r-full bg-rose-500/40"
          style={{ left: `${dangerStart}%`, width: `${dangerWidth}%` }}
        />
        <div
          className="absolute -top-1 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900/80 shadow-sm dark:border-slate-800"
          style={{ left: `${markPosition}%` }}
        />
        <PriceMarker label="Entry" value={entryPrice} position={entryPosition} />
        <PriceMarker
          label="Mark"
          value={markPrice}
          position={markPosition}
          emphasis={isDanger ? 'high' : 'medium'}
        />
        <PriceMarker label="Liquidation" value={liquidationPrice} position={liquidationPosition} emphasis="high" />
      </div>

      <div className="mt-9 flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
