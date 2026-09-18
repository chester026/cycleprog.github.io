import React from 'react';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import ChartErrorBoundary from '../ChartErrorBoundary';
import {
  axisTick,
  axisLine,
  axisLabel,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  tooltipCursorFill,
  legendStyle,
} from './chartTheme';

/**
 * Shared area(+line) trend chart behind `HeartRateVsSpeedChart`,
 * `AverageHeartRateTrendChart`, `CadenceVsSpeedChart` and
 * `AverageCadenceTrendChart` (T-6.3, audit W-32). Takes generic
 * `{x, y, y2?}` points (see `series.js`'s `useRideSeries`) and up to two
 * `series` defs so callers only supply labels/colors, not markup.
 *
 * @param {Array<{x: string, y: number|null, y2?: number}>} data
 * @param {string} xLabel - x-axis label text.
 * @param {Array<{dataKey: 'y'|'y2', name: string, color: string, kind?: 'area'|'line', yAxisId?: 'left'|'right', axisLabel?: string, unit?: string}>} series
 * @param {(value: number, name: string) => [string|number, string]} [valueFormatter]
 * @param {string} [labelPrefix='Date'] - tooltip label prefix, e.g. "Date" or "Week".
 * @param {number} [height=340]
 */
export default function TrendChart({ data, xLabel, series, valueFormatter, labelPrefix = 'Date', height = 340 }) {
  const hasRightAxis = series.some((s) => s.yAxisId === 'right');
  const gradientId = `trend-gradient-${series[0]?.dataKey || 'y'}-${series[0]?.color?.replace('#', '') || 'c'}`;

  return (
    <ChartErrorBoundary data={data}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
          <defs>
            {series
              .filter((s) => (s.kind || 'area') === 'area')
              .map((s) => (
                <linearGradient key={s.dataKey} id={`${gradientId}-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
                </linearGradient>
              ))}
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="x" tick={axisTick} axisLine={axisLine} tickLine={false} label={axisLabel(xLabel)} />
          <YAxis
            yAxisId="left"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            label={axisLabel(series.find((s) => s.yAxisId !== 'right')?.axisLabel, -90)}
            width={series.find((s) => s.yAxisId !== 'right')?.axisWidth || 60}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={axisTick}
              axisLine={axisLine}
              tickLine={false}
              label={axisLabel(series.find((s) => s.yAxisId === 'right')?.axisLabel, 90)}
              width={60}
            />
          )}
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelFormatter={(v) => `${labelPrefix}: ${v}`}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            cursor={tooltipCursorFill}
            formatter={valueFormatter}
          />
          {series.length > 1 && <Legend wrapperStyle={legendStyle} />}
          {series.map((s) =>
            (s.kind || 'area') === 'area' ? (
              <Area
                key={s.dataKey}
                yAxisId={s.yAxisId || 'left'}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                fill={`url(#${gradientId}-${s.dataKey})`}
                fillOpacity={0.4}
                strokeWidth={3}
                dot={false}
                isAnimationActive
                animationDuration={1200}
                name={s.name}
              />
            ) : (
              <Line
                key={s.dataKey}
                yAxisId={s.yAxisId || 'left'}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={1200}
                name={s.name}
              />
            )
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
