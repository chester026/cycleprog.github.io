// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b): the grouped component sections + cards. Card width now comes
// from `useWindowDimensions()` instead of the original's
// `Dimensions.get('window')` (GUIDE-5b) — same computation, just reactive
// to rotation/resize. Header row and card visuals were pulled out into
// `src/components/SectionHeader.tsx`/`GridCard.tsx` (Checklist redesign,
// T-6.x) since the Checklist screen reuses the exact same look — same
// styles/props as the inline version below, so this is pixel-identical.
import React from 'react';
import {useWindowDimensions, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {GridCard} from '../../components/GridCard';
import {SectionHeader} from '../../components/SectionHeader';
import {makeStyles} from '../../theme';
import {resolveComponentGroups, computeCardWidth, CARD_GAP, STATUS_TINT} from './lib';
import type {BikeHealth, ComponentHealth} from './types';

interface ComponentsGridProps {
  health: BikeHealth;
  onOpenDetail: (comp: ComponentHealth) => void;
  onRenameGroup: (groupKey: string, currentLabel: string) => void;
}

export const ComponentsGrid: React.FC<ComponentsGridProps> = ({
  health,
  onOpenDetail,
  onRenameGroup,
}) => {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const cardWidth = computeCardWidth(screenWidth);
  const groups = resolveComponentGroups(health.components);

  return (
    <>
      {groups.map(group => {
        const groupLabel = health.groupLabels?.[group.key] || t(`bikeGarage.group_${group.key}`);
        return (
          <View key={group.key}>
            <SectionHeader
              title={groupLabel}
              onEdit={() => onRenameGroup(group.key, health.groupLabels?.[group.key] || '')}
            />
            <View style={styles.grid}>
              {group.items.map(comp => {
                const tint = STATUS_TINT[comp.status];
                const compLabel = health.componentLabels?.[comp.id] || t(`bikeGarage.comp_${comp.id}`);
                return (
                  <GridCard
                    key={comp.id}
                    title={compLabel}
                    width={cardWidth}
                    percent={comp.healthPercent}
                    barColor={tint}
                    subLabel={`~${comp.remainingKm.toLocaleString()} ${t('common.km')}`}
                    valueLabel={`${comp.healthPercent}%`}
                    dotColor={comp.status === 'critical' ? tint : undefined}
                    onPress={() => onOpenDetail(comp)}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </>
  );
};

const styles = makeStyles(() => ({
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP},
}));
