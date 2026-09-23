// Screen decomposition (T-5.5, GUIDE-5b): split into `src/screens/BikeGarage/*`
// (pieces + `lib.ts` + tests) — this file now only wires data (bikes/health
// fetch via the typed contract, T-7.1) and state,
// composing the pieces in the same order the original inline JSX did.
// Behaviour and pixels are unchanged; see git history for the pre-split
// version. One intentional no-op removal: the original had a hidden
// (`display: 'none'`) per-card rename button that was never reachable from
// the UI (see the removed comment in the original) — dropped as dead code,
// not a behaviour change (openRename/saveRename below still support
// component-level rename for when a UI trigger is added).
import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Animated} from 'react-native';
import {useTranslation} from 'react-i18next';
import {api, bikes as bikesApi} from '../data/api';
import type {Bike} from '@bikelab/shared/types';
import type {AppNavigationProp} from '../navigation/types';
import type {useAppRoute} from '../navigation/hooks';
import {logger} from '../lib/logger';
import {makeStyles, useTheme} from '../theme';

import {BikeOnboarding} from '../components/BikeOnboarding';
import {BikeGarageHeader} from './BikeGarage/Header';
import {BikeSelectorPills} from './BikeGarage/BikeSelectorPills';
import {BikeHero} from './BikeGarage/BikeHero';
import {OverviewCard} from './BikeGarage/OverviewCard';
import {NextServiceBanner} from './BikeGarage/NextServiceBanner';
import {ComponentsGrid} from './BikeGarage/ComponentsGrid';
import {ComponentDetailSheet} from './BikeGarage/ComponentDetailSheet';
import {RenameSheet} from './BikeGarage/RenameSheet';
import {bikeDisplayName} from './BikeGarage/lib';
import type {BikeHealth, ComponentHealth, RenameTarget} from './BikeGarage/types';

interface BikeGarageScreenProps {
  navigation: AppNavigationProp;
  route: ReturnType<typeof useAppRoute<'BikeGarage'>>;
}

