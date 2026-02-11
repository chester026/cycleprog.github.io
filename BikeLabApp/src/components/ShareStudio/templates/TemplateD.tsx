/**
 * Template D - With Mini Charts
 * Template with speed, heart rate, and cadence charts
 * Fixed size: 1080x1920 (Instagram Stories ratio)
 */

import React from 'react';
import {View, Text, StyleSheet, Image} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {LineChart} from 'react-native-gifted-charts';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {TemplateProps, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, GRADIENTS} from '../types';

const GRADIENT_TOP_HEIGHT = TEMPLATE_HEIGHT * 1;  // 20% сверху — синий
const GRADIENT_BOTTOM_HEIGHT = TEMPLATE_HEIGHT * 1; // 80% снизу — чёрный

// Branded backgrounds
const brandedBg1 = require('../../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../../assets/img/shareTemplates/template2.webp');


// Logos
const logoBlue = require('../../../assets/img/shareTemplates/logos/logo_blue.png');
const rideWhite = require('../../../assets/img/shareTemplates/logos/ride_w.png');

export const TemplateD: React.FC<TemplateProps> = ({
  activity,
  backgroundType,
  backgroundImage,
  streams,
  isGrayscale,
}) => {
  const distance = (activity.distance / 1000).toFixed(1);
  const avgSpeed = (activity.average_speed * 3.6).toFixed(1);

  // Prepare chart data - sample to max 60 points for smooth curve
  const prepareChartData = (dataArray: number[]) => {
    if (!dataArray || dataArray.length === 0) return [];
    
    const maxPoints = 60;
    const step = Math.max(1, Math.floor(dataArray.length / maxPoints));
    const sampledData = dataArray.filter((_, index) => index % step === 0);
    
    return sampledData.map((value) => ({
      value,
    }));
  };

  const getBrandedBg = () => {
    switch (backgroundType) {
      case 'branded1': return brandedBg1;
      case 'branded2': return brandedBg2;
      
      default: return brandedBg1;
    }
  };

  const gradientOverlay = (
    <>
      <LinearGradient
        colors={['rgba(11, 30, 97, 0.05)', 'rgba(39, 48, 211, 0.1)']}
        style={[styles.gradientOverlay, styles.gradientTop]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
      />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(1, 1, 8, 0.78)']}
        style={[styles.gradientOverlay, styles.gradientBottom]}
        start={{x: 0.5, y: 0}}
        end={{x: 0.5, y: 1}}
      />
    </>
  );

  const renderBackground = () => {
    if (backgroundType === 'branded1' || backgroundType === 'branded2' || backgroundType === 'branded5') {
      return (
        <Image
          source={getBrandedBg()}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      );
    }

    if (backgroundType === 'photo' && backgroundImage) {
      const photoImage = (
        <Image
          source={{uri: backgroundImage}}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      );
      
      return (
        <>
          {isGrayscale ? (
            <Grayscale style={styles.grayscaleContainer}>
              {photoImage}
            </Grayscale>
          ) : (
            photoImage
          )}
          {gradientOverlay}
        </>
      );
    }

    if (backgroundType === 'transparent') {
      return <View style={styles.transparentBackground} />;
    }

    return (
      <LinearGradient
        colors={GRADIENTS.dark}
        style={styles.gradientBackground}
        start={{x: 0, y: 0}}
        end={{x: 0.3, y: 1}}
      />
    );
  };

  // Mini chart component matching Figma design
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
      <View style={styles.miniChartCard}>
        <View style={styles.miniChartHeader}>
          <Text style={styles.miniChartTitle}>{title}</Text>
          <Text style={styles.miniChartAvg}>
            {avg.toFixed(1)} {unit}
          </Text>
        </View>
        <View style={styles.miniChartContent}>
          <LineChart
            data={chartData}
            width={450}
            height={130}
            maxValue={maxValue}
            spacing={Math.max(4, Math.floor((TEMPLATE_WIDTH - 600) / chartData.length))}
            curved
            areaChart
            startFillColor={color}
            startOpacity={0.1}
            endOpacity={0.001}
            color={color}
            thickness={4}
            hideDataPoints
            hideRules
            hideYAxisText
            hideAxesAndRules
          />
        </View>
      </View>
    );
  };

  // Get chart data
  const speedData = streams?.velocity_smooth?.data?.map((v: number) => v * 3.6);
  const heartRateData = streams?.heartrate?.data;
  const cadenceData = streams?.cadence?.data;

  return (
    <View style={styles.container}>
      {renderBackground()}
      
      <View style={styles.content}>
        {/* Top Logo */}
        <View style={styles.topLogo}>
          <Image source={logoBlue} style={styles.logoBlueImage} resizeMode="contain" />
        </View>

        {/* Title */}
        <Text style={styles.titleText} numberOfLines={2}>
          {activity.name}
        </Text>

        {/* Big Distance */}
        <Text style={styles.distanceText}>
          {distance} km
        </Text>

        {/* Charts Section */}
        <View style={styles.chartsSection}>
          {renderMiniChart(
            'Speed',
            speedData,
            '#10b981',
            'km/h',
            parseFloat(avgSpeed)
          )}
          
          {heartRateData && heartRateData.length > 0 ? (
            renderMiniChart(
              'Heart Rate',
              heartRateData,
              '#FF5E00',
              'bpm',
              activity.average_heartrate
            )
          ) : (
            renderMiniChart(
              'Cadence',
              cadenceData,
              '#8B5CF6',
              'rpm',
              activity.average_cadence
            )
          )}
        </View>

        {/* Bottom Logo */}
        <View style={styles.bottomLogo}>
          <Image source={rideWhite} style={styles.rideWhiteImage} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    backgroundColor: '#000',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  transparentBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  grayscaleContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: TEMPLATE_WIDTH,
  },
  gradientTop: {
    top: 0,
    height: GRADIENT_TOP_HEIGHT,
  },
  gradientBottom: {
    bottom: 0,
    height: GRADIENT_BOTTOM_HEIGHT,
  },
  content: {
    flex: 1,
    paddingHorizontal: 80,
    paddingTop: 100,
    paddingBottom: 100,
  },
  topLogo: {
    alignItems: 'center',
    marginBottom: 110,
  },
  logoBlueImage: {
    width: 280,
    height: 280,
  },
  titleText: {
    fontSize: 54,
    color: '#ffffff',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 52,
    paddingHorizontal: 52,
  },
  distanceText: {
    fontSize: 120,
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 120,
    letterSpacing: 3,
  },
  chartsSection: {
    
    alignSelf: 'center',
    justifyContent: 'space-between',
    gap: 84,
  },
  miniChartCard: {
    overflow: 'hidden',
  },
  miniChartHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  miniChartTitle: {
    fontSize: 28,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  miniChartAvg: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
  },
  miniChartContent: {
    marginLeft: -24,
    marginRight: -10,
  },
  bottomLogo: {
    alignItems: 'center',
    marginTop: 120,
    position: 'absolute',
    bottom: 92,
    left: 470,
  },
  rideWhiteImage: {
    width: 150,
    height: 150,
  },
});
