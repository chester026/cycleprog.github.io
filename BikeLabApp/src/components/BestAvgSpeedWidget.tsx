import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Svg, {Line} from 'react-native-svg';
import type {Activity} from '../types/activity';

interface BestAvgSpeedWidgetProps {
  activities: Activity[];
}

export const BestAvgSpeedWidget: React.FC<BestAvgSpeedWidgetProps> = ({
  activities,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  // Вычисляем среднюю скорость по месяцам за последние 6 месяцев
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleString('en', {month: 'short'});
      const year = date.getFullYear();
      const month = date.getMonth();

      // Фильтруем активности за этот месяц
      const monthActivities = activities.filter(a => {
        const activityDate = new Date(a.start_date);
        return (
          activityDate.getFullYear() === year &&
          activityDate.getMonth() === month
        );
      });

      // Считаем среднюю скорость
      let avgSpeed = 0;
      if (monthActivities.length > 0) {
        const totalSpeed = monthActivities.reduce(
          (sum, a) => sum + (a.average_speed || 0) * 3.6,
          0,
        );
        avgSpeed = totalSpeed / monthActivities.length;
      }

      months.push({
        label: monthKey,
        speed: avgSpeed,
      });
    }

    return months;
  }, [activities]);

  // Максимальная скорость для масштабирования
  const maxSpeed = Math.max(...monthlyData.map(m => m.speed), 35);
  const targetSpeed = 30; // Целевая скорость

  // Позиция линии 30 km/h (настраивается вручную для идеального вида)
  const TARGET_LINE_POSITION = 100; // px от низа области баров (настрой по вкусу)

  return (
    <View style={styles.container}>

      {/* Лучший результат сверху */}
      <View style={styles.bestSpeedContainer}>
        <Text style={styles.bestSpeed}>
          {Math.max(...monthlyData.map(m => m.speed)).toFixed(0)} km/h
        </Text>
        <Text style={styles.bestSpeedLabel}>Best avg. speed</Text>
      </View>

      {/* График */}
      <View style={styles.chartContainer}>
        {/* Бары */}
        <View style={styles.barsContainer}>
          {monthlyData.map((month, index) => {
            const heightPercent = (month.speed / maxSpeed) * 100;
            const isMax =
              month.speed === Math.max(...monthlyData.map(m => m.speed));
            const isSelected = selectedMonth === index;

            return (
              <TouchableOpacity
                key={index}
                style={styles.barWrapper}
                onPress={() => setSelectedMonth(isSelected ? null : index)}
                activeOpacity={0.7}
              >
                {/* Tooltip */}
                {isSelected && month.speed > 0 && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>
                      {month.speed.toFixed(1)} km/h
                    </Text>
                  </View>
                )}

                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${heightPercent}%`,
                        backgroundColor: isSelected
                          ? '#7DA6FF'
                          : isMax
                          ? '#274dd3'
                          : '#ACB6D1',
                         
                      },
                    ]}
                  />
                </View>
                <Text style={styles.monthLabel}>{month.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Целевая линия 30 km/h (SVG для пунктира) */}
        <View
          style={[
            styles.targetLineContainer,
            {bottom: TARGET_LINE_POSITION},
          ]}
        >
          <Svg height="3" width="145" style={styles.dashedLineSvg}>
            <Line
              x1="0"
              y1="0"
              x2="142"
              y2="0"
              stroke="#666"
              strokeWidth="3"
              strokeDasharray="4,4"
            />
          </Svg>
          <Text style={styles.targetLabel}>{targetSpeed} km/h</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 220,
    height: 250,
    backgroundColor: '#f1f0f0',
    padding: 16,
    marginRight: 8,
   
  },
  bestSpeedContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bestSpeed: {
    fontSize: 29,
    fontWeight: '900',
    color: '#1a1a1a',
  },
  bestSpeedLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 0,
  },
  chartContainer: {
    flex: 1,
    position: 'relative',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: '100%',
    paddingBottom: 20, // Место для месяцев
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barContainer: {
    width: 25,
    height: '70%',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  bar: {
    width: '100%',
    borderRadius: 16,
    minHeight: 8,
    borderWidth: 1.5,
    borderColor: '#F1F0F0',

  },
  monthLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    fontWeight: '600',
    position: 'absolute',
    bottom: -20,
  },
  targetLineContainer: {
    position: 'absolute',
    left: 0,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    opacity: 0.25,
  },
  dashedLineSvg: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 10,
    color: 'rgba(0, 0, 0, 1)',
    marginLeft: 8,
    fontWeight: '700',
  },
  tooltip: {
    position: 'absolute',
    width: 75,
    top: 0,
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    zIndex: 1000,
  },
  tooltipText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
});
