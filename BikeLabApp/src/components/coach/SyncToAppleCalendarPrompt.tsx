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

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, state === 'error' && styles.buttonError]}
        onPress={handleSync}
        disabled={state === 'syncing'}
        activeOpacity={0.85}>
        {state === 'syncing' ? (
          <ActivityIndicator size="small" color="#274dd3" />
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
    marginTop: 4,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  button: {
    borderWidth: 1,
    borderColor: '#274dd3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: 'rgba(39, 77, 211, 0.06)',
  },
  buttonError: {
    borderColor: '#DC2626',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#274dd3',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
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
