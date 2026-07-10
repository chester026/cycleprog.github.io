import React, {useEffect, useRef, useState} from 'react';
import {Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {AttachedActivity} from './ActivityPickerModal';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export const ChatInput: React.FC<{
  onSend: (text: string) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  onAttachPress: () => void;
  attachedActivities?: AttachedActivity[];
  onRemoveAttachment?: (id: number) => void;
}> = ({onSend, onCancel, streaming, disabled, onAttachPress, attachedActivities, onRemoveAttachment}) => {
  const {t} = useTranslation();
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
      {!!attachedActivities?.length && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsRow}
          contentContainerStyle={styles.pillsContent}>
          {attachedActivities.map(activity => (
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
          accessibilityLabel={t('coach.attachActivities')}>
          <Text style={styles.attachButtonText}>+</Text>
        </TouchableOpacity>
        <AnimatedTextInput
          style={[styles.input, {height: inputHeight}]}
          placeholder={t('coach.inputPlaceholder')}
          placeholderTextColor="#999"
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
const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
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
    backgroundColor: '#f0f0f0',
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    maxWidth: 160,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 4,
  },
  pillRemove: {
    fontSize: 15,
    color: '#888',
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
    borderColor: 'rgba(0, 0, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    
  },
  attachButtonText: {
    fontSize: 22,
    color: '#000000',
    fontWeight: '600',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#1a1a1a',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  button: {
    backgroundColor: '#274dd3',
    width: 48,
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonStop: {
    backgroundColor: '#1a1a1a',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  stopIcon: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
});
