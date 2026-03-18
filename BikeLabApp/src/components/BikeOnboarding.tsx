import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {useTranslation} from 'react-i18next';
import {apiFetch} from '../utils/api';

const {width: screenWidth} = Dimensions.get('window');
const SLIDER_STEP = 100;

const COMPONENT_GROUPS = [
  {key: 'drivetrain', ids: ['chain', 'cassette', 'chainrings']},
  {key: 'brakes', ids: ['brake_pads', 'rotors']},
  {key: 'wheels', ids: ['tires', 'sealant', 'wheel_bearings']},
  {key: 'contact', ids: ['bar_tape', 'saddle', 'pedals', 'cleats']},
];

const ALL_COMPONENT_IDS = COMPONENT_GROUPS.flatMap(g => g.ids);

type PresetKey = 'justServiced' | 'goodShape' | 'needsService' | 'neverChanged';

interface Props {
  bikeId: string;
  bikeName: string;
  totalKm: number;
  onComplete: () => void;
}

export const BikeOnboarding: React.FC<Props> = ({bikeId, bikeName, totalKm, onComplete}) => {
  const {t} = useTranslation();

  // Each value = km since last replacement (0 = just replaced, totalKm = never replaced)
  const [componentKmAgo, setComponentKmAgo] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    ALL_COMPONENT_IDS.forEach(id => { init[id] = totalKm; });
    return init;
  });
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
  const [saving, setSaving] = useState(false);

  const applyPreset = useCallback((preset: PresetKey) => {
    setActivePreset(preset);
    const kmAgo =
      preset === 'justServiced' ? 0 :
      preset === 'goodShape' ? Math.round(totalKm * 0.4) :
      preset === 'needsService' ? Math.round(totalKm * 0.7) :
      totalKm;
    const next: Record<string, number> = {};
    ALL_COMPONENT_IDS.forEach(id => { next[id] = kmAgo; });
    setComponentKmAgo(next);
  }, [totalKm]);

  const setComponentValue = useCallback((id: string, kmAgo: number) => {
    setActivePreset(null);
    setComponentKmAgo(prev => ({...prev, [id]: kmAgo}));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const resets = ALL_COMPONENT_IDS.map(id => ({
        component: id,
        resetKm: Math.max(0, totalKm - componentKmAgo[id]),
      }));
      await apiFetch(`/api/bikes/${bikeId}/onboarding`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({resets}),
      });
      onComplete();
    } catch (err) {
      console.error('Onboarding save error:', err);
    } finally {
      setSaving(false);
    }
  }, [bikeId, totalKm, componentKmAgo, onComplete]);

  const formatKm = (km: number): string => {
    if (km === 0) return t('bikeGarage.onboarding.optionNew');
    if (km >= totalKm) return `${totalKm.toLocaleString()} ${t('common.km')}`;
    return `${km.toLocaleString()} ${t('common.km')}`;
  };

  const PRESETS: {key: PresetKey; label: string; hint: string}[] = [
    {key: 'justServiced', label: t('bikeGarage.onboarding.presetJustServiced'), hint: t('bikeGarage.onboarding.presetJustServicedHint')},
    {key: 'goodShape', label: t('bikeGarage.onboarding.presetGoodShape'), hint: t('bikeGarage.onboarding.presetGoodShapeHint')},
    {key: 'needsService', label: t('bikeGarage.onboarding.presetNeedsService'), hint: t('bikeGarage.onboarding.presetNeedsServiceHint')},
    {key: 'neverChanged', label: t('bikeGarage.onboarding.presetNeverChanged'), hint: t('bikeGarage.onboarding.presetNeverChangedHint')},
  ];

  return (
    <ScrollView
      style={os.root}
      contentContainerStyle={os.content}
      showsVerticalScrollIndicator={false}>

      <Text style={os.title}>{t('bikeGarage.onboarding.title')}</Text>
      <Text style={os.subtitle}>{t('bikeGarage.onboarding.subtitle')}</Text>

      
      {/* Presets */}
      <View style={os.presets}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[os.presetCard, activePreset === p.key && os.presetCardActive]}
            onPress={() => applyPreset(p.key)}
            activeOpacity={0.7}>
            <Text style={[os.presetLabel, activePreset === p.key && os.presetLabelActive]}>
              {p.label}
            </Text>
            <Text style={[os.presetHint, activePreset === p.key && os.presetHintActive]}>
              {p.hint}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Per-component sliders */}
      <Text style={os.finetuneHint}>{t('bikeGarage.onboarding.finetuneHint')}</Text>

      {COMPONENT_GROUPS.map(group => (
        <View key={group.key}>
          <Text style={os.groupTitle}>{t(`bikeGarage.group_${group.key}`)}</Text>
          {group.ids.map(compId => {
            const kmAgo = componentKmAgo[compId];
            const isNew = kmAgo === 0;
            const isOriginal = kmAgo >= totalKm;
            return (
              <View key={compId} style={os.compRow}>
                <View style={os.compHeader}>
                  <Text style={os.compName}>{t(`bikeGarage.comp_${compId}`)}</Text>
                  <Text style={[os.compValue, isNew && os.compValueNew, isOriginal && os.compValueOriginal]}>
                    {formatKm(kmAgo)}
                  </Text>
                </View>
                <Slider
                  style={os.slider}
                  minimumValue={0}
                  maximumValue={totalKm}
                  step={Math.max(SLIDER_STEP, Math.round(totalKm / 50 / 100) * 100)}
                  value={Math.min(kmAgo, totalKm)}
                  onValueChange={(val: number) => setComponentValue(compId, Math.round(val))}
                  minimumTrackTintColor="#1A1A1A"
                  maximumTrackTintColor="#E0E0E0"
                  thumbTintColor="#1A1A1A"
                />
                <View style={os.sliderLabels}>
                  <Text style={os.sliderLabel}>{t('bikeGarage.onboarding.optionNew')}</Text>
                  <Text style={os.sliderLabel}>{t('bikeGarage.onboarding.optionOriginal')}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      {/* Apply */}
      <TouchableOpacity
        style={[os.applyBtn, saving && os.applyBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}>
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={os.applyBtnText}>{t('bikeGarage.onboarding.apply')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

const PRESET_WIDTH = (screenWidth - 32 - 24) / 4;

const os = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F5F5'},
  content: {paddingBottom: 0, paddingTop: 16},

  title: {fontSize: 16, fontWeight: '700', textTransform: 'uppercase', color: '#1A1A1A', letterSpacing: -0.8, marginBottom: 6},
  subtitle: {fontSize: 14, color: '#8E8E93', fontWeight: '400', lineHeight: 20, marginBottom: 20},

  bikeChip: {
    flexDirection: 'row', alignItems: 'baseline', gap: 8,
    marginBottom: 24,
  },
  bikeChipName: {fontSize: 15, fontWeight: '700', textTransform: 'uppercase', color: '#1A1A1A'},
  bikeChipKm: {fontSize: 13, fontWeight: '500', color: '#8E8E93'},

  presets: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28},
  presetCard: {
    width: PRESET_WIDTH,
    backgroundColor: '#fff',
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetCardActive: {
    borderColor: '#1A1A1A',
    backgroundColor: '#1A1A1A',
  },
  presetLabel: {fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 4},
  presetLabelActive: {color: '#fff'},
  presetHint: {fontSize: 10, color: '#8E8E93', lineHeight: 14},
  presetHintActive: {color: 'rgba(255,255,255,0.6)'},

  finetuneHint: {
    fontSize: 11, fontWeight: '500', color: '#8E8E93',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16,
  },

  groupTitle: {
    fontSize: 12, fontWeight: '600', color: '#8E8E93',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10, marginTop: 20,
  },

  compRow: {
    backgroundColor: '#fff', padding: 14, paddingBottom: 8,
    marginBottom: 1,
  },
  compHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  compName: {fontSize: 14, fontWeight: '700', color: '#1A1A1A'},
  compValue: {fontSize: 16, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.3},
  compValueNew: {color: '#4CAF50'},
  compValueOriginal: {color: '#AEAEB2'},

  slider: {
    width: '100%', height: 36,
    marginTop: 6,
    marginBottom: 8,
  },
  sliderLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderLabel: {fontSize: 10, color: '#AEAEB2', fontWeight: '500'},

  applyBtn: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  applyBtnDisabled: {opacity: 0.6},
  applyBtnText: {fontSize: 15, fontWeight: '600', color: '#fff'},
});
