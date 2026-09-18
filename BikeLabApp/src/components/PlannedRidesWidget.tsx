import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ActivityIndicator, TouchableOpacity, ScrollView} from 'react-native';
import {useCalendar} from '../data/hooks/useCalendar';
import {getDateLocale} from '../i18n/dateLocale';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles} from '../theme';
import type {CalendarEvent} from '@bikelab/shared/types';

const CARD_WIDTH = 150;
const CARD_GAP = 12;

// Read-only "upcoming rides" summary — planning now happens through the
// coach or the Calendar tab (see CALENDAR_SPEC.md §2.7, Option A). This
// widget just surfaces the next few planned_ride calendar_events on the
// Garage screen for quick visibility; tapping the title jumps to the
// full Calendar tab.
//
// T-5.4/A-27: used to own its own useState/useEffect + apiFetch for
// GET /api/calendar?type=planned_ride — now backed by the shared
// useCalendar({type}) query hook (same endpoint, same shape) instead of a
// component-private fetch.
export const PlannedRidesWidget: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();
  const {data, isLoading} = useCalendar({type: 'planned_ride'});

  const rides = [...(data ?? [])].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );

  const formatRideDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(getDateLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const getDaysUntil = (dateStr: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const goToCalendar = () => navigation.navigate('CalendarTab', {screen: 'Calendar'});

  if (isLoading) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
        <ActivityIndicator size="small" color="#274dd3" style={{marginTop: 16}} />
      </View>
    );
  }

  const renderRideCard = (ride: CalendarEvent) => {
    const daysUntil = getDaysUntil(ride.start_date);
    const isPast = daysUntil < 0;
    return (
      // A per-card TouchableOpacity is fine here (unlike wrapping the whole
      // ScrollView) — nested touchables inside a ScrollView don't fight its
      // pan gesture, only a touchable wrapping the ScrollView itself did.
      <TouchableOpacity
        key={ride.id}
        style={[s.rideCard, isPast && s.rideCardPast]}
        activeOpacity={0.7}
        onPress={goToCalendar}>
        <View style={s.cardTopRow}>
          <View style={s.dateChip}>
            <Text style={[s.dateChipText, isPast && s.dateChipTextPast]}>{formatRideDate(ride.start_date)}</Text>
          </View>
        </View>
        <View style={s.rideDetailsContainer}>
          <Text style={[s.rideTitle, isPast && s.rideTitlePast]} numberOfLines={2}>
            {ride.title}
          </Text>
          <Text style={[s.daysUntil, !isPast && daysUntil <= 3 && s.daysUntilSoon, isPast && s.daysUntilPast]}>
            {isPast
              ? t('plannedRides.passed')
              : daysUntil === 0
                ? t('plannedRides.today')
                : daysUntil === 1
                  ? t('plannedRides.tomorrow')
                  : `${daysUntil}d`}
          </Text>
          {!!ride.location && (
            <Text style={s.rideLocation} numberOfLines={1}>
              {ride.location}
            </Text>
          )}
          {ride.description ? (
            <Text style={s.rideDetails} numberOfLines={3}>
              {ride.description}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    // Plain View, NOT a TouchableOpacity — wrapping the whole section
    // (including the horizontal ScrollView below) in one tap target used
    // to swallow the scroll gesture: dragging a card horizontally still
    // ended up registering as a tap on release, so it always navigated to
    // Calendar instead of scrolling. Only the header title is tappable now.
    <View style={s.section}>
      <TouchableOpacity style={s.headerRow} activeOpacity={0.7} onPress={goToCalendar}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
      </TouchableOpacity>

      {rides.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>{t('plannedRides.empty')}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_GAP}
          contentContainerStyle={s.cardsRow}>
          {rides.map(renderRideCard)}
        </ScrollView>
      )}
    </View>
  );
};

const s = makeStyles(theme => ({
  section: {
    padding: theme.spacing[16],
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[8],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[16],
  },
  sectionTitle: {
    fontSize: 55,
    fontWeight: theme.typography.fontWeight.black,
    opacity: 0.15,
    textTransform: 'uppercase',
    color: theme.colors.text.primary,
  },
  emptyState: {
    paddingVertical: theme.spacing[24],
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: theme.typography.fontSize.lg,
  },
  // Single horizontal row of fixed-width, vertically-stacked cards, instead
  // of one long list running the full length of the Garage screen.
  cardsRow: {
    gap: CARD_GAP,
    paddingRight: theme.spacing[4],
  },
  rideCard: {
    width: CARD_WIDTH,
    padding: theme.spacing[12],
    backgroundColor: '#f1f0f0',
    borderRadius: theme.radii.sm,
    height: 180,
    justifyContent: 'flex-end',
  },
  rideCardPast: {
    opacity: 0.45,
    display: 'none',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[12],
  },
  dateChip: {
    backgroundColor: theme.colors.text.primary,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radii.pill,
  },
  dateChipText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
  },
  dateChipTextPast: {
    color: '#999',
  },
  daysUntil: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.muted,
    marginBottom: theme.spacing[12],
    marginTop: theme.spacing[4],
  },
  daysUntilSoon: {
    color: theme.colors.accent,
    fontWeight: '800', // not in the typography scale yet — kept literal
  },
  daysUntilPast: {
    color: '#aaa',
    fontWeight: '500', // not in the typography scale yet — kept literal
  },
  rideTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  rideTitlePast: {
    color: '#999',
  },
  rideLocation: {
    fontSize: theme.typography.fontSize.base,
    color: '#666',
  },
  rideDetails: {
    fontSize: theme.typography.fontSize.md,
    color: '#999',
    marginTop: theme.spacing[4],
  },
  rideDetailsContainer: {
    flex: 1,
  },
}));
