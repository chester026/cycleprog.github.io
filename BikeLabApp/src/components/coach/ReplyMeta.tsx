import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {getToolLabelKey, getToolTagKey, toolCallTags} from '@bikelab/shared/coach';
import type {ToolCall} from '../../types/coach';
import {CoachMark} from './CoachMark';
import {makeStyles} from '../../theme';

// The line above a coach reply: the coach's mark and, beside it, one line of
// text — what is happening right now while a step runs ("Checking your
// calendar…"), otherwise what the coach looked at or touched for this
// answer ("Calendar, Power profile"), otherwise its name. The mark is alive
// for as long as the reply is being made and still once it is done; nothing
// else on the line moves, appears or changes size (owner, 20.11.2026: the
// working state used to swap in a larger orb and typing dots that sat left
// or right depending on what was beside them).
export const ReplyMeta: React.FC<{toolCalls?: ToolCall[]; streaming?: boolean}> = ({toolCalls, streaming}) => {
  const {t} = useTranslation();
  const tags = toolCallTags(toolCalls ?? []);
  const running = tags.find(tag => tag.status === 'running');
  const done = tags
    .filter(tag => tag.status === 'done')
    .map(tag => t(getToolTagKey(tag.name)))
    .join(', ');

  return (
    <View style={styles.meta} testID="coach-reply-meta">
      <CoachMark live={!!streaming} />
      {running ? (
        <Text style={[styles.metaText, styles.metaTextNow]} numberOfLines={1} testID="coach-working">
          {t(getToolLabelKey(running.name))}
        </Text>
      ) : (
        <Text style={styles.metaText} numberOfLines={2}>
          {done || t('coach.headerTitle')}
        </Text>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[8],
  },
  metaText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
    color: theme.colors.text.iosMuted,
  },
  // The step in progress reads a shade stronger than the record of what is done.
  metaTextNow: {
    color: theme.colors.text.secondary,
  },
}));
