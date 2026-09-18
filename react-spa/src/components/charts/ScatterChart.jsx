import React from 'react';
import {
  ScatterChart as RechartsScatterChart,
  Scatter,
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
  tooltipCursorLine,
} from './chartTheme';

/**
 * Shared scatter chart behind `HeartRateVsElevationChart` and
 * `CadenceVsElevationChart` (T-6.3, audit W-32). Generic `{x, y, date}`
 * points (see `series.js`, `mode: 'scatter'`).
 *
 * @param {Array<{x: number, y: number, date: string}>} data
 * @param {string} xLabel
 * @param {string} yLabel
 * @param {number} [yAxisWidth=60]
 * @param {string} color
 * @param {(value: number, name: string) => [string|number, string]} valueFormatter
 * @param {number} [height=340]
 */
export default function ScatterChart({ data, xLabel, yLabel, yAxisWidth = 60, color, valueFormatter, height = 340 }) {
  return (
    <ChartErrorBoundary data={data}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsScatterChart margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="x" type="number" tick={axisTick} axisLine={axisLine} tickLine={false} label={axisLabel(xLabel)} />
          <YAxis
            dataKey="y"
            type="number"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            label={axisLabel(yLabel, -90)}
            width={yAxisWidth}
          />
          <Tooltip
            cursor={tooltipCursorLine}
            contentStyle={tooltipContentStyle}
            formatter={valueFormatter}
            labelFormatter={(_, p) => `Date: ${p && p.length ? p[0].payload.date : ''}`}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Scatter name="Workout" data={data} fill={color} />
        </RechartsScatterChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
