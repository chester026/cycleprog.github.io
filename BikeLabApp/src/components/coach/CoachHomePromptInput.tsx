import React, {useState} from 'react';
import {Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {SparkleIcon} from '../../assets/img/icons/SparkleIcon';
import {makeStyles, useTheme, withOpacity} from '../../theme';

// The free-text prompt box on the AI Coach home screen (above the quick-start
// chips, below the greeting/headline) — distinct from ChatInput, which lives
// INSIDE an already-open conversation. Submitting here always starts a brand
// new conversation (see CoachChatScreen's handleHomeSubmit), matching how the
// quick-start chips already behave.
export const CoachHomePromptInput: React.FC<{
  onSubmit: (text: string) => void;
  disabled?: boolean;
}> = ({onSubmit, disabled}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText('');
  };

  const hasText = text.trim().length > 0;
  const sendDisabled = disabled || !hasText;

  return (
    <View style={styles.row}>
      <View style={styles.sparkleWrap}>
        <SparkleIcon size={32} color={theme.colors.text.primary} />
      </View>
      <TextInput
        style={styles.input}
        placeholder={t('coach.homeInputPlaceholder')}
        placeholderTextColor={theme.colors.text.faint}
        value={text}
        onChangeText={setText}
        editable={!disabled}
        onSubmitEditing={handleSubmit}
        returnKeyType="send"
      />
      {/* No voice input in this app — always a send button, just disabled
          until there's something to send, rather than a mic that implies a
          feature that doesn't exist. */}
      <TouchableOpacity
        style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
        onPress={handleSubmit}
        disabled={sendDisabled}>
        <Text style={styles.sendButtonText}>→</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.black, 0.1),
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 6,
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text.primary,
    paddingVertical: 4,
  },
  // The sparkle glyph's own path isn't optically centered in its square
  // viewBox (more weight below the middle), so it reads as sitting slightly
  // below the input's vertical center — nudge it up a couple px to correct
  // for that rather than fighting the path data itself.
  sparkleWrap: {
    marginTop: -4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 50,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  sendButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text.inverse,
    marginTop: -1,
  },
}));
