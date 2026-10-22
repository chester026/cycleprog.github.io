import React from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {ToolCallStatus} from '../../types/coach';
import {getToolLabelKey} from '@bikelab/shared/coach';
import {makeStyles, useTheme, withOpacity} from '../../theme';

// Takes plain name/status rather than a single ToolCall object — a "plan my
// week" turn can fire the same tool (e.g. create_calendar_event) a dozen
// times in a row, and rendering one full-width pill per call used to flood
// the chat with a wall of identical-looking rows (see ChatMessageBubble's
// groupToolCalls). Consecutive same-name calls collapse into one pill.
// `count` is intentionally not displayed — the exact number of calendar
// writes isn't something the user needs to see, just that the step ran and
// finished; a "×5" reads as something to double-check rather than a detail
// to ignore.
export const ToolCallCard: React.FC<{name: string; status: ToolCallStatus; count?: number}> = ({name, status}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // Label keys per tool name live in shared (COACH_TOOL_LABEL_KEYS); an
  // unmapped tool gets the generic "Checking your data..." rather than a
  // raw function name.
  const labelKey = getToolLabelKey(name);
  const done = status === 'done';

  return (
    <View style={styles.card}>
      {done ? (
        <View style={styles.checkDot} />
      ) : (
        <ActivityIndicator size="small" color={theme.colors.accent} style={styles.spinner} />
      )}
      <Text style={styles.label}>{t(labelKey)}</Text>
    </View>
  );
};

const styles = makeStyles(theme => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withOpacity(theme.colors.accent, 0.06),
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  spinner: {
    marginRight: 8,
  },
  checkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginRight: 8,
  },
  label: {
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
}));
