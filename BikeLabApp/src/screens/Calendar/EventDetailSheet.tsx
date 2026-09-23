// Event detail bottom sheet (view + edit) — T-5.4/T-5.1, audit A-27.
import React from 'react';
import {Animated, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import type {CalendarEvent} from '@bikelab/shared/types';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {SparkleIcon} from '../../assets/img/icons/SparkleIcon';
import {EditIcon} from '../../assets/img/icons/EditIcon';
import {TrashIcon} from '../../assets/img/icons/TrashIcon';
import {formatDayHeader, formatEventDuration} from './lib';
import {EVENT_COLORS} from './DayList';
import {EventForm, type EventFormValues} from './EventForm';

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  editing: boolean;
  slideAnim: Animated.Value;
  locale: string;
  formValues: EventFormValues;
  saving: boolean;
  syncingApple: boolean;
  onClose: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onFormChange: (values: EventFormValues) => void;
  onSave: () => void;
  onDelete: () => void;
  onAskAgent: (event: CalendarEvent) => void;
  onOpenGoal: (goalId: number | string) => void;
  onSyncApple: () => void;
}

export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({
  event,
  editing,
  slideAnim,
  locale,
  formValues,
  saving,
  syncingApple,
  onClose,
  onStartEdit,
  onCancelEdit,
  onFormChange,
  onSave,
  onDelete,
  onAskAgent,
  onOpenGoal,
  onSyncApple,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <Modal visible={!!event} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContent, {transform: [{translateY: slideAnim}]}]}>
            <View style={styles.dragHandle} />
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {event && !editing ? <>
                  {/* 1. Type badge, close button top-right */}
                  <View style={styles.modalHeader}>
                    <View style={styles.eyebrowRow}>
                      <View style={[styles.eyebrowDot, {backgroundColor: EVENT_COLORS[event.type] || EVENT_COLORS.planned_ride}]} />
                      <Text style={styles.eyebrowText}>{t(`calendar.types.${event.type}`)}</Text>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                      <Text style={styles.closeBtnText}>×</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 2. Heading */}
                  <Text style={styles.detailTitle}>{event.title}</Text>
                  {!!event.location && <Text style={styles.detailMeta}>{event.location}</Text>}

                  {/* 3. Goal badge */}
                  {!!event.goal_id && !!event.goal_title && (
                    <TouchableOpacity style={styles.goalBadge} onPress={() => onOpenGoal(event.goal_id!)} activeOpacity={0.7}>
                      <Text style={styles.goalBadgeText} numberOfLines={1}>
                        {t('coach.supportsGoal', {goal: event.goal_title})}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* 4. Description */}
                  {!!event.description && <Text style={styles.detailDescription}>{event.description}</Text>}

                  {/* 5. Date + Apple sync status, merged into one line */}
                  <View style={styles.dateSyncRow}>
                    <Text style={styles.detailDate}>{formatDayHeader(event.start_date, locale)}</Text>
                    {Platform.OS === 'ios' &&
                      (event.apple_event_id ? (
                        <View style={styles.appleSyncedInline}>
                          <Text style={styles.dateSyncDot}>·</Text>
                          <Text style={styles.appleSyncedCheck}>✓</Text>
                          <Text style={styles.appleSyncedText}>{t('coach.syncAppleSuccess')}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.appleSyncedInline} onPress={onSyncApple} disabled={syncingApple}>
                          <Text style={styles.dateSyncDot}>·</Text>
                          <Text style={styles.linkBtnText}>{syncingApple ? t('common.loading') : t('coach.syncAppleButton')}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>

                  {(() => {
                    const durationLabel = formatEventDuration(event.start_time, event.end_time);
                    return (
                      <View style={styles.chipsRow}>
                        {!!durationLabel && (
                          <View style={styles.metaChip}>
                            <Text style={styles.metaChipIcon}>🕐</Text>
                            <Text style={styles.metaChipText}>{durationLabel}</Text>
                          </View>
                        )}
                        <View style={styles.metaChip}>
                          <Text style={styles.metaChipIcon}>✓</Text>
                          <Text style={styles.metaChipText}>{t(`calendar.types.${event.type}`)}</Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* 6. Button group */}
                  <View style={styles.bottomRow}>
                    <TouchableOpacity style={styles.iconCircleBtn} onPress={onStartEdit}>
                      <EditIcon size={18} color={theme.colors.calendar.bodyText} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconCircleBtn} onPress={onDelete}>
                      <TrashIcon size={18} color={theme.colors.calendar.bodyText} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.askAgentBtn} onPress={() => onAskAgent(event)} activeOpacity={0.85}>
                      <SparkleIcon size={18} color={theme.colors.text.inverse} />
                      <Text style={styles.askAgentBtnText}>{t('calendar.askAgent')}</Text>
                    </TouchableOpacity>
                  </View>
                </> : null}

              {event && editing ? <EventForm values={formValues} saving={saving} onChange={onFormChange} onCancel={onCancelEdit} onSave={onSave} /> : null}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  flex: {flex: 1},
  modalOverlay: {
    flex: 1,
    backgroundColor: withOpacity(theme.colors.black, 0.5),
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing[24],
    paddingTop: theme.spacing[12],
    paddingBottom: Platform.OS === 'ios' ? 40 : theme.spacing[24],
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center',
    marginBottom: theme.spacing[20],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[12],
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eyebrowText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: theme.typography.fontSize.xl + 2,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  detailTitle: {
    fontSize: 30, // no exact token (xxxl=24)
    fontWeight: '800', // no exact token
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[8],
  },
  detailDate: {
    fontSize: theme.typography.fontSize.xl - 1,
    color: theme.colors.text.muted,
    textTransform: 'capitalize',
  },
  detailMeta: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[8],
  },
  detailDescription: {
    fontSize: theme.typography.fontSize.xl - 1,
    color: theme.colors.calendar.bodyText,
    lineHeight: 22,
    marginBottom: theme.spacing[16],
  },
  // Kept exactly as in the pre-refactor screen — `display: 'none'`
  // deliberately hides this row; see this task's report for confirmation
  // it's unused-but-intentional rather than dead code to delete.
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[16],
    display: 'none',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    backgroundColor: theme.colors.divider,
    borderRadius: 18,
    paddingHorizontal: theme.spacing[14],
    paddingVertical: 9,
  },
  metaChipIcon: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  metaChipText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.calendar.bodyText,
  },
  goalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentSurface,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[10],
    paddingVertical: 5,
    marginBottom: theme.spacing[20],
  },
  goalBadgeText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.accent,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    marginTop: theme.spacing[24],
  },
  iconCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askAgentBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.calendar.nearBlackFill,
    borderRadius: 27,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
  },
  askAgentBtnText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  linkBtnText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.accent,
  },
  dateSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing[16],
  },
  appleSyncedInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
  },
  dateSyncDot: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.muted,
    marginHorizontal: theme.spacing[6],
  },
  appleSyncedCheck: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.success,
  },
  appleSyncedText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.success,
  },
}));
