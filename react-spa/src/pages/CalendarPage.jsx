// Calendar page — the web port of the app's CalendarScreen. Month grid or
// week agenda of calendar events with synced rides overlaid; the detail
// sheet edits/completes/deletes an event and hands it to the coach.
//
// URL contract (also the deep-link target of the coach's calendar cards):
//   /calendar?date=YYYY-MM-DD   selected day (defaults to today)
//   /calendar?goal=:id          only that goal's events (GoalDetailPage link)
//   /calendar?view=week         week agenda instead of the month grid
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fmtDate,
  groupByDay,
  monthGridRange,
  weekRange,
  weekDays,
  weekPageTarget,
  sameDayNextMonth,
} from '@bikelab/shared/calendar';
import Footer from '../components/Footer';
import RideAnalysisModal from './ride/RideAnalysisModal';
import { ErrorMessage, Loader, useConfirm, useToast } from '../ui';
import { useActivities, useCalendar, useCalendarMutations, useMetaGoals } from '../data/hooks';
import { coachPromptUrl } from './goals/coachLinks';
import CalendarHeader from './calendar/CalendarHeader';
import MonthGrid from './calendar/MonthGrid';
import DayAgenda from './calendar/DayAgenda';
import EventDetailSheet from './calendar/EventDetailSheet';
import NewEventSheet from './calendar/NewEventSheet';
import { PLAN_WITH_COACH_PROMPT, askCoachPrompt } from './calendar/copy';
import {
  parseCalendarSearch,
  calendarSearch,
  bodyFromValues,
  formatMonthLabel,
  formatWeekLabel,
  formatDayHeader,
} from './calendar/lib';
import styles from './CalendarPage.module.css';

const NO_ROWS = [];

