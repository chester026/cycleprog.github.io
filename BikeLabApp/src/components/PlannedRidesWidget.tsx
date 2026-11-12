import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ActivityIndicator, TouchableOpacity, ScrollView} from 'react-native';
import {useCalendar} from '../data/hooks/useCalendar';
import {getDateLocale} from '../i18n/dateLocale';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';
import type {CalendarEvent} from '@bikelab/shared/types';
import {GARAGE_CARD_WIDTH, GARAGE_CARD_GAP} from '../constants/garageCards';
import {WorkoutProfile} from '../screens/Calendar/WorkoutProfile';

const CARD_WIDTH = GARAGE_CARD_WIDTH;
const CARD_GAP = GARAGE_CARD_GAP;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
/** Height of the block profile on a ride card, pt — the calendar row's. */
const PROFILE_HEIGHT = 44;

const formatRideDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString(getDateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** Whole days from today to `dateStr`, midnight to midnight — negative once the ride is past. */
const daysUntil = (dateStr: string) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
};

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
  const theme = useTheme();
  const {data, isLoading} = useCalendar({type: 'planned_ride'});

  // Past rides are dropped here, not hidden in the card style: a row of
  // invisible cards left the big "RIDES" title hanging over nothing instead
  // of showing the empty state (owner feedback, 19.09).
  const rides = (data ?? [])
    .filter(ride => daysUntil(ride.start_date) >= 0)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const goToCalendar = () => navigation.navigate('CalendarTab', {screen: 'Calendar'});

  if (isLoading) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
        <ActivityIndicator size="small" color={theme.colors.accent} style={s.loader} />
      </View>
    );
  }

  const renderRideCard = (ride: CalendarEvent) => {
    const days = daysUntil(ride.start_date);
    return (
      // A per-card TouchableOpacity is fine here (unlike wrapping the whole
      // ScrollView) — nested touchables inside a ScrollView don't fight its
      // pan gesture, only a touchable wrapping the ScrollView itself did.
      <TouchableOpacity key={ride.id} style={s.rideCard} activeOpacity={0.7} onPress={goToCalendar}>
        <View style={s.cardTopRow}>
          <View style={s.dateChip}>
            <Text style={s.dateChipText}>{formatRideDate(ride.start_date)}</Text>
          </View>
        </View>
        <View style={s.rideDetailsContainer}>
        <Text style={s.daysUntil}>
            {days === 0
              ? t('plannedRides.today')
              : days === 1
                ? t('plannedRides.tomorrow')
                : `${days}d`}
          </Text>
          <Text style={s.rideTitle} numberOfLines={2}>
            {ride.title}
          </Text>
         
          {!!ride.location && (
            <Text style={s.rideLocation} numberOfLines={1}>
              {ride.location}
            </Text>
          )}
          {/* A session with blocks shows its shape instead of the brief
              (owner, 11.11.2026); one without keeps the text. */}
          {ride.workout?.steps?.length ? (
            <View style={s.rideProfile}>
              <WorkoutProfile steps={ride.workout.steps} height={PROFILE_HEIGHT} testID={`ride-profile-${ride.id}`} />
            </View>
          ) : ride.description ? (
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
        <TouchableOpacity
          testID="planned-rides-empty"
          style={s.emptyState}
          activeOpacity={0.6}
          onPress={goToCalendar}>
          <Text style={s.emptyText}>{t('plannedRides.empty')}</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_GAP}
          style={s.cardsScroll}
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
  loader: {
    marginTop: theme.spacing[16],
  },
  // Bare muted line, no card: an empty section shouldn't draw a slot for
  // something that isn't there (owner feedback, 19.09).
  emptyState: {
    paddingBottom: theme.spacing[8],
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.muted,
  },
  // Single horizontal row of fixed-width, vertically-stacked cards, instead
  // of one long list running the full length of the Garage screen.
  // The row bleeds to the screen's edges (the section's own padding is
  // undone here and given back as content padding), so the cards run off
  // the right edge like every other strip on the screen instead of being
  // cut a gutter short of it.
  cardsScroll: {
    marginHorizontal: -theme.spacing[16],
  },
  cardsRow: {
    gap: CARD_GAP,
    paddingHorizontal: theme.spacing[16],
  },
  rideCard: {
    width: CARD_WIDTH,
    padding: theme.spacing[12],
    backgroundColor: theme.colors.speedWidget.cardBg,
    borderRadius: theme.radii.lg,
   
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[24],
  },
  // Quiet chip: grey on the card with dark text — the black pill pulled all
  // the attention off the session itself (owner, 12.11.2026).
  dateChip: {
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.radii.pill,
  },
  dateChipText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  daysUntil: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.muted,
    marginBottom: theme.spacing[4],
    marginTop: theme.spacing[4],
  },
  rideTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '800', // not in the typography scale yet — kept literal
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  rideLocation: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  rideDetails: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text.faint,
    marginTop: theme.spacing[4],
  },
  // Pinned to the card's bottom edge: cards in the row share one height
  // (the tallest title's), and a profile hanging under a one-line title
  // looked adrift next to one sitting on the bottom.
  rideProfile: {
    marginTop: 'auto',
    paddingTop: theme.spacing[12],
  },
  rideDetailsContainer: {
    flex: 1,
  },
}));
