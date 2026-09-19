import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Path} from 'react-native-svg';
import {ACCENT, CoachCard, Eyebrow, FooterLink, IconTile} from './CoachCardChrome';

// Shown inline in the chat when the coach's add_checklist_items or
// update_checklist_item tool call succeeds (server tools, T-6.x) — visual
// language ported from the "Rich Chat Cards v2" reference, mirrors
// GoalCreatedCard/CalendarEventCreatedCard so every "did X" card reads as
// the same family.
export interface AddedChecklistItem {
  id: number | string;
  item: string;
  link?: string | null;
}

export type ChecklistUpdateSummary =
  | {type: 'added'; section: string; items: AddedChecklistItem[]}
  | {type: 'checked'; item: string}
  | {type: 'removed'};

const CheckIcon: React.FC<{color: string}> = ({color}) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M4 10.5 8 14.5 16 6"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ChecklistUpdatedCard: React.FC<{
  summary: ChecklistUpdateSummary;
  onPress: () => void;
}> = ({summary, onPress}) => {
  const {t} = useTranslation();
  const accent = summary.type === 'removed' ? ACCENT.gray : ACCENT.green;

  return (
    <CoachCard accent={accent} onPress={onPress} testID="checklist-updated-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <CheckIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.checklistUpdatedLabel')}</Eyebrow>
      </View>

      {summary.type === 'added' && (
        <>
          <Text style={styles.title} numberOfLines={1}>
            {summary.section}
          </Text>
          {summary.items.map(item => (
            <Text key={item.id} style={styles.itemLine} numberOfLines={1}>
              • {item.item}
            </Text>
          ))}
        </>
      )}

      {summary.type === 'checked' && (
        <Text style={styles.title} numberOfLines={2}>
          {t('checklist.checkedOff', {item: summary.item})}
        </Text>
      )}

      {summary.type === 'removed' && <Text style={styles.title}>{t('checklist.itemRemoved')}</Text>}

      <FooterLink label={t('coach.viewChecklist')} />
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#0E0E12',
    marginTop: 12,
  },
  itemLine: {
    fontSize: 13,
    color: '#61616B',
    lineHeight: 19,
    marginTop: 4,
  },
});
