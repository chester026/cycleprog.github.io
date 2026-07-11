import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {apiFetch} from '../utils/api';
import {getDateLocale} from '../i18n/dateLocale';
import {useAppData} from '../contexts/AppDataContext';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';
import {syncEventToApple, deleteAppleEvent} from '../utils/calendarSync';
import {SparkleIcon} from '../assets/img/icons/SparkleIcon';
import {EditIcon} from '../assets/img/icons/EditIcon';
import {TrashIcon} from '../assets/img/icons/TrashIcon';
import type {Activity} from '../types/activity';

interface CalendarEvent {
  id: number;
  type: string;
  title: string;
  description?: string;
  location?: string;
  location_link?: string;
  start_date: string;
  end_date?: string;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  completed?: boolean;
  source: string;
  coach_conversation_id?: string;
  apple_event_id?: string | null;
  goal_id?: number | null;
  goal_title?: string | null;
}

interface DayGroup {
  date: string; // YYYY-MM-DD
  activities: Activity[];
  events: CalendarEvent[];
}

const EVENT_TYPES = ['planned_ride', 'rest_day', 'maintenance', 'purchase', 'event', 'note'];

const EVENT_COLORS: Record<string, string> = {
  planned_ride: '#274dd3',
  rest_day: '#6B7280',
  maintenance: '#F59E0B',
  purchase: '#10B981',
  event: '#FC5200',
  note: '#8B5CF6',
};

// "Ask Agent" opens the coach with a question tailored to what kind of
// event this is, rather than one generic prompt for every type.
const ASK_PROMPT_KEYS: Record<string, string> = {
  planned_ride: 'calendar.askPromptPlannedRide',
  rest_day: 'calendar.askPromptRestDay',
  maintenance: 'calendar.askPromptMaintenance',
  purchase: 'calendar.askPromptPurchase',
  event: 'calendar.askPromptEvent',
  note: 'calendar.askPromptNote',
};

// Local calendar date, NOT toISOString() — that converts to UTC first,
// which pushes "today" a day ahead (or behind) depending on timezone and
// time of day. Every date string in this screen (selectedDate, the week
// strip, "today" comparisons) must be a wall-clock local date.
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// Monday-start week, matching the mockup's Mon..Sun strip (vs JS's
// Sunday-start getDay()).
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = addDays(d, diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDayHeader(dateStr: string, locale: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'short'});
}

function isToday(dateStr: string): boolean {
  return dateStr === fmtDate(new Date());
}

function formatKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m}min`;
}

// The coach only ever stores a *duration* via start_time/end_time (see
// aiCoach.js's durationToTimes) — an arbitrary 09:00 anchor plus however
// many minutes the session takes — so this just diffs the two rather than
// treating them as real clock times.
function formatEventDuration(startTime?: string | null, endTime?: string | null): string | null {
  if (!startTime || !endTime) return null;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const diff = toMinutes(endTime) - toMinutes(startTime);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  if (diff < 60) return `~${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `~${h}h ${m}min` : `~${h}h`;
}

