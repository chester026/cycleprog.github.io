import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, Dimensions, TouchableOpacity} from 'react-native';
import {LineChart} from 'react-native-chart-kit';
import {Circle} from 'react-native-svg';

interface ProgressData {
  avg: number;
  all: number[];
  start?: Date;
  end?: Date;
}

interface ProgressChartProps {
  data: ProgressData[];
}

const getCategory = (score: number) => {
  if (score >= 80) return {label: 'Excellent', color: '#16a34a'};
  if (score >= 65) return {label: 'Good', color: '#3b82f6'};
  if (score >= 50) return {label: 'Steady', color: '#f59e0b'};
  if (score >= 30) return {label: 'Low', color: '#f97316'};
  return {label: 'Off-plan', color: '#ef4444'};
};

export const ProgressChart: React.FC<ProgressChartProps> = ({data}) => {
  const [selectedPoint, setSelectedPoint] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const progressValues = data.map(item => item.avg);
    const labels = data.map((_, index) => `${index + 1}`);

    return {
      labels,
      datasets: [
        {
          data: progressValues,
          strokeWidth: 3,
          color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        },
      ],
    };
  }, [data]);

  const lastPeriod = data && data.length > 0 ? data[data.length - 1] : null;
  const prevPeriod =
    data && data.length > 1 ? data[data.length - 2] : null;

  if (!chartData || !lastPeriod) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data to display</Text>
        </View>
      </View>
    );
  }

  const lastScore = lastPeriod.avg;
  const prevScore = prevPeriod ? prevPeriod.avg : null;
  const delta =
    prevScore !== null ? Math.round((lastScore - prevScore) * 10) / 10 : null;
  const category = getCategory(lastScore);

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const screenWidth = Dimensions.get('window').width;

  // Детализация для выбранной точки
  const selectedPeriodData =
    selectedPoint !== null ? data[selectedPoint.index] : null;
  const selectedCategory = selectedPeriodData
    ? getCategory(selectedPeriodData.avg)
    : null;

  const breakdownLabels = [
    'Flat Speed',
    'Hill Speed',
    'HR Zones',
    'Long Rides',
    'Easy Rides',
  ];

  const handleDataPointClick = (dataPoint: any) => {
    const {index, x, y, dataset} = dataPoint;
    
    // Если кликнули на ту же точку - закрываем tooltip
    if (selectedPoint && selectedPoint.index === index) {
      setSelectedPoint(null);
    } else {
      // Сохраняем индекс и координаты точки
      // Корректируем позицию, чтобы tooltip не выходил за границы
      const tooltipWidth = 240;
      const chartMargin = 16;
      let adjustedX = x;
      
      // Проверяем, не выходит ли tooltip за левую границу
      if (x - tooltipWidth / 2 < chartMargin) {
        adjustedX = tooltipWidth / 2 + chartMargin;
      }
      
      // Проверяем, не выходит ли tooltip за правую границу
      if (x + tooltipWidth / 2 > screenWidth - chartMargin) {
        adjustedX = screenWidth - tooltipWidth / 2 - chartMargin;
      }
      
      setSelectedPoint({
        index,
        x: adjustedX,
        y: y,
      });
    }
  };

  // Декоратор для подсветки выбранной точки
  const renderDecorator = (index: number) => {
    if (selectedPoint !== null && index === selectedPoint.index) {
      return (
        <Circle
          key={`decorator-${index}`}
          cx={0}
          cy={0}
          r={2}
          fill="#3b82f6"
          stroke="#fff"
          strokeWidth={1}
        />
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* Header with Score */}
      <View style={styles.header}>
        <View style={styles.scoreContainer}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreValueContainer}>
            <Text style={styles.scoreValue}>{lastScore}</Text>
            <Text style={styles.scoreUnit}>efr</Text>
            {delta !== null && (
              <Text
                style={[
                  styles.scoreDelta,
                  delta >= 0 ? styles.deltaPositive : styles.deltaNegative,
                ]}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
              </Text>
            )}
            </View>
           
             <Text style={styles.periodText}>
                Period: {formatDate(lastPeriod.start)} – {formatDate(lastPeriod.end)}
            </Text>
          </View>
          
        </View>
      </View>

      {/* Chart */}
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          width={screenWidth - 4}
          height={180}
          chartConfig={{
            backgroundColor: '#f8f8fa',
            backgroundGradientFrom: '#f8f8fa',
            backgroundGradientTo: '#f8f8fa',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
            style: {
              borderRadius: 0,
            },
            propsForDots: {
              r: '2',
              strokeWidth: '3',
              stroke: '#3b82f6',
            },
            propsForBackgroundLines: {
              strokeDasharray: '0',
              stroke: '#e1e1e1',
              strokeWidth: 0.5,
            },
          }}
          bezier
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={false}
          withVerticalLines={false}
          withHorizontalLines={true}
          withVerticalLabels={true}
          withHorizontalLabels={true}
          fromZero={true}
          segments={4}
          onDataPointClick={handleDataPointClick}
          decorator={renderDecorator}
        />

        {/* Tooltip у точки на графике */}
        {selectedPoint !== null && selectedPeriodData && selectedCategory && (
          <View
            style={[
              styles.tooltip,
              {
                position: 'absolute',
                left: selectedPoint.x - 120, // Центрируем tooltip
                top: Math.max(10, selectedPoint.y - 160), // Над точкой, минимум 10px сверху
              },
            ]}>
            {/* Стрелка вниз */}
            <View style={styles.tooltipArrow} />
            
            <View style={styles.tooltipContent}>
              <View style={styles.tooltipHeader}>
                <Text style={styles.tooltipTitle}>
                  Block {selectedPoint.index + 1} •{' '}
                  {formatDate(selectedPeriodData.start)} –{' '}
                  {formatDate(selectedPeriodData.end)}
                </Text>
                <TouchableOpacity onPress={() => setSelectedPoint(null)}>
                  <Text style={styles.tooltipClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tooltipBody}>
                <Text style={styles.tooltipValue}>
                  Effort rate:{' '}
                  <Text style={styles.tooltipValueBold}>
                    {selectedPeriodData.avg}%
                  </Text>{' '}
                  <Text
                    style={[
                      styles.tooltipCategory,
                      {color: selectedCategory.color},
                    ]}>
                    ({selectedCategory.label})
                  </Text>
                </Text>
                <View style={styles.tooltipBreakdown}>
                  {selectedPeriodData.all.map((value, index) => (
                    <View key={index} style={styles.tooltipBreakdownRow}>
                      <Text style={styles.tooltipBreakdownLabel}>
                        {breakdownLabels[index]}:
                      </Text>
                      <Text style={styles.tooltipBreakdownValue}>{value}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Footer Info */}
      <View style={styles.footer}>
        <View style={styles.effortRateContainer}>
            <View style={styles.categoryRow}>
                <Text style={styles.categoryLabel}>Effort rate</Text>
                <View
                style={[styles.categoryBadge, {borderColor: category.color}]}>
                <Text style={[styles.categoryText, {color: category.color}]}>
                    {category.label}
                </Text>
                </View>
           </View>
       
          </View>
      
        <Text style={styles.description}>
          Rate shows % completion per block. Higher is better; 70%+ indicates
          consistent adherence.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f8fa',
    padding: 16,
   
   
  },
  effortRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
  },
  tooltip: {
    width: 240,
    zIndex: 1000,
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1a1a1a',
    zIndex: 1001,
  },
  tooltipContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tooltipTitle: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    flex: 1,
  },
  tooltipClose: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  tooltipBody: {
    gap: 8,
  },
  tooltipValue: {
    fontSize: 13,
    color: '#ccc',
  },
  tooltipValueBold: {
    fontWeight: '700',
    color: '#fff',
  },
  tooltipCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  tooltipBreakdown: {
    marginTop: 8,
    gap: 4,
  },
  tooltipBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipBreakdownLabel: {
    fontSize: 11,
    color: '#888',
  },
  tooltipBreakdownValue: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    marginBottom: 16,
  },
  scoreContainer: {
    gap: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoreValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -3,
  },
  scoreUnit: {
    fontSize: 20,
    color: '#1a1a1a',
    fontWeight: '800',
    marginTop: 20,
  },
  scoreDelta: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginLeft: 8,
  },
  deltaPositive: {
    color: '#16a34a',
  },
  deltaNegative: {
    color: '#ef4444',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartContainer: {
    marginBottom: 16,
    marginLeft: -32,
  },
  chart: {
    borderRadius: 0,
  },
  footer: {
    marginTop: 8,
    gap: 8,
  },
  periodText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});

