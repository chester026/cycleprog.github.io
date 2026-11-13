import React, {useEffect, useRef, useState} from 'react';
import {Animated, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import type {AttachedActivity, AttachedRoute} from '@bikelab/shared/types';
import {PaperclipIcon} from '../../assets/img/icons/PaperclipIcon';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const ATTACH_ICON_SIZE_PX = 22;

export const ChatInput: React.FC<{
  onSend: (text: string) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  onAttachPress: () => void;
  attachedActivities?: AttachedActivity[];
  onRemoveAttachment?: (id: number) => void;
  /** A route file (GPX / FIT) attached for a race plan — one at a time. */
  attachedRoute?: AttachedRoute | null;
  /** True while the route file is being read by the server. */
  routeUploading?: boolean;
  onRemoveRoute?: () => void;
}> = ({
  onSend,
  onCancel,
  streaming,
  disabled,
  onAttachPress,
  attachedActivities,
  onRemoveAttachment,
  attachedRoute,
  routeUploading,
  onRemoveRoute,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  // Grows from a 48px pill to a 100px box purely on focus — not tied to
  // having text, so tapping away always collapses it back to default even
  // if a draft is still sitting in the field.
  const isExpanded = focused;
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isExpanded, expandAnim]);

  const inputHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 100],
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText('');
  };

  const sendDisabled = !streaming && (!text.trim() || disabled);

  return (
    <View style={styles.wrapper}>
      {(!!attachedActivities?.length || !!attachedRoute || !!routeUploading) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsRow}
          contentContainerStyle={styles.pillsContent}>
          {routeUploading ? (
            <View style={styles.pill} testID="coach-route-uploading">
              <Text style={styles.pillText} numberOfLines={1}>
                {t('coach.routeReading')}
              </Text>
            </View>
          ) : null}
          {attachedRoute ? (
            <View style={[styles.pill, styles.routePill]} testID="coach-route-pill">
              <Text style={styles.pillText} numberOfLines={1}>
                {t('coach.routePill', {
                  name: attachedRoute.name ?? t('coach.routeUnnamed'),
                  km: Math.round(attachedRoute.distance_km),
                  gain: attachedRoute.elevation_gain_m,
                })}
              </Text>
              <TouchableOpacity
                onPress={onRemoveRoute}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                testID="coach-route-remove">
                <Text style={styles.pillRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {(attachedActivities ?? []).map(activity => (
            <View key={activity.id} style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1}>
                {activity.name}
              </Text>
              <TouchableOpacity
                onPress={() => onRemoveAttachment?.(activity.id)}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Text style={styles.pillRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={onAttachPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('coach.attachActivities')}
          testID="coach-attach-button">
          <PaperclipIcon size={ATTACH_ICON_SIZE_PX} color={theme.colors.black} />
        </TouchableOpacity>
        <AnimatedTextInput
          style={[styles.input, {height: inputHeight}]}
          placeholder={t('coach.inputPlaceholder')}
          placeholderTextColor={theme.colors.text.faint}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          editable={!disabled}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.button, streaming ? styles.buttonStop : sendDisabled && styles.buttonDisabled]}
          onPress={streaming ? onCancel : handleSend}
          disabled={sendDisabled}>
          {streaming ? <View style={styles.stopIcon} /> : <Text style={styles.buttonText}>→</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Visual values lifted as-is from the old GoalAssistantScreen's input pill +
// circular submit button (see `input`/`submitBtn`/`submitBtnText` there),
// just docked at the bottom of the chat instead of inside the animated hero.
const styles = makeStyles(theme => ({
  wrapper: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: theme.colors.surfaceElevated,
  },
  pillsRow: {
    marginBottom: 8,
  },
  pillsContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.divider,
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    maxWidth: 160,
  },
  // A route says its size too, so it gets more room than a ride's name.
  routePill: {
    maxWidth: 280,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginRight: 4,
  },
  pillRemove: {
    fontSize: 15,
    color: theme.colors.text.muted,
    fontWeight: '600',
    paddingHorizontal: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  attachButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.black, 0.12),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: theme.colors.text.primary,
    marginRight: 8,
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.black, 0.12),
  },
  button: {
    backgroundColor: theme.colors.accent,
    width: 48,
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonStop: {
    backgroundColor: theme.colors.text.primary,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 24,
    color: theme.colors.text.inverse,
    fontWeight: 'bold',
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.colors.text.inverse,
  },
}));
