import React from 'react';
import {ScrollView, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SuggestionItem} from '../../types/coach';

// A single horizontally-scrolling row — tried a flex-wrap-column "2 rows
// then scroll right" grid before this, but a fixed/measured row height kept
// fighting real layout in practice (chips landing on one line with an
// orphaned second line, or a visible gap between rows). A plain row that
// just scrolls is simpler and never misbehaves; the fix for "too much
// horizontal scrolling" is shorter labels (see the coach.suggest* i18n
// strings), not a taller layout.
//
// The server orders suggestions by relevance, so the first item is the one
// worth nudging the rider toward — it gets a blue/purple gradient "ring"
// instead of the same flat white/gray look as the rest.
//
// Built as: outer pill sized by its own padding + text (normal flow) →
// gradient painted absolute-fill behind everything → a white inset view on
// top of the gradient, leaving an even ring showing all around. The earlier
// version nested a LinearGradient-with-padding around an inner View instead,
// which relied on the outer gradient box being taller than the inner one by
// exactly the padding amount — in practice the two drifted out of sync
// (only the top edge of the ring rendered) once real text metrics were
// involved. Sizing everything off the SAME outer box via absolute
// positioning removes that whole class of mismatch.
export const SuggestedActions: React.FC<{
  items: SuggestionItem[];
  onPress: (item: SuggestionItem) => void;
  disabled?: boolean;
  // Outer ScrollView container — for margin/spacing around the whole block.
  style?: StyleProp<ViewStyle>;
  // Inner scrollable content — for the horizontal inset the first chip
  // starts at (e.g. the home hero's quick-start row lines its first chip up
  // with the hero's own 20px text margin instead of a message bubble's
  // 12px one).
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Small gray prefix rendered as part of the scrollable content itself
  // (e.g. "Ask for:") — inside the ScrollView rather than a fixed sibling
  // next to it, so it scrolls away with the chips instead of staying pinned
  // at the left edge.
  label?: string;
}> = ({items, onPress, disabled, style, contentContainerStyle, label}) => {
  if (!items || items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.row, contentContainerStyle]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {items.map((item, i) => {
        if (i === 0) {
          return (
            <TouchableOpacity
              key={`${i}-${item.label}`}
              onPress={() => onPress(item)}
              disabled={disabled}
              style={[styles.primaryWrap, disabled && styles.badgeDisabled]}>
              <LinearGradient
                colors={['#4F6BFF', '#9B5DE5']}
                start={{x: 0, y: 0}}
                end={{x: 1, y: 0}}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.primaryInnerFill} />
              <Text style={styles.primaryText} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity
            key={`${i}-${item.label}`}
            style={[styles.badge, disabled && styles.badgeDisabled]}
            onPress={() => onPress(item)}
            disabled={disabled}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.35)',
  },
  badge: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  badgeDisabled: {
    opacity: 0.5,
  },
  badgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '600',
  },
  // The pill's actual size — text (normal flow) + this padding. The
  // gradient and inner-fill overlays below are absolutely positioned against
  // THIS box, so they can't drift out of sync with it the way two separately
  // padded nested views could.
  primaryWrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  // Inset by a fixed 2px on every side of primaryWrap — leaves a uniform
  // gradient ring showing all the way around, top and bottom included.
  primaryInnerFill: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  primaryText: {
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
});
