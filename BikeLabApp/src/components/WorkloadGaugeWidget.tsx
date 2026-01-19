import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import Svg, {Path, Circle, Defs, LinearGradient, Stop} from 'react-native-svg';
import {Cache} from '../utils/cache';

interface WorkloadGaugeWidgetProps {}

export const WorkloadGaugeWidget: React.FC<WorkloadGaugeWidgetProps> = () => {
  const [ftpData, setFtpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Загружаем FTP данные из кеша
  useEffect(() => {
    const loadFTPData = async () => {
      try {
        const cached = await Cache.get<any>('ftp_analysis_result');
        if (cached?.data) {
          setFtpData(cached.data);
        }
      } catch (error) {
        console.error('Error loading FTP data for workload:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFTPData();
  }, []);

    // Определяем уровень и процент для gauge с линейной интерполяцией
  const getWorkloadLevel = (minutes: number) => {
    // Диапазоны FTP Workload
    const ranges = [
      { min: 0, max: 30, level: 'Low', color: '#fff', segmentStart: 0, segmentEnd: 25 },
      { min: 30, max: 60, level: 'Normal', color: '#9DE33F', segmentStart: 25, segmentEnd: 50 },
      { min: 60, max: 120, level: 'Good', color: '#E08433', segmentStart: 50, segmentEnd: 75 },
      { min: 120, max: 180, level: 'Overwhelmed', color: '#E77A35', segmentStart: 75, segmentEnd: 90 },
      { min: 180, max: 240, level: 'Outstanding', color: '#8b5cf6', segmentStart: 90, segmentEnd: 100 },
    ];

    // Находим диапазон
    for (const range of ranges) {
      if (minutes >= range.min && minutes < range.max) {
        // Линейная интерполяция внутри диапазона
        const progress = (minutes - range.min) / (range.max - range.min);
        const percent = range.segmentStart + progress * (range.segmentEnd - range.segmentStart);
        return { level: range.level, color: range.color, percent: Math.min(percent, 100) };
      }
    }

    // Если больше 240 минут - Outstanding на 100%
    return { level: 'Outstanding', color: '#8b5cf6', percent: 100 };
  };

  const minutes = ftpData?.minutes || 0;
  const workload = getWorkloadLevel(minutes);

  // Параметры полукруга
  const size = 190;
  const strokeWidth = 16;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;

  // Угол для ползунка (от 0 до 180 градусов)
  // Полукруг: слева 180° (0%) → справа 0° (100%)
  const angleInDegrees = 180 - (workload.percent / 100) * 180;
  const radian = (angleInDegrees * Math.PI) / 180;
  const knobX = center + radius * Math.cos(radian);
  const knobY = center - radius * Math.sin(radian);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Workload</Text>
        <View style={styles.gaugeContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (!ftpData || minutes === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Workload</Text>
        <View style={styles.gaugeContainer}>
          <Text style={styles.emptyText}>No data</Text>
          <Text style={styles.emptySubtext}>Complete workouts to see data</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Workload</Text>

      <View style={styles.gaugeContainer}>
        <Svg width={size} height={size / 1.5 + 50} style={{overflow: 'visible'}}>
          <Defs>
            {/* Градиент сегмент 1: белый */}
            <LinearGradient id="segment1" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </LinearGradient>

            {/* Градиент сегмент 2: зеленый градиент */}
            <LinearGradient id="segment2" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#8EE642" stopOpacity="1" />
              <Stop offset="100%" stopColor="#E4D534" stopOpacity="1" />
            </LinearGradient>

            {/* Градиент сегмент 3: оранжевый */}
            <LinearGradient id="segment3" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#E48634" stopOpacity="1" />
              <Stop offset="100%" stopColor="#E48634" stopOpacity="1" />
            </LinearGradient>

            {/* Градиент сегмент 4: красный градиент */}
            <LinearGradient id="segment4" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#E48634" stopOpacity="1" />
              <Stop offset="100%" stopColor="#F23F3F" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* Фоновый полукруг (без скругления на концах) */}
          <Path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${
              size - strokeWidth / 2
            } ${center}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Сегмент 1: белый (0-25%) - от 180° до 135° */}
          <Path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${
              center + radius * Math.cos((135 * Math.PI) / 180)
            } ${center - radius * Math.sin((135 * Math.PI) / 180)}`}
            fill="none"
            stroke="url(#segment1)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Сегмент 2: зеленый градиент (25-50%) - от 135° до 90° */}
          <Path
            d={`M ${center + radius * Math.cos((135 * Math.PI) / 180)} ${
              center - radius * Math.sin((135 * Math.PI) / 180)
            } A ${radius} ${radius} 0 0 1 ${center} ${strokeWidth / 2}`}
            fill="none"
            stroke="url(#segment2)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Сегмент 3: оранжевый (50-75%) - от 90° до 45° */}
          <Path
            d={`M ${center} ${strokeWidth / 2} A ${radius} ${radius} 0 0 1 ${
              center + radius * Math.cos((45 * Math.PI) / 180)
            } ${center - radius * Math.sin((45 * Math.PI) / 180)}`}
            fill="none"
            stroke="url(#segment3)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Сегмент 4: красный градиент (75-100%) - от 45° до 0° */}
          <Path
            d={`M ${center + radius * Math.cos((45 * Math.PI) / 180)} ${
              center - radius * Math.sin((45 * Math.PI) / 180)
            } A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            fill="none"
            stroke="url(#segment4)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Ползунок (белый круг с тенью) */}
          <Circle
            cx={knobX}
            cy={knobY}
            r={14}
            fill="#fff"
            stroke="#eaeaea"
            strokeWidth={4}
          />
        </Svg>

        {/* Центральное значение */}
        <View style={styles.centerValue}>
          <Text style={styles.percentage}>{workload.percent.toFixed(0)}%</Text>
        </View>

        {/* Метки Low / High */}
        <View style={styles.labels}>
          <Text style={styles.label}>Low</Text>
          <Text style={styles.label}>High</Text>
        </View>
      </View>

      {/* Уровень внизу */}
      <View style={[styles.levelBadge, {backgroundColor: workload.color}]}>
        <Text style={styles.levelText}>{workload.level.toUpperCase()}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 220,
    height: 290,
    backgroundColor: '#F1F0F0',
    marginRight: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 0,
    marginTop: 16,
    alignSelf: 'center',
  },
  gaugeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginTop: 12,
  },
  centerValue: {
    position: 'absolute',
    bottom: 110,
    alignItems: 'center',
  },
  percentage: {
    fontSize: 34,
    fontWeight: '900',
    color: '#1a1a1a',
  },
  labels: {
    position: 'absolute',
    bottom: 75,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  levelBadge: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  levelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#555',
    marginTop: 8,
  },
});
