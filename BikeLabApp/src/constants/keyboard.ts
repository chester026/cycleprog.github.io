// Spread onto every ScrollView/FlatList that holds or sits above a TextInput:
// dragging the content down dismisses the keyboard (interactive on iOS, where
// the keyboard follows the finger; on-drag on Android, which has no
// interactive mode) and taps on buttons still register while it is open.
import {Platform, type ScrollViewProps} from 'react-native';

export const KEYBOARD_DISMISS_PROPS: Pick<ScrollViewProps, 'keyboardDismissMode' | 'keyboardShouldPersistTaps'> = {
  keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'on-drag',
  keyboardShouldPersistTaps: 'handled',
};
