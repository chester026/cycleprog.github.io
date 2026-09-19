// Checklist preview strip for GarageScreen, redesigned in BikeGarage's
// visual language (owner request, 19.09): a big grey uppercase title, pixel-
// identical to AchievementsPreview's "ACHIEVES" (GarageSectionTitle), then a
// horizontally scrolling row of grey section cards — same card style as
// OverallStats' stat cards — showing name with done/total on the same row,
// a pill progress bar and the first open items as outlined pill badges
// (owner feedback, 19.09), plus a trailing grey "+ New item" card.
// Data comes from the same `useChecklist()` cache the Checklist screen
// itself edits — this strip is read-only, every card just navigates there.
import React from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useAppNavigation} from '../../navigation/hooks';
import {makeStyles} from '../../theme';
import {useChecklist} from '../../data/hooks';
import {groupBySection} from '../Checklist/lib';
import {GarageSectionTitle} from './GarageSectionTitle';

const MAX_ITEMS_SHOWN = 2;

export const ChecklistPreview: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();
  const {data, isLoading} = useChecklist();

  // Avoid flashing the empty state before the first fetch resolves (same
  // rule the web version uses).
  if (isLoading) return null;

  const rows = data ?? [];
  const sections = groupBySection(rows);
  const goToChecklist = () => navigation.navigate('Checklist');
  const goToAddItem = () => navigation.navigate('Checklist', {focusAddItem: true});

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <GarageSectionTitle title={t('checklist.previewTitle')} />
      </View>

      {sections.length === 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={[styles.card, styles.emptyCard]} onPress={goToAddItem}>
            <Text style={styles.emptyTitle}>{t('checklist.planUpgrades')}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {sections.map(({section, items, done, total, percent}) => {
            const open = items.filter(item => !item.checked).slice(0, MAX_ITEMS_SHOWN);
            return (
              <TouchableOpacity key={section} style={styles.card} onPress={goToChecklist}>
                <View style={styles.titleRow}>
                  <Text style={styles.sectionName} numberOfLines={1}>
                    {section}
                  </Text>
                  <Text style={styles.count}>
                    {done}/{total}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, {width: `${percent}%`}]} />
                </View>
                <View style={styles.badges}>
                  {open.map(item => (
                    <View key={item.id} style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {item.item}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={[styles.card, styles.newCard]} onPress={goToAddItem}>
            <Text style={styles.newPlus}>＋</Text>
            <Text style={styles.newCardText}>{t('checklist.newItem')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    marginTop: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  header: {
    paddingHorizontal: theme.spacing[16],
    marginBottom: theme.spacing[24],
  },
  scrollContent: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  // Same grey card as OverallStats' stat cards — no white background, no
  // border (owner feedback, 19.09).
  // Chrome and header typography mirror OverallStats' `overallCard*` styles
  // (owner feedback, 19.09) so the two rows read as one system.
  card: {
    width: 170,
    minHeight: 120,
    backgroundColor: '#f1f0f0',
    borderRadius: 24,
    padding: theme.spacing[18],
    justifyContent: 'space-between',
  },
  emptyCard: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 260,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  sectionName: {
    flexShrink: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 20,
  },
  count: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#999',
    marginTop: theme.spacing[2],
  },
  progressTrack: {
    height: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: '#E1E1E1',
    overflow: 'hidden',
    marginBottom: theme.spacing[2],
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[6],

  },
  badge: {
    maxWidth: '100%',
    borderWidth: 1,
    backgroundColor:'#EbEbEb',
    borderColor: '#D9D9DE',
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: theme.spacing[4],
  },
  badgeText: {
    fontSize: theme.typography.fontSize.sm,
    color: '#8E8E93',
  },
  newCard: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 160,
  },
  newPlus: {
    fontSize: theme.typography.fontSize.xxxl,
    color: '#CCCCCC',
  },
  newCardText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[4],
  },
}));
