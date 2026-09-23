import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert, Animated, FlatList, Text, TouchableOpacity, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {CalendarEvent} from '@bikelab/shared/types';
import {makeStyles} from '../theme';
import {getDateLocale} from '../i18n/dateLocale';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';
import {syncEventToApple, deleteAppleEvent} from '../utils/calendarSync';
import type {Activity} from '../types/activity';
import {logger} from '../lib/logger';
import {useAppNavigation} from '../navigation/hooks';
import {useCalendar, useCalendarMutations, useActivities} from '../data/hooks';
import {queryClient} from '../data/queryClient';
import {MonthHeader} from './Calendar/MonthHeader';
import {WeekStrip} from './Calendar/WeekStrip';
import {DayList} from './Calendar/DayList';
import {EventDetailSheet} from './Calendar/EventDetailSheet';
import type {EventFormValues} from './Calendar/EventForm';
import {
  addMonths,
  datesWithContentFrom,
  endOfMonth,
  fmtDate,
  formatDayHeader,
  groupByDay,
  startOfMonth,
  weekStripDaysFor,
  ASK_PROMPT_KEYS,
  type DayGroup,
} from './Calendar/lib';

const DEFAULT_FORM_VALUES: EventFormValues = {
  title: '',
  description: '',
  location: '',
  type: 'planned_ride',
  date: new Date(),
};

