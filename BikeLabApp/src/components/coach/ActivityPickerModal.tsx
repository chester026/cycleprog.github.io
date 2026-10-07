import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Activity} from '../../types/activity';
import {makeStyles, withOpacity} from '../../theme';
import {RideRow} from '../RideRow';
import {useTrackOpenModal} from '../../lib/openModals';

// Kept intentionally small — just what the model needs to reason about a
// ride, not the full Activity shape (map polyline, resource_state, etc.
// would just burn context tokens for no benefit).
export interface AttachedActivity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  average_watts?: number;
}

// Each serialized activity costs ~200 tokens (see serializeAttachedActivities
// in CoachChatScreen) — 5 keeps a multi-activity question well within
// budget without the picker needing its own scroll-within-scroll UI.
export const MAX_ATTACHMENTS = 5;

type PickerListItem = {kind: 'ride'; activity: Activity} | {kind: 'caption'; text: string};

function sortNewestFirst(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
}

export function toAttached(a: Activity): AttachedActivity {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    start_date: a.start_date,
    distance: a.distance,
    moving_time: a.moving_time,
    total_elevation_gain: a.total_elevation_gain,
    average_heartrate: a.average_heartrate,
    average_watts: a.average_watts,
  };
}

// Bottom-sheet multi-select over the rider's synced Strava activities. Used by
// the coach chat (attach rides as hidden context) and by GoalDetails' complete
// sheet (attach the rides that did the goal) — the title, CTA labels, limit,
// preselection and an "earlier rides" section are props. Same slide-up modal
// pattern as PlannedRidesWidget's add-ride sheet, for visual consistency.
export const ActivityPickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onConfirm: (activities: Activity[]) => void;
  activities: Activity[];
  title: string;
  /** CTA text once something is selected. */
  confirmLabel: (count: number) => string;
  /** When set, the CTA stays enabled with nothing selected and shows this text. */
  emptyConfirmLabel?: string;
  emptyText: string;
  /** Pre-seeds the selection each time the sheet opens. */
  preselectedIds?: number[];
  /** Selection cap; the coach prompt budget needs one, the goal sheet doesn't. */
  maxSelection?: number;
  /** Rides listed under a caption after `activities` (e.g. when the window has few rides). */
  earlierActivities?: Activity[];
  earlierCaption?: string;
}> = ({
  visible,
  onClose,
  onConfirm,
  activities,
  title,
  confirmLabel,
  emptyConfirmLabel,
  emptyText,
  preselectedIds,
  maxSelection,
  earlierActivities,
  earlierCaption,
}) => {
  const {t} = useTranslation();
  useTrackOpenModal(visible);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const slideAnim = useState(new Animated.Value(400))[0];

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set(preselectedIds || []));
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Slides down first, THEN flips the controlled `visible` prop via
  // onClose — an abrupt cut on close would look inconsistent with the
  // spring-in on open.
  const handleClose = () => {
    Animated.timing(slideAnim, {toValue: 400, duration: 200, useNativeDriver: true}).start(() => {
      onClose();
    });
  };

  const sorted = useMemo(() => sortNewestFirst(activities), [activities]);
  const earlier = useMemo(() => sortNewestFirst(earlierActivities ?? []), [earlierActivities]);
  const listItems = useMemo<PickerListItem[]>(
    () => [
      ...sorted.map((activity): PickerListItem => ({kind: 'ride', activity})),
      ...(earlier.length > 0 && earlierCaption ? [{kind: 'caption' as const, text: earlierCaption}] : []),
      ...earlier.map((activity): PickerListItem => ({kind: 'ride', activity})),
    ],
    [sorted, earlier, earlierCaption],
  );

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (maxSelection !== undefined && next.size >= maxSelection) {
        Alert.alert(t('coach.attachLimitTitle'), t('coach.attachLimitMessage', {max: maxSelection}));
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm([...sorted, ...earlier].filter(a => selectedIds.has(a.id)));
  };

  const canConfirm = selectedIds.size > 0 || emptyConfirmLabel !== undefined;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[styles.sheet, {transform: [{translateY: slideAnim}]}]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.closeButton}>×</Text>
            </TouchableOpacity>
          </View>

          {listItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          ) : (
            <FlatList
              data={listItems}
              keyExtractor={item => (item.kind === 'ride' ? String(item.activity.id) : 'caption')}
              style={styles.list}
              renderItem={({item}) =>
                item.kind === 'caption' ? (
                  <Text style={styles.caption}>{item.text}</Text>
                ) : (
                  <RideRow
                    ride={{
                      name: item.activity.name,
                      startDate: item.activity.start_date,
                      distanceM: item.activity.distance || 0,
                      elevationM: item.activity.total_elevation_gain || 0,
                      movingTimeS: item.activity.moving_time || 0,
                    }}
                    selected={selectedIds.has(item.activity.id)}
                    onPress={() => toggleSelect(item.activity.id)}
                    testID={`picker-ride-${item.activity.id}`}
                  />
                )
              }
            />
          )}

          <TouchableOpacity
            testID="picker-confirm"
            style={[styles.attachBtn, !canConfirm && styles.attachBtnDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}>
            <Text style={styles.attachBtnText}>
              {selectedIds.size === 0 && emptyConfirmLabel !== undefined
                ? emptyConfirmLabel
                : confirmLabel(selectedIds.size)}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  overlay: {
    flex: 1,
    backgroundColor: withOpacity(theme.colors.black, 0.5),
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  closeButton: {
    fontSize: 28,
    color: theme.colors.text.faint,
    fontWeight: '300',
  },
  list: {
    flexGrow: 0,
  },
  caption: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: theme.colors.text.faint,
    marginTop: 16,
    marginBottom: 4,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.text.faint,
    fontSize: 14,
  },
  attachBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.accent,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  attachBtnDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  attachBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 15,
    fontWeight: '700',
  },
}));
