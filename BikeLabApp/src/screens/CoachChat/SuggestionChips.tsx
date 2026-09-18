// Thin CoachChat-specific wrapper over the shared chip-row primitive
// (components/coach/SuggestedActions) — kept as its own file (T-5.x wave 2
// decomposition) so CoachChatScreen/MessageList import one clearly-named
// "the suggestion chips for this screen" component rather than reaching
// into components/coach/SuggestedActions directly at every call site. All
// visual/scroll behaviour is unchanged — it's the exact same component.
import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import {SuggestedActions} from '../../components/coach/SuggestedActions';
import {SuggestionItem} from '../../types/coach';

export interface SuggestionChipsProps {
  items: (SuggestionItem & {prompt?: string})[];
  onPress: (item: SuggestionItem & {prompt?: string}) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  label?: string;
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  items,
  onPress,
  disabled,
  style,
  contentContainerStyle,
  label,
}) => (
  <SuggestedActions
    items={items}
    onPress={onPress}
    disabled={disabled}
    style={style}
    contentContainerStyle={contentContainerStyle}
    label={label}
  />
);