export const CalendarScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();
  const insets = useSafeAreaInsets();
  const locale = getDateLocale();
  const listRef = useRef<FlatList<DayGroup>>(null);

  const [viewMonth, setViewMonth] = useState(new Date());
  // Drives the week strip: which Mon..Sun row it shows, and which day in
  // it is highlighted. Defaults to today; month nav below resets it to the
  // 1st of the newly-viewed month so the strip always shows a week that
  // actually belongs to the visible month.
  const [selectedDate, setSelectedDate] = useState(fmtDate(new Date()));

  const [selectedEventId, setSelectedEventId] = useState<number | string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<EventFormValues>(DEFAULT_FORM_VALUES);
  const [syncingApple, setSyncingApple] = useState(false);
  const slideAnim = useState(new Animated.Value(400))[0];

  // Scoped to exactly the month being viewed — a wider prefetch buffer used
  // to leak neighboring months' activities/events into whichever month the
  // user navigated to (Apr/May/Jun all showing up together under "May"),
  // which read as a bug rather than smooth scrolling.
  const range = useMemo(
    () => ({from: fmtDate(startOfMonth(viewMonth)), to: fmtDate(endOfMonth(viewMonth))}),
    [viewMonth],
  );
  const {data: events = [], isLoading: eventsLoading, refetch: refetchEvents} = useCalendar(range);
  const {data: activities = [], refetch: refetchActivities} = useActivities();
  const {update: updateEvent, remove: removeEvent} = useCalendarMutations();

  // Bottom-tab screens stay mounted when you switch away — refetch every
  // time this screen regains focus (and still on month nav while focused,
  // since `range` is a direct dependency of useCalendar) so a coach-created
  // event on another tab isn't missed.
  useFocusEffect(
    useCallback(() => {
      refetchEvents();
      refetchActivities();
    }, [refetchEvents, refetchActivities]),
  );

  const days: DayGroup[] = useMemo(
    () => groupByDay(activities, events, startOfMonth(viewMonth), endOfMonth(viewMonth)),
    [activities, events, viewMonth],
  );

  const selectedEvent: CalendarEvent | null = useMemo(
    () => events.find(e => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const monthLabel = viewMonth.toLocaleDateString(locale, {month: 'long', year: 'numeric'});
  const weekStripDays = useMemo(() => weekStripDaysFor(selectedDate), [selectedDate]);
  const datesWithContent = useMemo(() => datesWithContentFrom(days), [days]);

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
      // requestId (A-22): a fresh value per navigation so CoachChatScreen
      // fires this initialPrompt exactly once even if it's already mounted
      // (re-tapping this button from a sibling tab re-navigates into the
      // same screen instance rather than remounting it).
      params: {initialPrompt: t('calendar.planWithCoachPrompt'), requestId: Date.now()},
    });
  };

  const openGoal = (goalId: number | string) => {
    setSelectedEventId(null);
    navigation.navigate('GoalsTab', {screen: 'GoalDetails', params: {goalId}});
  };

  // "Ask Agent" starts a fresh, type-specific question about this event
  // instead of replaying the (possibly long, possibly nonexistent for
  // user-created events) original planning conversation — works for every
  // event regardless of source. calendarEventId rides along as hidden
  // context (see CoachChatScreen) so the model can act on this exact row.
  const askAgent = (ev: CalendarEvent) => {
    setSelectedEventId(null);
    const promptKey = ASK_PROMPT_KEYS[ev.type] || ASK_PROMPT_KEYS.planned_ride;
    const prompt = t(promptKey, {title: ev.title, date: formatDayHeader(ev.start_date, locale)});
    navigation.navigate('GoalsTab', {
      screen: 'CoachChat',
      params: {initialPrompt: prompt, calendarEventId: Number(ev.id), requestId: Date.now()},
    });
  };

  const openActivity = (act: Activity) => {
    navigation.navigate('RideAnalytics', {activity: act});
  };

  const openEventDetail = (ev: CalendarEvent) => {
    setSelectedEventId(ev.id);
    setEditing(false);
    Animated.spring(slideAnim, {toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200}).start();
  };

  const closeDetail = () => {
    Animated.timing(slideAnim, {toValue: 400, duration: 200, useNativeDriver: true}).start(() => {
      setSelectedEventId(null);
      setEditing(false);
    });
  };

  const startEdit = () => {
    if (!selectedEvent) return;
    setFormValues({
      title: selectedEvent.title,
      description: selectedEvent.description || '',
      location: selectedEvent.location || '',
      type: selectedEvent.type,
      date: new Date(`${selectedEvent.start_date}T00:00:00`),
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selectedEvent || !formValues.title.trim()) return;
    try {
      await updateEvent.mutateAsync({
        id: selectedEvent.id,
        body: {
          title: formValues.title,
          description: formValues.description,
          location: formValues.location,
          type: formValues.type,
          start_date: fmtDate(formValues.date),
        },
      });
      setEditing(false);
    } catch {
      Alert.alert(t('common.error'), t('calendar.saving'));
    }
  };

  const deleteEvent = () => {
    if (!selectedEvent) return;
    const appleEventId = selectedEvent.apple_event_id;
    Alert.alert(t('calendar.deleteTitle'), t('calendar.deleteConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEvent.mutateAsync(selectedEvent.id);
            // Best-effort — don't block the in-app delete on this, and
            // don't surface a failure here either; see deleteAppleEvent's
            // own doc for why this is intentionally silent.
            deleteAppleEvent(appleEventId);
            closeDetail();
          } catch (err) {
            logger.error('Error deleting event:', err);
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
        id: Number(selectedEvent.id),
        title: selectedEvent.title,
        description: selectedEvent.description ?? undefined,
        location: selectedEvent.location ?? undefined,
        start_date: selectedEvent.start_date,
        end_date: selectedEvent.end_date ?? undefined,
        apple_event_id: selectedEvent.apple_event_id,
      });
      if (appleId) {
        // syncEventToApple already persisted apple_event_id server-side —
        // patch every cached calendar range in place instead of waiting on
        // a refetch, so the sheet's "Synced" state flips immediately (same
        // as the pre-refactor screen's local setEvents/setSelectedEvent).
        queryClient.setQueriesData<CalendarEvent[]>({queryKey: ['calendar']}, old =>
          old?.map(e => (e.id === selectedEvent.id ? {...e, apple_event_id: appleId} : e)),
        );
      } else {
        Alert.alert(t('common.error'), t('coach.syncAppleError'));
      }
    } finally {
      setSyncingApple(false);
    }
  };

  return (
    <View style={styles.container}>
      <MonthHeader monthLabel={monthLabel} topInset={insets.top} onPrevMonth={goPrevMonth} onNextMonth={goNextMonth} onToday={goToday} />

      <WeekStrip
        days={weekStripDays}
        selectedDate={selectedDate}
        datesWithContent={datesWithContent}
        locale={locale}
        onSelectDay={selectDay}
      />

      <DayList
        ref={listRef}
        days={days}
        loading={eventsLoading}
        selectedDate={selectedDate}
        bottomPadding={DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 90}
        onSelectActivity={openActivity}
        onSelectEvent={openEventDetail}
      />

      <TouchableOpacity
        style={[styles.planFab, {bottom: DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 16}]}
        onPress={openPlanWithCoach}
        activeOpacity={0.85}>
        <Text style={styles.planFabText}>{t('calendar.planWithCoach')}</Text>
      </TouchableOpacity>

      <EventDetailSheet
        event={selectedEvent}
        editing={editing}
        slideAnim={slideAnim}
        locale={locale}
        formValues={formValues}
        saving={updateEvent.isPending}
        syncingApple={syncingApple}
        onClose={closeDetail}
        onStartEdit={startEdit}
        onCancelEdit={() => setEditing(false)}
        onFormChange={setFormValues}
        onSave={saveEdit}
        onDelete={deleteEvent}
        onAskAgent={askAgent}
        onOpenGoal={openGoal}
        onSyncApple={handleSyncApple}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
  },
  planFab: {
    position: 'absolute',
    bottom: 20,
    marginBottom: -24,
    alignSelf: 'center',
    backgroundColor: theme.colors.black,
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[14],
    borderRadius: 24,
    shadowColor: theme.colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  planFabText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
}));
