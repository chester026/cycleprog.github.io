// Shared recharts styling for the seven HR/cadence charts (T-6.3, audit
// W-32). Every value here is copied 1:1 from what the pre-dedup components
// passed inline (HeartRateVsSpeedChart.jsx, AverageHeartRateTrendChart.jsx,
// MinMaxHeartRateBarChart.jsx, HeartRateVsElevationChart.jsx,
// CadenceVsSpeedChart.jsx, AverageCadenceTrendChart.jsx,
// CadenceVsElevationChart.jsx) — no visual change, just one copy instead of
// seven. Plain JS objects/strings (not `src/ui/theme.css` variables):
// recharts renders these as SVG presentation attributes via inline
// `style`/props, which is more reliably pixel-identical across browsers as
// literal hex than as `var(--...)`.

export const CHART_COLORS = {
  grid: '#353a44',
  axisLine: '#444',
  tickText: '#b0b8c9',
  tooltipBg: '#23272f',
  tooltipBorder: '#7eaaff',
  tooltipText: '#f6f8ff',
  cursorFill: 'rgb(20,20,27,0.3)',
  heartRate: '#FF5E00',
  speed: '#00B2FF',
  cadence: '#8B5CF6',
};

export const axisTick = { fontSize: 13, fill: CHART_COLORS.tickText };
export const axisLine = { stroke: CHART_COLORS.axisLine };
export const gridProps = { strokeDasharray: '3 6', vertical: false, stroke: CHART_COLORS.grid };

export function axisLabel(value, angle) {
  const base = { value, fill: CHART_COLORS.tickText, fontSize: 14 };
  if (angle === -90) return { ...base, angle: -90, position: 'insideLeft' };
  if (angle === 90) return { ...base, angle: 90, position: 'insideRight' };
  return { ...base, position: 'insideBottomRight', offset: -5 };
}

export const tooltipContentStyle = {
  background: CHART_COLORS.tooltipBg,
  border: `1.5px solid ${CHART_COLORS.tooltipBorder}`,
  fontSize: 15,
  color: CHART_COLORS.tooltipText,
};
export const tooltipLabelStyle = { color: CHART_COLORS.tooltipText };
export const tooltipItemStyle = { color: CHART_COLORS.tooltipText };
export const tooltipCursorFill = { fill: CHART_COLORS.cursorFill };
export const tooltipCursorLine = { stroke: CHART_COLORS.tooltipBorder, strokeWidth: 1 };

export const legendStyle = { color: CHART_COLORS.tickText, fontSize: 13 };
