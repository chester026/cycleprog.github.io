import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {apiFetch} from '../utils/api';
import Svg, {Circle} from 'react-native-svg';

const {width: screenWidth} = Dimensions.get('window');
const CARD_GAP = 9;
const CARD_WIDTH = (screenWidth - 32 - CARD_GAP * 2) / 3;

interface Bike {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  primary: boolean;
  distanceKm: number;
  activitiesCount: number;
}

interface ComponentHealth {
  id: string;
  healthPercent: number;
  kmSinceReset: number;
  effectiveKm: number;
  baseLifecycle: number;
  remainingKm: number;
  status: 'good' | 'warning' | 'attention' | 'critical';
  weightFactor: number;
  styleFactor: number;
  lastResetAt: string | null;
  lastResetKm: number;
}

interface BikeHealth {
  bikeId: string;
  totalKm: number;
  riderWeight: number;
  ridingStyle: {climbing: number; sprint: number; power: number};
  riderProfile: {profile: string; emoji: string};
  components: ComponentHealth[];
  overallHealth: number;
  nextService: {component: string; inKm: number};
}

const STATUS_TINT: Record<string, string> = {
  good: '#CCCCCC',
  warning: '#f59e0b',
  attention: '#f59e0b',
  critical: '#ef4444',
};

const GAUGE_SIZE = 132;
const GAUGE_STROKE = 7;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export const BikeGarageScreen: React.FC<{navigation: any; route: any}> = ({
  navigation,
  route,
}) => {
  const {t} = useTranslation();
  const initialBikeId = route?.params?.bikeId;

  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(initialBikeId || null);
  const [health, setHealth] = useState<BikeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailComponent, setDetailComponent] = useState<ComponentHealth | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const openDetail = useCallback((comp: ComponentHealth) => {
    setDetailComponent(comp);
    setDetailVisible(true);
    Animated.timing(slideAnim, {
      toValue: 1, duration: 250, useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const closeDetail = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(() => {
      setDetailVisible(false);
      setDetailComponent(null);
    });
  }, [slideAnim]);

  const loadBikes = useCallback(async () => {
    try {
      const data = await apiFetch('/api/bikes');
      setBikes(data || []);
      if (!selectedBikeId && data?.length > 0) {
        const primary = data.find((b: Bike) => b.primary) || data[0];
        setSelectedBikeId(primary.id);
      }
    } catch (error) {
      console.error('Error loading bikes:', error);
    }
  }, [selectedBikeId]);

  const loadHealth = useCallback(async (bikeId: string) => {
    setHealthLoading(true);
    try {
      const data = await apiFetch(`/api/bikes/${bikeId}/health`);
      setHealth(data);
    } catch (error) {
      console.error('Error loading bike health:', error);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadBikes();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedBikeId) loadHealth(selectedBikeId);
  }, [selectedBikeId, loadHealth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBikes();
    if (selectedBikeId) await loadHealth(selectedBikeId);
    setRefreshing(false);
  }, [selectedBikeId, loadBikes, loadHealth]);

  const handleReset = async (componentId: string) => {
    if (!selectedBikeId) return;
    Alert.alert(
      t('bikeGarage.resetConfirmTitle'),
      t('bikeGarage.resetConfirmMessage'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('bikeGarage.markReplaced'),
          onPress: async () => {
            try {
              await apiFetch(`/api/bikes/${selectedBikeId}/components/${componentId}/reset`, {method: 'POST'});
              await loadHealth(selectedBikeId);
              closeDetail();
            } catch (error) {
              Alert.alert(t('common.error'), t('bikeGarage.resetFailed'));
            }
          },
        },
      ],
    );
  };

  const selectedBike = bikes.find(b => b.id === selectedBikeId) || bikes[0];

  const gaugeColor = '#1A1A1A';

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
      </View>
    );
  }

  if (bikes.length === 0) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>{t('bikes.noBikes')}</Text>
        <Text style={s.emptyHint}>{t('bikes.noBikesHint')}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.linkText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={s.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('bikeGarage.title')}</Text>
        <View style={{width: 28}} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A1A1A" />}
        showsVerticalScrollIndicator={false}>

        {/* Bike selector pills */}
        {bikes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
            {bikes.map(bike => (
              <TouchableOpacity
                key={bike.id}
                style={[s.pill, bike.id === selectedBikeId && s.pillActive]}
                onPress={() => setSelectedBikeId(bike.id)}>
                <Text style={[s.pillText, bike.id === selectedBikeId && s.pillTextActive]} numberOfLines={1}>
                  {bike.brand_name && bike.model_name ? `${bike.brand_name} ${bike.model_name}` : bike.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Hero: bike name + stats */}
        {selectedBike && (
          <View style={s.hero}>
            <View style={s.heroNameRow}>
              <Text style={s.bikeName}>
                {selectedBike.brand_name && selectedBike.model_name
                  ? `${selectedBike.brand_name} ${selectedBike.model_name}`
                  : selectedBike.name}
              </Text>
              {selectedBike.primary && (
                <View style={s.primaryBadge}>
                  <Text style={s.primaryBadgeText}>{t('common.primary')}</Text>
                </View>
              )}
            </View>
            <View style={s.heroStats}>
              <Text style={s.heroStatVal}>{selectedBike.distanceKm.toLocaleString()}</Text>
              <Text style={s.heroStatUnit}>{t('common.km')}</Text>
              <View style={s.heroDot} />
              <Text style={s.heroStatVal}>{selectedBike.activitiesCount}</Text>
              <Text style={s.heroStatUnit}>{t('common.rides')}</Text>
            </View>
          </View>
        )}

        {healthLoading ? (
          <View style={{paddingVertical: 60, alignItems: 'center'}}>
            <ActivityIndicator size="large" color="#1A1A1A" />
          </View>
        ) : health ? (
          <>
            {/* Health overview block */}
            <View style={s.overviewBlock}>
              <View style={s.overviewTop}>
                <View style={s.gaugeWrap}>
                  <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
                    <Circle
                      cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                      stroke="#DDDDE0" strokeWidth={GAUGE_STROKE} fill="none"
                    />
                    <Circle
                      cx={GAUGE_SIZE / 2} cy={GAUGE_SIZE / 2} r={GAUGE_RADIUS}
                      stroke={gaugeColor}
                      strokeWidth={GAUGE_STROKE} fill="none"
                      strokeDasharray={`${(health.overallHealth / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                      strokeLinecap="round"
                      rotation={-90}
                      origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
                    />
                  </Svg>
                  <View style={s.gaugeLabel}>
                    <View style={s.gaugeValRow}>
                      <Text style={s.gaugeVal}>{health.overallHealth}</Text>
                      <Text style={s.gaugeSuffix}>%</Text>
                    </View>
                    <Text style={s.gaugeCaption}>{t('bikeGarage.bikeHealth')}</Text>
                  </View>
                </View>

                <View style={s.profileInfo}>
                  <Text style={s.profileTitle}>{health.riderProfile?.profile || 'Rider'}</Text>
                  <View style={s.styleBars}>
                    {[
                      {key: 'climbing', label: t('skills.climbing'), value: health.ridingStyle.climbing},
                      {key: 'sprint', label: t('skills.sprint'), value: health.ridingStyle.sprint},
                      {key: 'power', label: t('skills.power'), value: health.ridingStyle.power},
                    ]
                      .sort((a, b) => b.value - a.value)
                      .map(item => (
                        <View key={item.key} style={s.sBar}>
                          <Text style={s.sBarLabel}>{item.label}</Text>
                          <Text style={s.sBarVal}>{item.value}</Text>
                        </View>
                      ))}
                  </View>
                </View>
              </View>
            </View>

            {/* Next service banner */}
            {health.nextService.inKm > 0 && (
              <View style={s.nextSvcBanner}>
                <View style={s.nextSvcLeft}>
                  <Text style={s.nextSvcLabel}>{t('bikeGarage.nextService')}</Text>
                  <Text style={s.nextSvcComp}>{t(`bikeGarage.comp_${health.nextService.component}`)}</Text>
                </View>
                <View style={s.nextSvcRight}>
                  <Text style={s.nextSvcValue}>{health.nextService.inKm.toLocaleString()}</Text>
                  <Text style={s.nextSvcUnit}>{t('common.km')}</Text>
                </View>
              </View>
            )}

            {/* Components grouped */}
            {[
              {key: 'drivetrain', ids: ['chain', 'cassette', 'chainrings']},
              {key: 'brakes', ids: ['brake_pads', 'rotors']},
              {key: 'wheels', ids: ['tires', 'sealant', 'wheel_bearings']},
              {key: 'contact', ids: ['bar_tape', 'saddle', 'pedals', 'cleats']},
            ].map(group => {
              const items = group.ids
                .map(id => health.components.find(c => c.id === id))
                .filter(Boolean) as ComponentHealth[];
              if (items.length === 0) return null;
              return (
                <View key={group.key}>
                  <Text style={s.sectionTitle}>{t(`bikeGarage.group_${group.key}`)}</Text>
                  <View style={s.grid}>
                    {items.map(comp => {
                      const tint = STATUS_TINT[comp.status];
                      return (
                        <TouchableOpacity
                          key={comp.id}
                          style={s.card}
                          onPress={() => openDetail(comp)}
                          activeOpacity={0.6}>
                    <View style={s.cardNameRow}>
                      <Text style={s.cardName} numberOfLines={2}>
                        {t(`bikeGarage.comp_${comp.id}`)}
                      </Text>
                      {comp.status === 'critical' && (
                        <View style={[s.cardDot, {backgroundColor: tint}]} />
                      )}
                    </View>
                          <View style={s.cardFooter}>
                            <View style={s.cardBarTrack}>
                              <View style={[s.cardBarFill, {width: `${comp.healthPercent}%`, backgroundColor: tint}]} />
                            </View>
                            <View style={s.cardBottom}>
                              <Text style={s.cardSub}>~{comp.remainingKm.toLocaleString()} {t('common.km')}</Text>
                              <Text style={s.cardPercent}>{comp.healthPercent}%</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {/* Detail sheet */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={closeDetail}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closeDetail}>
          <Animated.View
            style={[
              s.sheet,
              {transform: [{translateY: slideAnim.interpolate({inputRange: [0, 1], outputRange: [400, 0]})}]},
            ]}>
            <TouchableOpacity activeOpacity={1}>
              {detailComponent && (
                <>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>{t(`bikeGarage.comp_${detailComponent.id}`)}</Text>
                    <TouchableOpacity onPress={closeDetail} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                      <Text style={s.sheetClose}>{'×'}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.sheetHero}>
                    <Text style={[s.sheetPercent, {color: STATUS_TINT[detailComponent.status]}]}>
                      {detailComponent.healthPercent}
                    </Text>
                    <Text style={[s.sheetPercentSign, {color: STATUS_TINT[detailComponent.status]}]}>%</Text>
                    <Text style={s.sheetPercentLabel}>{t('bikeGarage.health')}</Text>
                  </View>

                  <View style={s.sheetBarTrack}>
                    <View
                      style={[
                        s.sheetBarFill,
                        {width: `${detailComponent.healthPercent}%`, backgroundColor: STATUS_TINT[detailComponent.status]},
                      ]}
                    />
                  </View>

                  <View style={s.sheetRows}>
                    <SheetRow label={t('bikeGarage.kmSinceReset')} value={`${detailComponent.kmSinceReset.toLocaleString()} ${t('common.km')}`} />
                    <SheetRow label={t('bikeGarage.effectiveKm')} value={`${detailComponent.effectiveKm.toLocaleString()} ${t('common.km')}`} />
                    <SheetRow label={t('bikeGarage.lifecycle')} value={`${detailComponent.baseLifecycle.toLocaleString()} ${t('common.km')}`} />
                    <SheetRow label={t('bikeGarage.remainingKm')} value={`~${detailComponent.remainingKm.toLocaleString()} ${t('common.km')}`} />
                    <View style={s.sheetDivider} />
                    <SheetRow label={t('bikeGarage.weightFactor')} value={`${detailComponent.weightFactor}`} />
                    <SheetRow label={t('bikeGarage.styleFactor')} value={`${detailComponent.styleFactor}`} />
                  </View>

                  <TouchableOpacity style={s.resetBtn} onPress={() => handleReset(detailComponent.id)}>
                    <Text style={s.resetBtnText}>{t('bikeGarage.markReplaced')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const SheetRow: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View style={s.sheetRow}>
    <Text style={s.sheetRowLabel}>{label}</Text>
    <Text style={s.sheetRowVal}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F5F5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 32},

  emptyTitle: {fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginBottom: 6},
  emptyHint: {fontSize: 14, color: '#8E8E93', textAlign: 'center', marginBottom: 20},
  linkText: {fontSize: 15, color: '#274dd3', fontWeight: '600'},

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8,
  },
  backArrow: {fontSize: 32, color: '#1A1A1A', lineHeight: 34, fontWeight: '300'},
  headerTitle: {fontSize: 17, fontWeight: '600', color: '#1A1A1A', letterSpacing: -0.3},

  scroll: {paddingHorizontal: 16, paddingBottom: 100},

  pills: {paddingVertical: 6, gap: 8},
  pill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100,
    borderWidth: 1, borderColor: '#D1D1D6',
  },
  pillActive: {backgroundColor: '#1A1A1A', borderColor: '#1A1A1A'},
  pillText: {fontSize: 13, fontWeight: '500', color: '#8E8E93'},
  pillTextActive: {color: '#fff'},

  hero: {marginTop: 16, marginBottom: 20},
  heroNameRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6},
  bikeName: {fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.8, flexShrink: 1},
  primaryBadge: {backgroundColor: '#274dd3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100},
  primaryBadgeText: {fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5},
  heroStats: {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  heroStatVal: {fontSize: 15, fontWeight: '700', color: '#1A1A1A'},
  heroStatUnit: {fontSize: 13, color: '#8E8E93', fontWeight: '500', marginRight: 4},
  heroDot: {width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#C7C7CC', marginHorizontal: 6, marginBottom: 2},

  overviewBlock: {
    backgroundColor: '#EFEFEF', padding: 24, marginBottom: 0, marginTop: 16,
  },
  overviewTop: {flexDirection: 'row', alignItems: 'center', gap: 32},
  gaugeWrap: {width: GAUGE_SIZE, height: GAUGE_SIZE, justifyContent: 'center', alignItems: 'center'},
  gaugeLabel: {position: 'absolute', alignItems: 'center', justifyContent: 'center'},
  gaugeValRow: {flexDirection: 'row', alignItems: 'baseline'},
  gaugeVal: {fontSize: 32, fontWeight: '800', letterSpacing: -1.5, color: '#1A1A1A'},
  gaugeSuffix: {fontSize: 14, fontWeight: '600', color: '#8E8E93', marginLeft: 1},
  gaugeCaption: {fontSize: 9, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2},

  profileInfo: {flex: 1, justifyContent: 'center'},
  profileTitle: {fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 14, letterSpacing: -0.3},
  styleBars: {gap: 8},
  sBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sBarLabel: {fontSize: 12, fontWeight: '500', color: '#8E8E93'},
  sBarVal: {fontSize: 14, fontWeight: '800', color: '#1A1A1A'},

  nextSvcBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1A1A', paddingHorizontal: 20, paddingVertical: 12 , marginTop: 0, marginBottom: 24,
  },
  nextSvcLeft: {flex: 1},
  nextSvcLabel: {fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4},
  nextSvcComp: {fontSize: 16, fontWeight: '700', color: '#fff'},
  nextSvcRight: {flexDirection: 'row', alignItems: 'baseline', gap: 3},
  nextSvcValue: {fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1},
  nextSvcUnit: {fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)'},

  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 10, marginTop: 20,
  },

  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP},
  card: {
    width: CARD_WIDTH, backgroundColor: '#fff',
    padding: 14, paddingBottom: 14,
    justifyContent: 'space-between',
    minHeight: 100,
  },
  cardNameRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6},
  cardDot: {width: 7, height: 7, borderRadius: 4, position:'relative', top: -12, right: -8,},
  cardName: {fontSize: 14, fontWeight: '700', color: '#1A1A1A', lineHeight: 17, flexShrink: 1},
  cardFooter: {marginTop: 8},
  cardBarTrack: {height: 5, backgroundColor: '#EBEBED', overflow: 'hidden', marginBottom: 6},
  cardBarFill: {height: '100%'},
  cardBottom: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  cardSub: {fontSize: 9, color: '#8E8E93', fontWeight: '500'},
  cardPercent: {fontSize: 12, fontWeight: '800', letterSpacing: -0.2, color: '#1A1A1A'},

  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingBottom: 44,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6',
    alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20},
  sheetTitle: {fontSize: 20, fontWeight: '700', color: '#1A1A1A', letterSpacing: -0.3},
  sheetClose: {fontSize: 24, color: '#8E8E93', fontWeight: '300', lineHeight: 26},

  sheetHero: {flexDirection: 'row', alignItems: 'baseline', marginBottom: 12},
  sheetPercent: {fontSize: 56, fontWeight: '800', letterSpacing: -3},
  sheetPercentSign: {fontSize: 20, fontWeight: '600', marginLeft: 2},
  sheetPercentLabel: {fontSize: 15, color: '#8E8E93', fontWeight: '500', marginLeft: 8},

  sheetBarTrack: {height: 6, backgroundColor: '#EBEBED', borderRadius: 3, overflow: 'hidden', marginBottom: 24},
  sheetBarFill: {height: '100%', borderRadius: 3},

  sheetRows: {gap: 14, marginBottom: 28},
  sheetRow: {flexDirection: 'row', justifyContent: 'space-between'},
  sheetRowLabel: {fontSize: 14, color: '#8E8E93', fontWeight: '500'},
  sheetRowVal: {fontSize: 14, fontWeight: '600', color: '#1A1A1A'},
  sheetDivider: {height: 1, backgroundColor: '#F0F0F2'},

  resetBtn: {
    backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  resetBtnText: {fontSize: 15, fontWeight: '600', color: '#fff'},
});
