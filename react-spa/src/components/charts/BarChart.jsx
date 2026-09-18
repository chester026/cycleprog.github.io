import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
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
} from './chartTheme';

/**
 * Shared bar chart behind `MinMaxHeartRateBarChart` (T-6.3, audit W-32).
 * Generic `{x, y}` points (see `series.js`, `mode: 'weekly-max'`).
 *
 * @param {Array<{x: string, y: number}>} data
 * @param {string} xLabel
 * @param {string} yLabel
 * @param {string} color
 * @param {string} tooltipName - e.g. "Max HR", used in the default formatter.
 * @param {number} [height=340]
 */
export default function BarChart({ data, xLabel, yLabel, color, tooltipName, height = 340 }) {
  const gradientId = `bar-gradient-${color.replace('#', '')}`;
  return (
    <ChartErrorBoundary data={data}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={color} stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="x" tick={axisTick} axisLine={axisLine} tickLine={false} label={axisLabel(xLabel)} />
          <YAxis tick={axisTick} axisLine={axisLine} tickLine={false} label={axisLabel(yLabel, -90)} width={60} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            formatter={(v) => [v, tooltipName]}
            labelFormatter={(v) => `Week: ${v}`}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            cursor={tooltipCursorFill}
          />
          <Bar dataKey="y" fill={`url(#${gradientId})`} name={tooltipName} barSize={14} radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
