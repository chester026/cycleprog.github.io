/**
 * MiniChart - the `react-native-gifted-charts` LineChart call shared by
 * Templates D and F (T-5.4). Both used byte-identical `prepareChartData`
 * (now `format.ts`'s `sampleChartData`) and the same `maxValue`/chart-prop
 * set; only the width/spacing/area-fill and the surrounding header markup
 * differed, which stay as props / in each template respectively.
 */
import React from 'react';
import {LineChart} from 'react-native-gifted-charts';
import {sampleChartData} from '../format';

interface MiniChartProps {
  data: number[] | undefined;
  color: string;
  width: number;
  height?: number;
  thickness?: number;
  /** Template D fills the area under the curve; Template F does not. */
  areaChart?: boolean;
  /**
   * Basis for the point `spacing` calc — Template D passes a `width` of
   * 450 to the chart but historically sized spacing off `TEMPLATE_WIDTH -
   * 600` (480), a pre-existing mismatch kept here rather than "fixed" so
   * exported images don't shift. Defaults to `width` (Template F's case,
   * where both used the same number already).
   */
  spacingWidth?: number;
}

/** Renders a smoothed, axis-less sparkline for a ride's speed/HR/cadence stream, or nothing if `data` is empty. */
export const MiniChart: React.FC<MiniChartProps> = ({
  data,
  color,
  width,
  height = 130,
  thickness = 4,
  areaChart,
  spacingWidth,
}) => {
  if (!data || data.length === 0) return null;

  const chartData = sampleChartData(data);
  const maxValue = Math.max(...data) * 1.2;

  return (
    <LineChart
      data={chartData}
      width={width}
      height={height}
      maxValue={maxValue}
      spacing={Math.max(4, Math.floor((spacingWidth ?? width) / chartData.length))}
      curved
      areaChart={areaChart}
      startFillColor={color}
      startOpacity={0.1}
      endOpacity={0.001}
      color={color}
      thickness={thickness}
      hideDataPoints
      hideRules
      hideYAxisText
      hideAxesAndRules
    />
  );
};
