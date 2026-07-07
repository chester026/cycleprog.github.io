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
import {getDateLocale} from '../../i18n/dateLocale';

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
const MAX_ATTACHMENTS = 5;

function toAttached(a: Activity): AttachedActivity {
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

function formatRow(a: Activity): {date: string; distKm: string; duration: string} {
  const date = new Date(a.start_date).toLocaleDateString(getDateLocale(), {month: 'short', day: 'numeric'});
  const distKm = ((a.distance || 0) / 1000).toFixed(1);
  const hours = Math.floor((a.moving_time || 0) / 3600);
  const mins = Math.floor(((a.moving_time || 0) % 3600) / 60);
  const duration = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
  return {date, distKm, duration};
}

// Bottom-sheet multi-select over the rider's synced Strava activities, so a
// coach message can carry structured ride data as hidden context instead of
// the user having to describe the ride by hand. Same slide-up modal pattern
// as PlannedRidesWidget's add-ride sheet, for visual consistency.
export const ActivityPickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onAttach: (activities: AttachedActivity[]) => void;
  activities: Activity[];
  // Pre-seeds the selection when reopening the picker to add more on top of
  // an existing attachment set, instead of losing it.
  alreadyAttachedIds?: number[];
}> = ({visible, onClose, onAttach, activities, alreadyAttachedIds}) => {
  const {t} = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const slideAnim = useState(new Animated.Value(400))[0];

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set(alreadyAttachedIds || []));
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

  const sorted = useMemo(
    () => [...activities].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()),
    [activities],
  );

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_ATTACHMENTS) {
        Alert.alert(t('coach.attachLimitTitle'), t('coach.attachLimitMessage', {max: MAX_ATTACHMENTS}));
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  const handleAttach = () => {
    const chosen = sorted.filter(a => selectedIds.has(a.id)).map(toAttached);
    onAttach(chosen);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[styles.sheet, {transform: [{translateY: slideAnim}]}]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('coach.attachActivities')}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.closeButton}>×</Text>
            </TouchableOpacity>
          </View>

          {sorted.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('coach.attachEmptyActivities')}</Text>
            </View>
          ) : (
            <FlatList
              data={sorted}
              keyExtractor={item => String(item.id)}
              style={styles.list}
              renderItem={({item}) => {
                const selected = selectedIds.has(item.id);
                const {date, distKm, duration} = formatRow(item);
                return (
                  <TouchableOpacity style={styles.row} onPress={() => toggleSelect(item.id)} activeOpacity={0.7}>
                    <View style={styles.rowMain}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {date} · {distKm}km · {duration}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                      {selected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity
            style={[styles.attachBtn, selectedIds.size === 0 && styles.attachBtnDisabled]}
            onPress={handleAttach}
            disabled={selectedIds.size === 0}>
            <Text style={styles.attachBtnText}>{t('coach.attachButton', {count: selectedIds.size})}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
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
    color: '#1a1a1a',
  },
  closeButton: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowMain: {
    flex: 1,
    marginRight: 8,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: 12,
    color: '#888',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#274dd3',
    borderColor: '#274dd3',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  attachBtn: {
    marginTop: 16,
    backgroundColor: '#274dd3',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  attachBtnDisabled: {
    backgroundColor: '#ccc',
  },
  attachBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
