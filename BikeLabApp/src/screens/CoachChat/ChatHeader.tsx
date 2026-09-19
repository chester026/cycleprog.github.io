// The chat view's header row — Back / title / new-chat + delete-current
// icon buttons. Extracted from CoachChatScreen (T-5.x wave 2 decomposition)
// — pure presentation, all state lives in the screen/useCoachChat.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, withOpacity} from '../../theme';

export interface ChatHeaderProps {
  onBack: () => void;
  onNewChat: () => void;
  onDeleteCurrent: () => void;
  streaming: boolean;
  /** Only conversations that have actually been persisted server-side get a delete icon. */
  hasConversation: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onBack,
  onNewChat,
  onDeleteCurrent,
  streaming,
  hasConversation,
}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>{t('coach.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitleSmall}>{t('coach.headerTitle')}</Text>
      <View style={styles.headerActions}>
        {hasConversation ? <TouchableOpacity style={styles.iconButton} onPress={onDeleteCurrent} disabled={streaming}>
            <Text style={styles.iconButtonText}>×</Text>
          </TouchableOpacity> : null}
        <TouchableOpacity style={styles.iconButton} onPress={onNewChat} disabled={streaming}>
          <Text style={styles.iconButtonText}>＋</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: theme.spacing[20],
    paddingBottom: theme.spacing[12],
  },
  backButton: {
    paddingVertical: theme.spacing[4],
    paddingRight: theme.spacing[8],
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.black,
  },
  headerTitleSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: theme.spacing[8],
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withOpacity(theme.colors.surfaceElevated, 0.7),
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.black, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    marginTop: -1,
  },
}));
