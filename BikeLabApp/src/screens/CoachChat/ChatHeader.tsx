// The chat view's header row: a round Back button, the chat's title (tap it
// to rename or delete the chat) and a round new-chat button. Pure
// presentation, all state lives in the screen/useCoachChat.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {ChevronDownIcon} from '../../assets/img/icons/ChevronDownIcon';
import {ChevronLeftIcon} from '../../assets/img/icons/ChevronLeftIcon';
import {ComposeIcon} from '../../assets/img/icons/ComposeIcon';

const BUTTON_ICON_SIZE_PX = 18;
const TITLE_CHEVRON_SIZE_PX = 12;

export interface ChatHeaderProps {
  onBack: () => void;
  onNewChat: () => void;
  /** Opens the chat's own sheet (rename, delete). */
  onTitlePress: () => void;
  streaming: boolean;
  /** The chat's title; null for one that has no messages yet. */
  title: string | null;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({onBack, onNewChat, onTitlePress, streaming, title}) => {
  const {t} = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.roundButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('coach.back')}
        testID="coach-back-button">
        <ChevronLeftIcon size={BUTTON_ICON_SIZE_PX} color={theme.colors.text.primary} />
      </TouchableOpacity>

      {/* Only a chat that exists on the server can be renamed or deleted. */}
      {title ? (
        <TouchableOpacity
          style={styles.title}
          onPress={onTitlePress}
          disabled={streaming}
          accessibilityRole="button"
          accessibilityLabel={t('coach.chatOptions')}
          testID="coach-chat-title">
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          <ChevronDownIcon size={TITLE_CHEVRON_SIZE_PX} color={theme.colors.text.secondary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.title}>
          <Text style={styles.titleText} numberOfLines={1}>
            {t('coach.newChat')}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.roundButton}
        onPress={onNewChat}
        disabled={streaming}
        accessibilityRole="button"
        accessibilityLabel={t('coach.newChat')}
        testID="coach-new-chat-button">
        <ComposeIcon size={BUTTON_ICON_SIZE_PX} color={theme.colors.text.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    paddingTop: 60,
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[12],
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: withOpacity(theme.colors.surfaceElevated, 0.82),
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.black, 0.07),
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[4],
  },
  titleText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: theme.colors.text.primary,
  },
}));