export const BikeGarageScreen: React.FC<BikeGarageScreenProps> = ({navigation, route}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const initialBikeId = route?.params?.bikeId;

  const [bikes, setBikes] = useState<Bike[]>([]);
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(initialBikeId || null);
  const [health, setHealth] = useState<BikeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailComponent, setDetailComponent] = useState<ComponentHealth | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const openDetail = useCallback(
    (comp: ComponentHealth) => {
      setDetailComponent(comp);
      setDetailVisible(true);
      Animated.timing(slideAnim, {toValue: 1, duration: 250, useNativeDriver: true}).start();
    },
    [slideAnim],
  );

  const closeDetail = useCallback(() => {
    Animated.timing(slideAnim, {toValue: 0, duration: 200, useNativeDriver: true}).start(() => {
      setDetailVisible(false);
      setDetailComponent(null);
    });
  }, [slideAnim]);

  const loadBikes = useCallback(async () => {
    try {
      const data = await api.call(bikesApi.list);
      setBikes(data || []);
      if (!selectedBikeId && data?.length > 0) {
        const primary = data.find((b: Bike) => b.primary) || data[0];
        setSelectedBikeId(primary.id);
      }
    } catch (error) {
      logger.error('Error loading bikes:', error);
    }
  }, [selectedBikeId]);

  const loadHealth = useCallback(async (bikeId: string) => {
    setHealthLoading(true);
    try {
      // Contract's BikeHealthSchema allows a raw Date for `lastResetAt` and
      // requires the label maps; this screen's BikeHealth type predates it —
      // over fetch()+JSON the Date case can't occur, so cast rather than loosen.
      const data = (await api.call(bikesApi.health, {params: {bikeId}})) as unknown as BikeHealth;
      setHealth(data);
    } catch (error) {
      logger.error('Error loading bike health:', error);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleReset = useCallback(
    (componentId: string) => {
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
                await api.call(bikesApi.resetComponent, {
                  params: {bikeId: selectedBikeId, component: componentId},
                });
                await loadHealth(selectedBikeId);
                closeDetail();
              } catch (error) {
                logger.error('Error resetting component:', error);
                Alert.alert(t('common.error'), t('bikeGarage.resetFailed'));
              }
            },
          },
        ],
      );
    },
    [selectedBikeId, t, loadHealth, closeDetail],
  );

  const openRename = useCallback((type: 'group' | 'component', key: string, currentLabel: string) => {
    setRenameTarget({type, key, currentLabel});
    setRenameValue(currentLabel);
  }, []);

  const closeRename = useCallback(() => {
    setRenameTarget(null);
    setRenameValue('');
  }, []);

  const saveRename = useCallback(async () => {
    if (!selectedBikeId || !renameTarget || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      await api.call(bikesApi.updateLabels, {
        params: {bikeId: selectedBikeId},
        body: {
          labels: [{target_type: renameTarget.type, target_key: renameTarget.key, custom_name: renameValue.trim()}],
        },
      });
      await loadHealth(selectedBikeId);
      closeRename();
    } catch (error) {
      logger.error('Error saving rename:', error);
      Alert.alert(t('common.error'), t('bikeGarage.resetFailed'));
    } finally {
      setRenameSaving(false);
    }
  }, [selectedBikeId, renameTarget, renameValue, t, loadHealth, closeRename]);

  const selectedBike = bikes.find(b => b.id === selectedBikeId) || bikes[0];

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={theme.colors.text.primary} />
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
    <View style={s.root} testID="bike-garage-screen">
      <BikeGarageHeader onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.text.primary} />}
        showsVerticalScrollIndicator={false}>
        {bikes.length > 1 && (
          <BikeSelectorPills bikes={bikes} selectedBikeId={selectedBikeId} onSelect={setSelectedBikeId} />
        )}

        {selectedBike ? <BikeHero bike={selectedBike} /> : null}

        {healthLoading ? (
          <View style={s.healthLoading}>
            <ActivityIndicator size="large" color={theme.colors.text.primary} />
          </View>
        ) : health && !health.onboardingCompleted && selectedBikeId ? (
          <BikeOnboarding
            bikeId={selectedBikeId}
            bikeName={selectedBike?.name || ''}
            totalKm={health.totalKm}
            onComplete={() => loadHealth(selectedBikeId)}
          />
        ) : health ? (
          <>
            <OverviewCard
              health={health}
              onAskCoach={() =>
                navigation.navigate('CoachChat', {
                  initialPrompt: t('bikeGarage.askCoachPrompt', {
                    bikeName: selectedBike ? bikeDisplayName(selectedBike) : '',
                  }),
                  requestId: Date.now(),
                })
              }
            />

            {health.nextService.inKm > 0 && <NextServiceBanner nextService={health.nextService} />}

            <ComponentsGrid
              health={health}
              onOpenDetail={openDetail}
              onRenameGroup={(groupKey, currentLabel) => openRename('group', groupKey, currentLabel)}
            />
          </>
        ) : null}
      </ScrollView>

      <ComponentDetailSheet
        visible={detailVisible}
        component={detailComponent}
        componentLabels={health?.componentLabels}
        slideAnim={slideAnim}
        onClose={closeDetail}
        onReset={handleReset}
      />

      <RenameSheet
        target={renameTarget}
        value={renameValue}
        saving={renameSaving}
        onChangeValue={setRenameValue}
        onClose={closeRename}
        onSave={saveRename}
      />
    </View>
  );
};

const s = makeStyles(theme => ({
  root: {flex: 1, backgroundColor: theme.colors.backgroundLight},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundLight, padding: 32},
  emptyTitle: {fontSize: 18, fontWeight: '600', color: theme.colors.text.primary, marginBottom: 6},
  emptyHint: {fontSize: 14, color: theme.colors.text.iosMuted, textAlign: 'center', marginBottom: 20},
  linkText: {fontSize: 15, color: theme.colors.accent, fontWeight: '600'},
  scroll: {paddingHorizontal: 16, paddingBottom: 100},
  healthLoading: {paddingVertical: 60, alignItems: 'center'},
}));