export const CalendarScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {activities, loadActivities} = useAppData();
  const locale = getDateLocale();

  const [viewMonth, setViewMonth] = useState(new Date());
  // Drives the week strip: which Mon..Sun row it shows, and which day in
  // it is highlighted. Defaults to today; month nav below resets it to the
  // 1st of the newly-viewed month so the strip always shows a week that
  // actually belongs to the visible month.
  const [selectedDate, setSelectedDate] = useState(fmtDate(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editType, setEditType] = useState('planned_ride');
  const [editDate, setEditDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingApple, setSyncingApple] = useState(false);
  const slideAnim = useState(new Animated.Value(400))[0];

  const loadCalendarData = useCallback(async (m: Date) => {
    setLoading(true);
    try {
      // Scoped to exactly the month being viewed — a wider prefetch buffer
      // used to leak neighboring months' activities/events into whichever
      // month the user navigated to (Apr/May/Jun all showing up together
      // under "May"), which read as a bug rather than smooth scrolling.
      const from = fmtDate(startOfMonth(m));
      const to = fmtDate(endOfMonth(m));
      const [, data] = await Promise.all([
        loadActivities(),
        apiFetch(`/api/calendar?from=${from}&to=${to}`),
      ]);
      setEvents(data || []);
    } catch (err) {
      console.error('Error loading calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [loadActivities]);

  // Bottom-tab screens stay mounted when you switch away — a plain
  // useEffect(mount/viewMonth) would only ever fetch once and go stale the
  // moment the coach creates an event on another tab. useFocusEffect
  // re-runs every time this screen regains focus (and still re-runs on
  // month nav while focused, since loadCalendarData's identity is stable
  // and viewMonth is a direct dependency below).
  useFocusEffect(
    useCallback(() => {
      loadCalendarData(viewMonth);
    }, [viewMonth, loadCalendarData]),
  );

  const days: DayGroup[] = useMemo(() => {
    const from = startOfMonth(viewMonth);
    const to = endOfMonth(viewMonth);
    const map = new Map<string, DayGroup>();

    activities.forEach(act => {
      const dateStr = act.start_date?.split('T')[0];
      if (!dateStr) return;
      const d = new Date(`${dateStr}T00:00:00`);
      if (d < from || d > to) return;
      if (!map.has(dateStr)) map.set(dateStr, {date: dateStr, activities: [], events: []});
      map.get(dateStr)!.activities.push(act);
    });

    events.forEach(ev => {
      const dateStr = ev.start_date?.split('T')[0];
      if (!dateStr) return;
      const d = new Date(`${dateStr}T00:00:00`);
      if (d < from || d > to) return;
      if (!map.has(dateStr)) map.set(dateStr, {date: dateStr, activities: [], events: []});
      map.get(dateStr)!.events.push(ev);
    });

    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [activities, events, viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString(locale, {month: 'long', year: 'numeric'});

  // The 7 dates (Mon..Sun) around selectedDate, for the strip under the header.
  const weekStripDays = useMemo(() => {
    const start = startOfWeek(new Date(`${selectedDate}T00:00:00`));
    return Array.from({length: 7}, (_, i) => addDays(start, i));
  }, [selectedDate]);

  // Which dates (within the currently-loaded month) have any activity or
  // event — drives the small dot under each day in the strip. Weeks that
  // straddle a month boundary won't show a dot for the spillover days from
  // the neighboring month, since `days` is only ever fetched for viewMonth.
  const datesWithContent = useMemo(() => {
    const set = new Set<string>();
    days.forEach(d => {
      if (d.activities.length || d.events.length) set.add(d.date);
    });
    return set;
  }, [days]);

  const goToday = () => {
    const now = new Date();
    setViewMonth(now);
    setSelectedDate(fmtDate(now));
  };
  const goPrevMonth = () => {
    const nm = addMonths(viewMonth, -1);
    setViewMonth(nm);
    setSelectedDate(fmtDate(startOfMonth(nm)));
  };
  const goNextMonth = () => {
    const nm = addMonths(viewMonth, 1);
    setViewMonth(nm);
    setSelectedDate(fmtDate(startOfMonth(nm)));
  };

  const selectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    const idx = days.findIndex(d => d.date === dateStr);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({index: idx, animated: true, viewPosition: 0});
    }
  };

  const openPlanWithCoach = () => {
    navigation.navigate('GoalsTab', {
      screen: 'CoachChat',
      params: {initialPrompt: t('calendar.planWithCoachPrompt')},
    });
  };

  const openGoal = (goalId: number) => {
    setSelectedEvent(null);
    navigation.navigate('GoalsTab', {
      screen: 'GoalDetails',
      params: {goalId},
    });
  };

  // "Ask Agent" starts a fresh, type-specific question about this event
  // instead of replaying the (possibly long, possibly nonexistent for
  // user-created events) original planning conversation — works for every
  // event regardless of source. calendarEventId rides along as hidden
  // context (see CoachChatScreen) so the model can act on this exact row.
  const askAgent = (ev: CalendarEvent) => {
    setSelectedEvent(null);
    const promptKey = ASK_PROMPT_KEYS[ev.type] || ASK_PROMPT_KEYS.planned_ride;
    const prompt = t(promptKey, {title: ev.title, date: formatDayHeader(ev.start_date, locale)});
    navigation.navigate('GoalsTab', {
      screen: 'CoachChat',
      params: {initialPrompt: prompt, calendarEventId: ev.id},
    });
  };

  const openActivity = (act: Activity) => {
    navigation.navigate('RideAnalytics', {activity: act});
  };

  const openEventDetail = (ev: CalendarEvent) => {
    setSelectedEvent(ev);
    setEditing(false);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  };

  const closeDetail = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setSelectedEvent(null);
      setEditing(false);
    });
  };

  const startEdit = () => {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title);
    setEditDescription(selectedEvent.description || '');
    setEditLocation(selectedEvent.location || '');
    setEditType(selectedEvent.type);
    setEditDate(new Date(`${selectedEvent.start_date}T00:00:00`));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selectedEvent || !editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/calendar/${selectedEvent.id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          location: editLocation,
          type: editType,
          start_date: fmtDate(editDate),
        }),
      });
      setEvents(prev => prev.map(e => (e.id === updated.id ? updated : e)));
      setSelectedEvent(updated);
      setEditing(false);
    } catch (err) {
      Alert.alert(t('common.error'), t('calendar.saving'));
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = () => {
    if (!selectedEvent) return;
    Alert.alert(t('calendar.deleteTitle'), t('calendar.deleteConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch(`/api/calendar/${selectedEvent.id}`, {method: 'DELETE'});
            // Best-effort — don't block the in-app delete on this, and
            // don't surface a failure here either; see deleteAppleEvent's
            // own doc for why this is intentionally silent.
            deleteAppleEvent(selectedEvent.apple_event_id);
            setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
            closeDetail();
          } catch (err) {
            console.error('Error deleting event:', err);
          }
        },
      },
    ]);
  };

  const handleSyncApple = async () => {
    if (!selectedEvent) return;
    setSyncingApple(true);
    try {
      const appleId = await syncEventToApple({
        id: selectedEvent.id,
        title: selectedEvent.title,
        description: selectedEvent.description,
        location: selectedEvent.location,
        start_date: selectedEvent.start_date,
        end_date: selectedEvent.end_date,
        apple_event_id: selectedEvent.apple_event_id,
      });
      if (appleId) {
        setEvents(prev => prev.map(e => (e.id === selectedEvent.id ? {...e, apple_event_id: appleId} : e)));
        setSelectedEvent(prev => (prev ? {...prev, apple_event_id: appleId} : prev));
      } else {
        Alert.alert(t('common.error'), t('coach.syncAppleError'));
      }
    } finally {
      setSyncingApple(false);
    }
  };

  const renderDay = ({item}: {item: DayGroup}) => {
    const today = isToday(item.date);
    // Only meaningful when it's not also today — today's own highlight
    // (the black outline + play button) takes precedence over the dashed
    // "this is the day selected in the strip" outline.
    const selected = !today && item.date === selectedDate;
    const dayDate = new Date(`${item.date}T00:00:00`);

    return (
      <View style={styles.dayRow}>
        <View style={styles.dayLeftCol}>
          <Text style={[styles.dayNumber, today && styles.dayNumberToday]}>{dayDate.getDate()}</Text>
          <Text style={[styles.dayLabel, today && styles.dayLabelToday]}>
            {today ? t('calendar.today') : dayDate.toLocaleDateString(locale, {weekday: 'short'})}
          </Text>
        </View>
        <View style={styles.dayCards}>
          {item.activities.map(act => (
            // Synced rides are always past/completed — never "today
            // scheduled" or selectable, so they only ever get the muted +
            // checkmark treatment regardless of which day is highlighted.
            <TouchableOpacity
              key={`act-${act.id}`}
              style={[styles.row, styles.rowMuted]}
              activeOpacity={0.7}
              onPress={() => openActivity(act)}>
              <View style={[styles.accentDot, styles.accentDotMuted]} />
              <View style={styles.rowContent}>
                <Text style={styles.rowTitleMuted} numberOfLines={1}>
                  {act.name}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {formatKm(act.distance)} {t('common.km')} · {formatDuration(act.moving_time)}
                </Text>
              </View>
              <Text style={styles.checkIcon}>✓</Text>
            </TouchableOpacity>
          ))}
          {item.events.map(ev => {
            const isTodayAction = today && !ev.completed;
            return (
              <TouchableOpacity
                key={`ev-${ev.id}`}
                style={[
                  styles.row,
                  ev.completed && styles.rowMuted,
                  isTodayAction && styles.rowToday,
                  selected && !ev.completed && styles.rowSelected,
                ]}
                activeOpacity={0.7}
                onPress={() => openEventDetail(ev)}>
                <View
                  style={[
                    styles.accentDot,
                    ev.completed
                      ? styles.accentDotMuted
                      : {backgroundColor: EVENT_COLORS[ev.type] || EVENT_COLORS.planned_ride},
                  ]}
                />
                <View style={styles.rowContent}>
                  <Text style={ev.completed ? styles.rowTitleMuted : styles.rowTitle} numberOfLines={1}>
                    {ev.title}
                  </Text>
                  {!!ev.location && (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {ev.location}
                    </Text>
                  )}
                </View>
                {ev.completed ? (
                  <Text style={styles.checkIcon}>✓</Text>
                ) : isTodayAction ? (
                  <View style={styles.playBtn}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                ) : (
                  <Text style={styles.chevron}>›</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 12}]}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday} style={styles.monthLabelWrap}>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Text style={styles.todayLink}>{t('calendar.today')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNextMonth} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekStrip}>
        {weekStripDays.map(d => {
          const dateStr = fmtDate(d);
          const isSelected = dateStr === selectedDate;
          const hasContent = datesWithContent.has(dateStr);
          return (
            <TouchableOpacity
              key={dateStr}
              style={styles.weekDayCol}
              onPress={() => selectDay(dateStr)}
              activeOpacity={0.7}>
              <Text style={styles.weekDayLabel}>{d.toLocaleDateString(locale, {weekday: 'short'})}</Text>
              <View style={[styles.weekDayCircle, isSelected && styles.weekDayCircleSelected]}>
                <Text style={[styles.weekDayNumber, isSelected && styles.weekDayNumberSelected]}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={[styles.weekDayDot, hasContent && styles.weekDayDotVisible]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && days.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#274dd3" />
        </View>
      ) : days.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>{t('calendar.empty')}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={days}
          keyExtractor={item => item.date}
          renderItem={renderDay}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={[
            styles.listContent,
            {paddingBottom: DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 90},
          ]}
        />
      )}

      <TouchableOpacity
        style={[styles.planFab, {bottom: DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 16}]}
        onPress={openPlanWithCoach}
        activeOpacity={0.85}>
        <Text style={styles.planFabText}>{t('calendar.planWithCoach')}</Text>
      </TouchableOpacity>

      {/* Event detail bottom sheet */}
      <Modal visible={!!selectedEvent} transparent animationType="fade" onRequestClose={closeDetail}>
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <Animated.View style={[styles.modalContent, {transform: [{translateY: slideAnim}]}]}>
              <View style={styles.dragHandle} />
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                {selectedEvent && !editing && (
                  <>
                    {/* 1. Type badge, close button top-right */}
                    <View style={styles.modalHeader}>
                      <View style={styles.eyebrowRow}>
                        <View
                          style={[
                            styles.eyebrowDot,
                            {backgroundColor: EVENT_COLORS[selectedEvent.type] || EVENT_COLORS.planned_ride},
                          ]}
                        />
                        <Text style={styles.eyebrowText}>{t(`calendar.types.${selectedEvent.type}`)}</Text>
                      </View>
                      <TouchableOpacity style={styles.closeBtn} onPress={closeDetail}>
                        <Text style={styles.closeBtnText}>×</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 2. Heading */}
                    <Text style={styles.detailTitle}>{selectedEvent.title}</Text>
                    {!!selectedEvent.location && <Text style={styles.detailMeta}>{selectedEvent.location}</Text>}

                    {/* 3. Goal badge */}
                    {!!selectedEvent.goal_id && !!selectedEvent.goal_title && (
                      <TouchableOpacity
                        style={styles.goalBadge}
                        onPress={() => openGoal(selectedEvent.goal_id!)}
                        activeOpacity={0.7}>
                        <Text style={styles.goalBadgeText} numberOfLines={1}>
                          {t('coach.supportsGoal', {goal: selectedEvent.goal_title})}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* 4. Description */}
                    {!!selectedEvent.description && (
                      <Text style={styles.detailDescription}>{selectedEvent.description}</Text>
                    )}

                    {/* 5. Date + Apple sync status, merged into one line */}
                    <View style={styles.dateSyncRow}>
                      <Text style={styles.detailDate}>{formatDayHeader(selectedEvent.start_date, locale)}</Text>
                      {Platform.OS === 'ios' &&
                        (selectedEvent.apple_event_id ? (
                          <View style={styles.appleSyncedInline}>
                            <Text style={styles.dateSyncDot}>·</Text>
                            <Text style={styles.appleSyncedCheck}>✓</Text>
                            <Text style={styles.appleSyncedText}>{t('coach.syncAppleSuccess')}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.appleSyncedInline}
                            onPress={handleSyncApple}
                            disabled={syncingApple}>
                            <Text style={styles.dateSyncDot}>·</Text>
                            <Text style={styles.linkBtnText}>
                              {syncingApple ? t('common.loading') : t('coach.syncAppleButton')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>

                    {(() => {
                      const durationLabel = formatEventDuration(selectedEvent.start_time, selectedEvent.end_time);
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
                            <Text style={styles.metaChipText}>{t(`calendar.types.${selectedEvent.type}`)}</Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* 6. Button group */}
                    <View style={styles.bottomRow}>
                      <TouchableOpacity style={styles.iconCircleBtn} onPress={startEdit}>
                        <EditIcon size={18} color="#333" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconCircleBtn} onPress={deleteEvent}>
                        <TrashIcon size={18} color="#333" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.askAgentBtn}
                        onPress={() => askAgent(selectedEvent)}
                        activeOpacity={0.85}>
                        <SparkleIcon size={18} color="#fff" />
                        <Text style={styles.askAgentBtnText}>{t('calendar.askAgent')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {selectedEvent && editing && (
                  <>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>{t('calendar.eventDetails')}</Text>
                      <TouchableOpacity onPress={() => setEditing(false)}>
                        <Text style={styles.modalClose}>×</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.typeRow}>
                      {EVENT_TYPES.map(type => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.typeChip,
                            editType === type && {
                              backgroundColor: EVENT_COLORS[type],
                              borderColor: EVENT_COLORS[type],
                            },
                          ]}
                          onPress={() => setEditType(type)}>
                          <View style={[styles.typeChipDot, {backgroundColor: EVENT_COLORS[type]}]} />
                          <Text style={[styles.typeChipText, editType === type && styles.typeChipTextActive]}>
                            {t(`calendar.types.${type}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>{t('calendar.titleLabel')}</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder={t('calendar.titlePlaceholder')}
                        placeholderTextColor="#aaa"
                        value={editTitle}
                        onChangeText={setEditTitle}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>{t('calendar.dateLabel')}</Text>
                      <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                        <Text style={styles.datePickerText}>
                          {editDate.toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'})}
                        </Text>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <DateTimePicker
                          value={editDate}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          onChange={(_e: any, date?: Date) => {
                            if (Platform.OS === 'android') setShowDatePicker(false);
                            if (date) setEditDate(date);
                          }}
                          themeVariant="light"
                        />
                      )}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>{t('calendar.locationLabel')}</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder={t('calendar.locationPlaceholder')}
                        placeholderTextColor="#aaa"
                        value={editLocation}
                        onChangeText={setEditLocation}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>{t('calendar.descriptionLabel')}</Text>
                      <TextInput
                        style={[styles.formInput, styles.formTextarea]}
                        placeholder={t('calendar.descriptionPlaceholder')}
                        placeholderTextColor="#aaa"
                        multiline
                        numberOfLines={3}
                        value={editDescription}
                        onChangeText={setEditDescription}
                      />
                    </View>

                    <View style={styles.modalButtons}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving}>
                        <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.submitBtn} onPress={saveEdit} disabled={saving}>
                        <Text style={styles.submitBtnText}>{saving ? t('calendar.saving') : t('calendar.save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  navArrow: {
    fontSize: 26,
    color: '#1a1a1a',
    fontWeight: '400',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  monthLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  monthLabel: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a1a',
    textTransform: 'capitalize',
  },
  todayLink: {
    fontSize: 13,
    color: '#274dd3',
    fontWeight: '600',
    marginTop: 2,
  },
  // Mon..Sun preview strip under the month header — a separate fixed row,
  // not part of the scrolling list below it.
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  weekDayCol: {
    alignItems: 'center',
    width: 40,
  },
  weekDayLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'capitalize',
    marginBottom: 6,
  },
  weekDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayCircleSelected: {
    backgroundColor: '#111',
  },
  weekDayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  weekDayNumberSelected: {
    color: '#fff',
  },
  // Always rendered (transparent when the day has nothing) so days with
  // and without a dot line up at the same height.
  weekDayDot: {
    width: 6,
    height: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginTop: 6,
  },
  weekDayDotVisible: {
    backgroundColor: '#274dd3',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
    paddingBottom: 100,
  },
  // Each day is its own row: a fixed-width date column on the left, and
  // its activity/event cards stacked on the right — replaces the old
  // "date as a header line above the cards" layout.
  dayRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 12,
  },
  dayLeftCol: {
    width: 44,
    alignItems: 'center',
    paddingTop: 5,
  },
  dayNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#c7c7c7',
  },
  dayNumberToday: {
    color: '#000000',
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#c7c7c7',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  dayLabelToday: {
    color: '#000000',
  },
  dayCards: {
    flex: 1,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // Past/completed items — same treatment for synced activities and
  // completed calendar events, so both read as "done" the same way.
  rowMuted: {
    backgroundColor: '#f5f5f5',
  },
  // Today's not-yet-done session — the one actionable card, so it gets a
  // solid outline instead of the dashed "just highlighted" one below.
  rowToday: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#ffffff',
  },
  // Whichever day is tapped in the week strip (when it isn't also today).
  rowSelected: {
    borderWidth: 1.5,
    borderColor: '#274dd3',
    borderStyle: 'dashed',
  },
  accentDot: {
    width: 5,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  accentDotMuted: {
    backgroundColor: '#ccc',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  rowTitleMuted: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  chevron: {
    fontSize: 22,
    color: '#c7c7c7',
    fontWeight: '300',
  },
  checkIcon: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 12,
  },
  planFab: {
    position: 'absolute',
    bottom: 20,
    marginBottom: -24,
    alignSelf: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  planFabText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e0e0e0',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  // Small "PLANNED WORKOUT"-style label replacing the old filled type pill.
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
  },
  eyebrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  detailTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  detailDate: {
    fontSize: 15,
    color: '#888',
    textTransform: 'capitalize',
  },
  detailMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  detailDescription: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    display: 'none',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  metaChipIcon: {
    fontSize: 13,
    color: '#666',
  },
  metaChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  goalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(39, 77, 211, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 20,
  },
  goalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#274dd3',
  },
  // Bottom action row: small circular edit/delete buttons + the black
  // "Ask Coach" pill (which takes the remaining width).
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
  iconCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  askAgentBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 27,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  askAgentBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  linkBtn: {
    marginBottom: 16,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#274dd3',
  },
  dateSyncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  appleSyncedInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateSyncDot: {
    fontSize: 13,
    color: '#888',
    marginHorizontal: 6,
  },
  appleSyncedCheck: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  appleSyncedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  typeChipTextActive: {
    color: '#fff',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  datePickerBtn: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  submitBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#274dd3',
    borderRadius: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
