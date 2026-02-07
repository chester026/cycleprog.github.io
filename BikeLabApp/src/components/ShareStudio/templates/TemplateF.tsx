/**
 * Template F - Journal
 * Journal-style template with charts
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import {LineChart} from 'react-native-gifted-charts';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../types';

// Journal background
const journalBg = require('../../../assets/img/shareTemplates/template4.webp');
const logoVertical = require('../../../assets/img/shareTemplates/logos/logo_vertical.png');

export const TemplateF: React.FC<TemplateProps> = ({
  activity,
  streams,
}) => {
  // Format distance with comma as decimal separator
  const distanceNum = activity.distance / 1000;
  const distanceFormatted = distanceNum.toFixed(2).replace('.', ',');
  
  const elevation = Math.round(activity.total_elevation_gain);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Prepare chart data - sample to max 60 points
  const prepareChartData = (dataArray: number[]) => {
    if (!dataArray || dataArray.length === 0) return [];
    
    const maxPoints = 60;
    const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
    const sampledData = dataArray.filter((_, index) => index % step === 0);
    
    return sampledData.map((value) => ({
      value,
    }));
  };

  // Get chart data
  const speedData = streams?.velocity_smooth?.data?.map((v: number) => v * 3.6);
  const heartRateData = streams?.heartrate?.data;
  const cadenceData = streams?.cadence?.data;

  // Render mini chart
  const renderMiniChart = (
    title: string,
    data: number[] | undefined,
    color: string,
    unit: string,
    avgValue?: number
  ) => {
    if (!data || data.length === 0) return null;

    const chartData = prepareChartData(data);
    const maxValue = Math.max(...data) * 1.2;
    const avg = avgValue ?? data.reduce((sum, v) => sum + v, 0) / data.length;

    return (
      <View style={styles.chartSection}>
        <Text style={styles.chartLabel}>{title}</Text>
        <Text style={styles.chartValue}>{avg.toFixed(1)} {unit}</Text>
        <View style={styles.chartContainer}>
          <LineChart
            data={chartData}
            width={TEMPLATE_WIDTH - 450}
            height={130}
            maxValue={maxValue}
            spacing={Math.max(4, Math.floor((TEMPLATE_WIDTH - 450) / chartData.length))}
            curved
            startFillColor={color}
            startOpacity={0.1}
            endOpacity={0.001}
            color={color}
            thickness={3}
            hideDataPoints
            hideRules
            hideYAxisText
            hideAxesAndRules
          />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Image
        source={journalBg}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Big Distance */}
        <View style={styles.distanceSection}>
          <Text style={styles.distanceValue}>{distanceFormatted}</Text>
          <Text style={styles.distanceUnit}>km</Text>
        </View>

        {/* Charts Section */}
        <View style={styles.chartsWrapper}>
          {/* Speed Chart - Orange */}
          {renderMiniChart(
            'Speed',
            speedData,
            '#10b981',
            'km/h',
            parseFloat(avgSpeed)
          )}
          
          {/* Heart Rate or Cadence Chart - Green */}
          {heartRateData && heartRateData.length > 0 ? (
            renderMiniChart(
              'Heart Rate',
              heartRateData,
              '#FF5E00',
              'bpm',
              activity.average_heartrate
            )
          ) : cadenceData && cadenceData.length > 0 ? (
            renderMiniChart(
              'Cadence',
              cadenceData,
              '#10b981',
              'rpm',
              activity.average_cadence
            )
          ) : (
            // Fallback: show speed chart again in green
            renderMiniChart(
              'Speed',
              speedData,
              '#10b981',
              'km/h',
              parseFloat(avgSpeed)
            )
          )}
        </View>

        {/* Bottom Stats Row */}
        <View style={styles.bottomStats}>
          <View style={styles.bottomStat}>
            <Text style={styles.bottomStatIcon}>⛰</Text>
            <Text style={styles.bottomStatValue}>{elevation} m</Text>
          </View>
          
          <View style={styles.bottomStat}>
            <Text style={styles.bottomStatIcon}>⏱</Text>
            <Text style={styles.bottomStatValue}>{formatDuration(activity.moving_time)}</Text>
          </View>
        </View>

        {/* Bottom Logo */}
        <View style={styles.logoSection}>
          <Image source={logoVertical} style={styles.logoImage} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    backgroundColor: '#0a0a0a',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  content: {
    flex: 1,
    paddingHorizontal: 150,
    paddingTop: 150,
    paddingBottom: 80,
  },
  titleText: {
    fontSize: 52,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '700',
    lineHeight: 76,
    marginBottom: 12,
  },
  distanceSection: {
    marginBottom: 80,
  },
  distanceValue: {
    fontSize: 180,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 200,
    letterSpacing: -4,
  },
  distanceUnit: {
    fontSize: 100,
    color: 'rgba(255, 255, 255, 1)',
    fontWeight: '800',
    marginTop: -20,
    marginBottom: 24,
  },
  chartsWrapper: {
    gap: 52,
    marginBottom: 80,
  },
  chartSection: {
    marginBottom: 24  ,
  },
  chartLabel: {
    fontSize: 32,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '700',
    marginBottom: 8,
  },
  chartValue: {
    fontSize: 48,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 64,
  },
  chartContainer: {
    marginLeft: -20,
  },
  bottomStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 120,
    position: 'relative',
    top: -80,
  },
  bottomStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomStatIcon: {
    fontSize: 40,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  bottomStatValue: {
    fontSize: 48,
    color: '#ffffff',
    fontWeight: '600',
  },
  logoSection: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 'auto',
    width: '100%',
  },
  logoImage: {
    width: 220,
    height: 220,
    marginLeft: -120,
  },
});
