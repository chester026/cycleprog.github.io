import React, {useState} from 'react';
import {ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {syncEventToApple, SyncableEvent} from '../../utils/calendarSync';
import {CreatedCalendarEvent} from './CalendarEventCreatedCard';

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

// Rendered once below all the CalendarEventCreatedCards in a message (see
// ChatMessageBubble) — one offer per "plan", not one button per event card,
// since a single training-plan turn commonly creates several events at once
// and asking N separate times would be annoying. Apple Calendar sync only
// exists on iOS (EventKit); Android has no equivalent here, so this never
// renders there.
export const SyncToAppleCalendarPrompt: React.FC<{events: CreatedCalendarEvent[]}> = ({events}) => {
  const {t} = useTranslation();
  const [state, setState] = useState<SyncState>('idle');

  if (Platform.OS !== 'ios' || events.length === 0) return null;

  const handleSync = async () => {
    setState('syncing');
    let anySucceeded = false;
    for (const event of events) {
      const syncable: SyncableEvent = {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        start_date: event.start_date,
        end_date: event.end_date,
      };
      const appleId = await syncEventToApple(syncable);
      if (appleId) anySucceeded = true;
    }
    setState(anySucceeded ? 'done' : 'error');
  };

  if (state === 'done') {
    return (
      <View style={styles.doneRow}>
        <Text style={styles.doneText}>{t('coach.syncAppleSuccess')}</Text>
      </View>
    );
  }

  const isError = state === 'error';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isError && styles.buttonError]}
        onPress={handleSync}
        disabled={state === 'syncing'}
        activeOpacity={0.85}>
        {state === 'syncing' ? (
          <ActivityIndicator size="small" color="#2F6BFF" />
        ) : (
          <Text style={styles.buttonText}>
            {events.length > 1
              ? t('coach.syncAppleButtonCount', {count: events.length})
              : t('coach.syncAppleButton')}
          </Text>
        )}
      </TouchableOpacity>
      {state === 'error' && <Text style={styles.errorText}>{t('coach.syncAppleError')}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 0,
    marginBottom: 20,
    alignItems: 'stretch',
    width: '80%',
    alignSelf: 'flex-start',
  },
  // Light-blue tinted pill — same color family as the "Goal: ..." chip on
  // CalendarEventCreatedCard/CalendarPlanCreatedCard, so the button reads as
  // tied to the blue accent on the card above it instead of a disconnected
  // solid block or a neutral white/gray outline button. Picked over a full
  // solid-blue fill (like Discuss with Coach) per feedback that solid read
  // as too heavy for a secondary "sync" action sitting right below a card.
  button: {
    flexDirection: 'row',
    backgroundColor: 'rgba(128, 132, 142, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: 'rgba(128, 132, 142, 0.15)',
  },
  buttonError: {
    backgroundColor: 'rgba(229,72,77,0.10)',
    borderColor: 'rgba(229,72,77,0.25)',
  },
  buttonText: {
    color: 'rgb(31, 35, 46)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 6,
  },
  doneRow: {
    marginTop: 4,
    marginBottom: 12,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
});
