// Checklist preview strip for GarageScreen (owner decision 18.09) — a
// horizontally-scrolling row of section cards summarizing /api/checklist
// (same data ChecklistScreen itself edits, via the shared useChecklist()
// cache), plus a "+ New item" card. Ported "as is" from the web SPA's
// react-spa/src/pages/garage/ChecklistPreview.jsx — no editing here, every
// card just navigates to the Checklist screen, which owns the actual
// add/check/delete UI.
import React from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useAppNavigation} from '../../navigation/hooks';
import {makeStyles} from '../../theme';
import {useChecklist} from '../../data/hooks';
import {groupBySection} from '../Checklist/lib';

const MAX_ITEMS_SHOWN = 3;

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

  if (sections.length === 0) {
    return (
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={[styles.card, styles.emptyCard]} onPress={goToChecklist}>
            <Text style={styles.emptyTitle}>{t('checklist.planUpgrades')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('checklist.title')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {sections.map(({section, items, done, total, percent}) => {
          const shown = items.slice(0, MAX_ITEMS_SHOWN);
          const extra = items.length - shown.length;
          return (
            <TouchableOpacity key={section} style={styles.card} onPress={goToChecklist}>
              <Text style={styles.sectionName}>{section}</Text>
              <Text style={styles.count}>
                {done}/{total}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {width: `${percent}%`}]} />
              </View>
              <View style={styles.itemList}>
                {shown.map(item => (
                  <View key={item.id} style={styles.itemRow}>
                    {item.checked && <Text style={styles.check}>✓</Text>}
                    <Text
                      style={[styles.itemText, item.checked && styles.itemTextDone]}
                      numberOfLines={1}>
                      {item.item}
                    </Text>
                  </View>
                ))}
              </View>
              {extra > 0 && <Text style={styles.more}>{t('checklist.moreItems', {count: extra})}</Text>}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={[styles.card, styles.newCard]} onPress={goToChecklist}>
          <Text style={styles.newPlus}>＋</Text>
          <Text style={styles.newCardText}>{t('checklist.newItem')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
    marginBottom: theme.spacing[8],
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: theme.spacing[12],
    paddingHorizontal: theme.spacing[16],
  },
  card: {
    width: 200,
    minHeight: 140,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.md,
    padding: theme.spacing[14],
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
  sectionName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  count: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[8],
  },
  progressTrack: {
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: theme.spacing[8],
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.accent,
  },
  itemList: {
    gap: theme.spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  check: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.successStrong,
  },
  itemText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.primary,
    flexShrink: 1,
  },
  itemTextDone: {
    textDecorationLine: 'line-through',
    color: theme.colors.text.muted,
  },
  more: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.muted,
    marginTop: theme.spacing[4],
  },
  newCard: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
  },
  newPlus: {
    fontSize: theme.typography.fontSize.xxl,
    color: theme.colors.accent,
  },
  newCardText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[4],
  },
}));
