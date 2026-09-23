import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {ConversationSummary} from '../../types/coach';
import {makeStyles, withOpacity} from '../../theme';

function formatRelativeTime(isoDate: string, locale: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return locale === 'ru' ? 'только что' : 'just now';
  if (minutes < 60) return locale === 'ru' ? `${minutes} мин назад` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'ru' ? `${hours} ч назад` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale === 'ru' ? `${days} д назад` : `${days}d ago`;
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {month: 'short', day: 'numeric'});
}

export const ConversationListItem: React.FC<{
  conversation: ConversationSummary;
  onPress: () => void;
  onDelete: () => void;
}> = ({conversation, onPress, onDelete}) => {
  const {t, i18n} = useTranslation();

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onDelete} activeOpacity={0.7}>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {conversation.title || t('coach.untitledChat')}
        </Text>
        <Text style={styles.meta}>
          {formatRelativeTime(conversation.updated_at, i18n.language)} · {conversation.message_count}{' '}
          {t('coach.messagesShort')}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={onDelete}
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  // Individual bordered white card, same convention as MetaGoalCard's
  // cardOuter (borderWidth 1 / #ECECEC / marginHorizontal 16 / marginBottom
  // 12), rather than one continuous divided list — keeps this list visually
  // consistent with the Goals tab's list right next to it.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderBottomWidth: 1,
    borderColor: theme.colors.coach.listRowBorder,
    marginHorizontal: 4,
    marginBottom: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 3,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  chevron: {
    fontSize: 20,
    color: withOpacity(theme.colors.black, 0.25),
  },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: withOpacity(theme.colors.black, 0.05),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    color: theme.colors.text.muted,
    fontWeight: '600',
    marginTop: -1,
  },
}));
