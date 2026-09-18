// Inline status strip shown above the chat input — currently just the
// stream-error banner (extracted from CoachChatScreen, T-5.x wave 2
// decomposition). Its own file so a future context indicator (e.g. "Health
// connected" / attachment summary) has somewhere to slot in next to it
// without growing the screen file again.
import React from 'react';
import {Text, View} from 'react-native';
import {makeStyles, withOpacity} from '../../theme';

export interface ContextBarProps {
  error?: string | null;
}

export const ContextBar: React.FC<ContextBarProps> = ({error}) => {
  if (!error) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
};

const styles = makeStyles(theme => ({
  errorBanner: {
    marginHorizontal: theme.spacing[12],
    marginBottom: theme.spacing[6],
    backgroundColor: withOpacity(theme.colors.danger, 0.1),
    borderRadius: theme.radii.sm,
    padding: theme.spacing[10],
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.danger, 0.3),
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
}));
