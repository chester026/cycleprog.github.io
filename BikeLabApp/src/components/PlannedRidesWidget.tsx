import React, {useState, useEffect, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {apiFetch} from '../utils/api';
import {getDateLocale} from '../i18n/dateLocale';

const CARD_WIDTH = 150;
const CARD_GAP = 12;

interface Ride {
  id: number;
  title: string;
  location?: string;
  description?: string;
  start_date: string;
}

// Read-only "upcoming rides" summary — planning now happens through the
// coach or the Calendar tab (see CALENDAR_SPEC.md §2.7, Option A). This
// widget just surfaces the next few planned_ride calendar_events on the
// Garage screen for quick visibility; tapping the title jumps to the
// full Calendar tab.
export const PlannedRidesWidget: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRides = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/calendar?type=planned_ride');
      const sorted = (data || []).sort(
        (a: Ride, b: Ride) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );
      setRides(sorted);
    } catch (err) {
      console.error('Error loading rides:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

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

  if (loading) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
        <ActivityIndicator size="small" color="#274dd3" style={{marginTop: 16}} />
      </View>
    );
  }

  const renderRideCard = (ride: Ride) => {
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
          <Text style={[s.daysUntil, !isPast && daysUntil <= 3 && s.daysUntilSoon, isPast && s.daysUntilPast]}>
            {isPast
              ? t('plannedRides.passed')
              : daysUntil === 0
                ? t('plannedRides.today')
                : daysUntil === 1
                  ? t('plannedRides.tomorrow')
                  : `${daysUntil}d`}
          </Text>
        </View>
        <Text style={[s.rideTitle, isPast && s.rideTitlePast]} numberOfLines={2}>
          {ride.title}
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

const s = StyleSheet.create({
  section: {
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  // Single horizontal row of fixed-width, vertically-stacked cards, instead
  // of one long list running the full length of the Garage screen.
  cardsRow: {
    gap: CARD_GAP,
    paddingRight: 4,
  },
  rideCard: {
    width: CARD_WIDTH,
    padding: 12,
    backgroundColor: '#f1f0f0',
  },
  rideCardPast: {
    opacity: 0.45,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateChip: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  dateChipTextPast: {
    color: '#999',
  },
  daysUntil: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
  },
  daysUntilSoon: {
    color: '#274dd3',
    fontWeight: '800',
  },
  daysUntilPast: {
    color: '#aaa',
    fontWeight: '500',
  },
  rideTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  rideTitlePast: {
    color: '#999',
  },
  rideLocation: {
    fontSize: 13,
    color: '#666',
  },
  rideDetails: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