export default function CalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = fmtDate(new Date());
  const { date, goalId, view } = parseCalendarSearch(searchParams);

  // The loaded range is exactly what's on screen (the padded month grid or
  // the Mon..Sun week) so neighbouring months never leak into the view.
  const range = useMemo(() => (view === 'week' ? weekRange(date) : monthGridRange(date)), [view, date]);
  const eventsQuery = useCalendar({ from: range.from, to: range.to, goalId: goalId ?? undefined });
  const activitiesQuery = useActivities();
  const goalsQuery = useMetaGoals();
  const { create, update, remove } = useCalendarMutations();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const [selectedEventId, setSelectedEventId] = useState(null);
  const [newEventDate, setNewEventDate] = useState(null);
  const [analyzedActivity, setAnalyzedActivity] = useState(null);

  const events = eventsQuery.data ?? NO_ROWS;
  const activities = activitiesQuery.data ?? NO_ROWS;
  const goals = goalsQuery.data ?? NO_ROWS;
  // Activities are hidden under a goal filter: the question is "what did I
  // plan for this goal", and rides aren't linked to goals in the calendar.
  const days = useMemo(
    () => groupByDay(goalId ? NO_ROWS : activities, events, range),
    [activities, events, range, goalId],
  );
  const daysByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const emptyDay = (d) => ({ date: d, activities: NO_ROWS, events: NO_ROWS });
  const agendaDays = view === 'week' ? weekDays(date).map((d) => daysByDate.get(d) ?? emptyDay(d)) : [daysByDate.get(date) ?? emptyDay(date)];

  // Resolved from the cache so the open sheet reflects a save without closing.
  const selectedEvent = events.find((e) => String(e.id) === String(selectedEventId)) ?? null;
  const goalFilter = goalId
    ? { id: goalId, title: goals.find((g) => String(g.id) === goalId)?.title, clearTo: `/calendar?${calendarSearch({ date, view })}` }
    : null;

  const setState = (next) => setSearchParams(calendarSearch({ date, goalId, view, ...next }));
  const selectDate = (next) => setState({ date: next });
  const goPrev = () => selectDate(view === 'week' ? weekPageTarget(date, -1) : sameDayNextMonth(date, -1));
  const goNext = () => selectDate(view === 'week' ? weekPageTarget(date, 1) : sameDayNextMonth(date, 1));

  const run = async (mutation, input, failureMessage) => {
    try {
      await mutation.mutateAsync(input);
      return true;
    } catch {
      toast.error(failureMessage);
      return false;
    }
  };

  const handleCreate = (values) => run(create, bodyFromValues(values), 'Failed to add the event. Please try again.');

  const handleSave = (values) =>
    run(update, { id: selectedEvent.id, body: bodyFromValues(values) }, 'Failed to save the event. Please try again.');

  const handleToggleCompleted = () =>
    run(
      update,
      { id: selectedEvent.id, body: { completed: !selectedEvent.completed } },
      'Failed to update the event. Please try again.',
    );

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete event',
      message: `Are you sure you want to delete "${selectedEvent.title}"?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (await run(remove, selectedEvent.id, 'Failed to delete the event. Please try again.')) {
      setSelectedEventId(null);
    }
  };

  // A fresh, type-specific question about this exact row; the event id rides
  // along so the coach can act on it (CoachPage reads `event`).
  const askCoach = (ev) => {
    setSelectedEventId(null);
    const prompt = askCoachPrompt(ev.type, { title: ev.title, date: formatDayHeader(ev.start_date.slice(0, 10)) });
    navigate(coachPromptUrl(prompt, { eventId: ev.id }));
  };

  const planWithCoach = () => navigate(coachPromptUrl(PLAN_WITH_COACH_PROMPT));

  const periodLabel = view === 'week' ? formatWeekLabel(range) : formatMonthLabel(date);

  let body;
  if (eventsQuery.isLoading) {
    body = (
      <div className={styles.center}>
        <Loader label="Loading calendar..." />
      </div>
    );
  } else if (eventsQuery.isError) {
    body = (
      <div className={styles.center}>
        <ErrorMessage>Couldn&apos;t load the calendar: {eventsQuery.error?.message || 'unknown error'}</ErrorMessage>
      </div>
    );
  } else if (view === 'week') {
    body = (
      <section className={styles.panel} aria-label="Week agenda">
        <DayAgenda
          days={agendaDays}
          selectedDate={date}
          today={today}
          onOpenEvent={(ev) => setSelectedEventId(ev.id)}
          onOpenActivity={setAnalyzedActivity}
          onNewEvent={setNewEventDate}
        />
      </section>
    );
  } else {
    body = (
      <div className={styles.monthLayout}>
        <section className={styles.panel} aria-label="Month grid">
          <MonthGrid
            date={date}
            today={today}
            daysByDate={daysByDate}
            onSelectDate={selectDate}
            onOpenEvent={(ev) => setSelectedEventId(ev.id)}
            onOpenActivity={setAnalyzedActivity}
          />
        </section>
        <aside className={styles.dayPanel} aria-label="Selected day">
          <h2 className={styles.dayPanelTitle}>{formatDayHeader(date)}</h2>
          <DayAgenda
            days={agendaDays}
            selectedDate={date}
            today={today}
            onOpenEvent={(ev) => setSelectedEventId(ev.id)}
            onOpenActivity={setAnalyzedActivity}
            onNewEvent={setNewEventDate}
          />
        </aside>
      </div>
    );
  }

  return (
    <div className="main-layout">
      <div className={`main ${styles.page}`}>
        <div className={styles.container}>
          <CalendarHeader
            periodLabel={periodLabel}
            view={view}
            isToday={date === today}
            goalFilter={goalFilter}
            onPrev={goPrev}
            onNext={goNext}
            onToday={() => selectDate(today)}
            onViewChange={(next) => setState({ view: next })}
            onPlanWithCoach={planWithCoach}
            onNewEvent={() => setNewEventDate(date)}
          />
          {body}
          {activitiesQuery.isError && !goalId && (
            <p className={styles.notice}>Rides couldn&apos;t be loaded, so only planned events are shown.</p>
          )}
        </div>
      </div>

      <Footer />

      {confirmDialog}
      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          goals={goals}
          saving={update.isPending}
          onClose={() => setSelectedEventId(null)}
          onSave={handleSave}
          onToggleCompleted={handleToggleCompleted}
          onDelete={handleDelete}
          onAskCoach={askCoach}
        />
      )}
      {newEventDate && (
        <NewEventSheet
          key={newEventDate}
          date={newEventDate}
          goals={goals}
          defaultGoalId={goalId}
          saving={create.isPending}
          onClose={() => setNewEventDate(null)}
          onCreate={handleCreate}
        />
      )}
      {analyzedActivity && (
        <RideAnalysisModal open onClose={() => setAnalyzedActivity(null)} activity={analyzedActivity} />
      )}
    </div>
  );
}
