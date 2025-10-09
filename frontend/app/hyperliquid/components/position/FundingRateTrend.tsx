import { useMemo } from 'react';

import type { FundingRateHistoryPoint } from '../../types';

const SVG_WIDTH = 640;
const SVG_HEIGHT = 192;
const Y_AXIS_WIDTH = 35;
const X_AXIS_HEIGHT = 20;
const BAR_GAP = 2;
const GROUP_SIZE = 8;
const TIME_BUCKET_LABELS = ['7d', '6d', '5d', '4d', '3d', '2d', '1d'];

interface AggregatedFundingPoint {
  time: number;
  rateApr: number;
}

interface FundingRateTrendProps {
  history: FundingRateHistoryPoint[];
  className?: string;
}

function aggregateFundingHistory(history: FundingRateHistoryPoint[]): AggregatedFundingPoint[] {
  if (!history?.length) {
    return [];
  }

  const aggregated: AggregatedFundingPoint[] = [];

  for (let index = 0; index < history.length; index += GROUP_SIZE) {
    const group = history.slice(index, index + GROUP_SIZE);
    if (group.length === 0) {
      continue;
    }

    const averageRateApr = group.reduce((sum, point) => sum + point.rateApr, 0) / group.length;
    aggregated.push({ time: group[0].time, rateApr: averageRateApr });
  }

  return aggregated;
}

interface ChartProps {
  data: AggregatedFundingPoint[];
}

function DivergingBarChart({ data }: ChartProps) {
  const chartWidth = SVG_WIDTH - Y_AXIS_WIDTH;
  const chartHeight = SVG_HEIGHT - X_AXIS_HEIGHT;
  const yZero = chartHeight / 2;
  const barWidth = data.length > 0 ? (chartWidth - (data.length - 1) * BAR_GAP) / data.length : 0;
  const maxAbsRate = Math.max(...data.map((point) => Math.abs(point.rateApr)), 0);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
      <g className="y-axis text-[10px] fill-slate-500 dark:fill-slate-400">
        <text x={Y_AXIS_WIDTH - 5} y={10} textAnchor="end">
          {maxAbsRate.toFixed(1)}%
        </text>
        <text x={Y_AXIS_WIDTH - 5} y={yZero} textAnchor="end" dy="0.3em">
          0%
        </text>
        <text x={Y_AXIS_WIDTH - 5} y={chartHeight - 10} textAnchor="end">
          -{maxAbsRate.toFixed(1)}%
        </text>
        <line
          x1={Y_AXIS_WIDTH}
          y1={yZero}
          x2={SVG_WIDTH}
          y2={yZero}
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      </g>
      <g transform={`translate(${Y_AXIS_WIDTH}, 0)`}>
        {data.map((point, index) => {
          const rate = point.rateApr;
          const barHeight = maxAbsRate > 0 ? (Math.abs(rate) / maxAbsRate) * yZero : 0;
          const isPositive = rate >= 0;
          const x = index * (barWidth + BAR_GAP);
          const y = isPositive ? yZero - barHeight : yZero;

          return (
            <rect
              key={`${point.time}-${index}`}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              className={isPositive ? 'fill-emerald-500' : 'fill-rose-500'}
            >
              <title>{`${new Date(point.time).toLocaleString()}: ${point.rateApr.toFixed(2)}% APR (8h avg)`}</title>
            </rect>
          );
        })}
      </g>
      <g className="x-axis text-[10px] fill-slate-500 dark:fill-slate-400" transform={`translate(${Y_AXIS_WIDTH}, ${chartHeight})`}>
        {TIME_BUCKET_LABELS.map((label, index) => (
          <text key={label} x={(index * 3 + 1.5) * (barWidth + BAR_GAP) - BAR_GAP / 2} y={15} textAnchor="middle">
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
}

function PositiveBarChart({ data }: ChartProps) {
  const chartWidth = SVG_WIDTH - Y_AXIS_WIDTH;
  const chartHeight = SVG_HEIGHT - X_AXIS_HEIGHT;
  const barWidth = data.length > 0 ? (chartWidth - (data.length - 1) * BAR_GAP) / data.length : 0;
  const maxRate = Math.max(...data.map((point) => point.rateApr), 0);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
      <g className="y-axis text-[10px] fill-slate-500 dark:fill-slate-400">
        <text x={Y_AXIS_WIDTH - 5} y={10} textAnchor="end">
          {maxRate.toFixed(1)}%
        </text>
        <text x={Y_AXIS_WIDTH - 5} y={chartHeight} textAnchor="end" dy="-2">
          {maxRate > 0 ? '0%' : ''}
        </text>
      </g>
      <g transform={`translate(${Y_AXIS_WIDTH}, 0)`}>
        {data.map((point, index) => {
          const rate = point.rateApr;
          const barHeight = maxRate > 0 ? (rate / maxRate) * (chartHeight - 4) : 0;
          const x = index * (barWidth + BAR_GAP);
          const y = chartHeight - barHeight;

          return (
            <rect key={`${point.time}-${index}`} x={x} y={y} width={barWidth} height={barHeight} className="fill-emerald-500">
              <title>{`${new Date(point.time).toLocaleString()}: ${point.rateApr.toFixed(2)}% APR (8h avg)`}</title>
            </rect>
          );
        })}
      </g>
      <g className="x-axis text-[10px] fill-slate-500 dark:fill-slate-400" transform={`translate(${Y_AXIS_WIDTH}, ${chartHeight})`}>
        {TIME_BUCKET_LABELS.map((label, index) => (
          <text key={label} x={(index * 3 + 1.5) * (barWidth + BAR_GAP) - BAR_GAP / 2} y={15} textAnchor="middle">
            {label}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function FundingRateTrend({ history, className }: FundingRateTrendProps) {
  const aggregatedHistory = useMemo(() => aggregateFundingHistory(history), [history]);

  if (aggregatedHistory.length === 0) {
    return (
      <p className={['text-xs text-slate-500 dark:text-slate-400', className].filter(Boolean).join(' ')}>
        Funding history unavailable.
      </p>
    );
  }

  const hasNegativeRates = aggregatedHistory.some((point) => point.rateApr < 0);

  return (
    <div className={['h-48 w-full mx-auto', className].filter(Boolean).join(' ')} style={{ maxWidth: SVG_WIDTH }}>
      {hasNegativeRates ? <DivergingBarChart data={aggregatedHistory} /> : <PositiveBarChart data={aggregatedHistory} />}
    </div>
  );
}

