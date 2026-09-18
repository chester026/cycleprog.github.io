// Ride nutrition estimator (water/calories/carbs/gels/bars), optionally
// personalized off the rider's profile. Extracted from GarageScreen.tsx
// (T-5.4, audit A-27) — the math itself lives in `./lib.ts#calculateNutrition`.
import React, {useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {UserProfile} from '@bikelab/shared/types';
import {makeStyles} from '../../theme';
import {calculateNutrition, type NutritionInput, type NutritionResult} from './lib';

const bidonImg = require('../../assets/img/nutrition/bidon.webp');
const gelImg = require('../../assets/img/nutrition/gel.webp');
const carboImg = require('../../assets/img/nutrition/carbo.webp');

const EMPTY_INPUT: NutritionInput = {distance: '', elevation: '', speed: '', temp: ''};

export interface NutritionCalculatorProps {
  userProfile: UserProfile | null;
}

export const NutritionCalculator: React.FC<NutritionCalculatorProps> = ({userProfile}) => {
  const {t} = useTranslation();
  const [input, setInput] = useState<NutritionInput>(EMPTY_INPUT);
  const [result, setResult] = useState<NutritionResult | null>(null);

  const handleCalc = () => setResult(calculateNutrition(input, userProfile));
  const handleClear = () => {
    setInput(EMPTY_INPUT);
    setResult(null);
  };

  return (
    <View style={styles.nutritionSection}>
      <Text style={styles.nutritionTitle}>{t('garage.nutrition')}</Text>

      <View style={styles.nutritionCalcWrap}>
        <View style={styles.nutritionFields}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('garage.distanceKm')}</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="105"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                value={input.distance}
                onChangeText={text => setInput(prev => ({...prev, distance: text}))}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('garage.elevationM')}</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="1200"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                value={input.elevation}
                onChangeText={text => setInput(prev => ({...prev, elevation: text}))}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('garage.avgSpeedKmh')}</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="27"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                value={input.speed}
                onChangeText={text => setInput(prev => ({...prev, speed: text}))}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('garage.tempC')}</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="22"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                value={input.temp}
                onChangeText={text => setInput(prev => ({...prev, temp: text}))}
              />
            </View>
          </View>
        </View>

        <View style={styles.nutritionButtons}>
          <TouchableOpacity style={styles.calculateButton} onPress={handleCalc}>
            <Text style={styles.calculateButtonText}>{t('garage.calculate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>{t('garage.clear')}</Text>
          </TouchableOpacity>
        </View>

        {result && (
          <View style={styles.nutritionResults}>
            <View style={styles.resultsMainBox}>
              <View style={styles.resultsStats}>
                <View style={styles.resultsStatsColumn}>
                  <View style={styles.resultStatItem}>
                    <Text style={styles.resultStatLabel}>{t('garage.timeInMotion')}</Text>
                    <Text style={styles.resultStatValue}>{result.timeH.toFixed(2)} {t('common.h')}</Text>
                  </View>
                  <View style={styles.resultStatItem}>
                    <Text style={styles.resultStatLabel}>{t('garage.water')}</Text>
                    <Text style={styles.resultStatValue}>~{result.water.toFixed(1)} l</Text>
                    <Text style={styles.resultStatHint}>
                      (based on {result.waterPerH.toFixed(1)} l/h{result.isPersonalized ? `, weight ${result.userWeight}kg` : ''})
                    </Text>
                  </View>
                </View>

                <View style={styles.resultsStatsColumn}>
                  <View style={styles.resultStatItem}>
                    <Text style={styles.resultStatLabel}>{t('garage.calories')}</Text>
                    <Text style={styles.resultStatValue}>~{Math.round(result.cal).toLocaleString()} kcal</Text>
                  </View>
                  <View style={styles.resultStatItem}>
                    <Text style={styles.resultStatLabel}>{t('garage.carbsTotal')}</Text>
                    <Text style={styles.resultStatValue}>~{Math.round(result.carbs)} g</Text>
                    <Text style={styles.resultStatHint}>
                      {t('garage.sportsNutrition')}{Math.round(result.carbs * 0.65)}{t('garage.regularFood')}{Math.round(result.carbs * 0.35)}g{result.isPersonalized ? `, ${result.carbsPerKgPerH} g/kg/h` : ''}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.resultsIcons}>
                <View style={styles.resultIcon}>
                  <Image source={bidonImg} style={styles.resultIconImage} resizeMode="contain" />
                  <Text style={styles.resultIconTitle}>{t('garage.water').replace(':', '')}</Text>
                  <Text style={styles.resultIconLabel}>{result.water.toFixed(1)}L</Text>
                  <Text style={styles.resultIconHint}>≈{Math.ceil(result.water / 0.5)} bottles</Text>
                </View>

                <View style={styles.resultIcon}>
                  <Image source={gelImg} style={styles.resultIconImage} resizeMode="contain" />
                  <Text style={styles.resultIconTitle}>{t('garage.gel')}</Text>
                  <Text style={styles.resultIconLabel}>x{result.gels}</Text>
                  <Text style={styles.resultIconHint}>{result.gels * 25}g</Text>
                </View>

                <View style={styles.resultIcon}>
                  <Image source={carboImg} style={styles.resultIconImage} resizeMode="contain" />
                  <Text style={styles.resultIconTitle}>{t('garage.carbo')}</Text>
                  <Text style={styles.resultIconLabel}>x{result.bars}</Text>
                  <Text style={styles.resultIconHint}>{result.bars * 35}g</Text>
                </View>
              </View>
            </View>

            {result.isPersonalized && (
              <View style={styles.personalizedBadge}>
                <Text style={styles.personalizedBadgeTitle}>{t('garage.calculatedUsingProfile')}</Text>
                <Text style={styles.personalizedBadgeText}>
                  {t('garage.weightLabel')}{result.userWeight}kg{t('garage.caloriesLabel')}{result.carbsPerKgPerH} g/kg/h
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.nutritionHint}>
          {userProfile?.weight ? (
            <>
              <Text style={styles.hintTitle}>{t('garage.personalizedCalc')}</Text>
              <Text style={styles.hintText}>• {t('garage.waterCalc')} ({userProfile.weight}kg), temperature, and route difficulty</Text>
              <Text style={styles.hintText}>
                • Carbs: {userProfile.experience_level === 'advanced' ? '0.6-0.8' : userProfile.experience_level === 'beginner' ? '0.4-0.6' : '0.5-0.7'}{t('garage.carbsCalc')}
              </Text>
              <Text style={styles.hintText}>• {t('garage.calories')} {userProfile.gender === 'female' ? '7.5-10' : '8.5-12'}{t('garage.caloriesCalc')}</Text>
              <Text style={styles.hintText}>• {t('garage.sportsNutritionCalc')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.hintTitle}>{t('garage.genericCalc')}</Text>
              <Text style={styles.hintText}>• {t('garage.genericWater')}</Text>
              <Text style={styles.hintText}>• {t('garage.genericCarbs')}</Text>
              <Text style={styles.hintText}>• {t('garage.genericCalories')}</Text>
            </>
          )}
          <Text style={styles.hintText}>• {t('garage.genericRegularFood')}</Text>
          <Text style={styles.hintText}>• {t('garage.genericGelRatio')}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  nutritionSection: {
    padding: theme.spacing[16],
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[24],
  },
  nutritionTitle: {
    fontSize: 55,
    fontWeight: theme.typography.fontWeight.black,
    opacity: 0.15,
    textTransform: 'uppercase',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[16],
  },
  nutritionCalcWrap: {
    borderRadius: theme.radii.sm,
  },
  nutritionFields: {
    gap: theme.spacing[16],
    marginBottom: theme.spacing[16],
  },
  fieldRow: {
    flexDirection: 'row',
    gap: theme.spacing[32],
  },
  fieldGroup: {
    flex: 1,
    gap: 0,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSize.lg,
    color: 'rgba(0, 0, 0, 0.2)',
    fontWeight: '500', // not in the typography scale yet — kept literal
  },
  fieldInput: {
    fontSize: 52,
    fontWeight: theme.typography.fontWeight.black,
    color: '#222',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: 0,
    borderBottomWidth: 0,
  },
  nutritionButtons: {
    flexDirection: 'row',
    gap: theme.spacing[12],
    marginBottom: theme.spacing[20],
    alignItems: 'flex-start',
    width: '65%',
  },
  calculateButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: theme.spacing[16],
    alignItems: 'center',
    justifyContent: 'center',
  },
  calculateButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
  },
  clearButton: {
    flex: 1,
    padding: theme.spacing[16],
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
  },
  nutritionResults: {
    marginTop: theme.spacing[12],
  },
  resultsMainBox: {
    backgroundColor: '#4CAF50',
    borderRadius: 0,
    padding: theme.spacing[20],
    marginBottom: 0,
  },
  resultsStats: {
    flexDirection: 'row',
    gap: theme.spacing[24],
    marginBottom: theme.spacing[20],
  },
  resultsStatsColumn: {
    flex: 1,
    gap: theme.spacing[24],
  },
  resultStatItem: {
    gap: theme.spacing[8],
  },
  resultStatLabel: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  resultStatValue: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: theme.colors.text.inverse,
  },
  resultStatHint: {
    fontSize: theme.typography.fontSize.md,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: theme.spacing[2],
  },
  resultsIcons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: theme.spacing[20],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  resultIcon: {
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  resultIconTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: theme.typography.letterSpacing.wide,
    marginBottom: theme.spacing[4],
  },
  resultIconImage: {
    width: 92,
    height: 92,
  },
  resultIconLabel: {
    fontSize: 18, // not in the typography scale yet — kept literal
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  resultIconHint: {
    fontSize: theme.typography.fontSize.sm,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: theme.spacing[2],
  },
  personalizedBadge: {
    backgroundColor: 'rgb(44, 171, 42)',
    padding: theme.spacing[16],
    borderRadius: 0,
    marginTop: 0,
  },
  personalizedBadgeTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[8],
  },
  personalizedBadgeText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.inverse,
  },
  nutritionHint: {
    marginTop: theme.spacing[24],
    gap: theme.spacing[8],
  },
  hintTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.muted,
    marginBottom: theme.spacing[4],
  },
  hintText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.muted,
    lineHeight: 18,
  },
}));
