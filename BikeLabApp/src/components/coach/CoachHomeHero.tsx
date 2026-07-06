import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {StyleSheet, Text, View} from 'react-native';
import {useAppData} from '../../contexts/AppDataContext';
import {Activity} from '../../types/activity';

// --- ISO-week 4-week-period math, deliberately DUPLICATED from
// AnalysisScreen.tsx rather than extracted to a shared util — that screen is
// complex and already working, and this hero only needs the same period
// boundaries to show the identical "last 4 weeks" numbers as the Analysis
// tab, condensed to 3 headline stats. If AnalysisScreen's period logic ever
// changes, this should be updated to match (or promoted to a shared util
// then).
const getISOWeekNumber = (date: Date): number => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  return 1 + Math.ceil(dayDiff / 7);
};

const getISOYear = (date: Date): number => {
  const d = new Date(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  return d.getFullYear();
};

const getDateOfISOWeek = (week: number, year: number): Date => {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = new Date(simple);
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
};

function getCurrentFourWeekActivities(activities: Activity[]): Activity[] {
  if (activities.length === 0) return [];

  const activitiesByYear: Record<number, Activity[]> = {};
  activities.forEach(activity => {
    const year = getISOYear(new Date(activity.start_date));
    if (!activitiesByYear[year]) activitiesByYear[year] = [];
    activitiesByYear[year].push(activity);
  });

  const periods: {activities: Activity[]; startDate: Date}[] = [];

  Object.keys(activitiesByYear)
    .sort()
    .forEach(yearStr => {
      const year = parseInt(yearStr, 10);
      const yearActivities = activitiesByYear[year];
      const weekNumbers = yearActivities.map(a => getISOWeekNumber(new Date(a.start_date)));
      const minWeek = Math.min(...weekNumbers);
      const maxWeek = Math.max(...weekNumbers);

      for (let cycleIndex = 0; minWeek + cycleIndex * 4 <= maxWeek; cycleIndex++) {
        const startWeekInCycle = minWeek + cycleIndex * 4;
        const cycleStartDate = getDateOfISOWeek(startWeekInCycle, year);
        const cycleEndDate = getDateOfISOWeek(startWeekInCycle + 3, year);
        cycleEndDate.setDate(cycleEndDate.getDate() + 6);

        const cycleActivities = yearActivities.filter(a => {
          const activityDate = new Date(a.start_date);
          return activityDate >= cycleStartDate && activityDate <= cycleEndDate;
        });

        if (cycleActivities.length > 0) {
          periods.push({activities: cycleActivities, startDate: cycleStartDate});
        }
      }
    });

  return periods.length > 0 ? periods[periods.length - 1].activities : [];
}

// Same "long ride" definition AnalysisScreen's hero uses (>70km or >2h).
function isLongRide(a: Activity): boolean {
  return (a.distance || 0) / 1000 > 70 || (a.moving_time || 0) / 3600 > 2;
}

const pad2 = (n: number) => String(Math.max(0, Math.round(n))).padStart(2, '0');

// Greeting + last-4-weeks headline stats for the top of the AI Coach home
// (the coach.headerTitle tab's list view) — first thing the rider sees
// above "Recent chats", per the design.
export const CoachHomeHero: React.FC = () => {
  const {t} = useTranslation();
  const {loadActivities, loadUserProfile} = useAppData();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    loadActivities()
      .then(setActivities)
      .catch(() => {});
    loadUserProfile()
      .then(p => setProfileName((p as any)?.name || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = useMemo(() => {
    const first = profileName?.trim().split(/\s+/)[0];
    return first || t('coach.greetingFallbackName');
  }, [profileName, t]);

  const periodActivities = useMemo(() => getCurrentFourWeekActivities(activities), [activities]);

  const stats = useMemo(() => {
    const totalRides = periodActivities.length;
    const totalKm = periodActivities.reduce((sum, a) => sum + (a.distance || 0) / 1000, 0);
    const longRides = periodActivities.filter(isLongRide).length;
    return {totalRides, totalKm: Math.round(totalKm), longRides};
  }, [periodActivities]);

  // Nothing synced yet — an all-zero hero reads as broken, not "no data",
  // so skip it entirely until there's something real to show (matches
  // AnalysisScreen's own empty-state judgment for the same numbers).
  if (activities.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        {t('coach.greetingBefore')}{' '}
        <Text style={styles.greetingName}> {firstName} </Text>
        {' '}{t('coach.greetingAfter')}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statNumber}>{pad2(stats.totalRides)}</Text>
          <Text style={styles.statLabel}>{t('coach.statRides')}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statNumber}>{pad2(stats.totalKm)}</Text>
          <Text style={styles.statLabel}>{t('coach.statKm')}</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statNumber}>{pad2(stats.longRides)}</Text>
          <Text style={styles.statLabel}>{t('coach.statLongRides')}</Text>
        </View>
       
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 34,
    marginBottom: 24,
    marginTop: 16,
  },
  greetingName: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: '#274dd3',
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    paddingVertical: 10,
    paddingHorizontal: 32,
    

  },
  statBlock: {
    alignItems: 'flex-start',
  },
  statNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1f1f1f',
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.4)',
    marginTop: -2,
  },
});
