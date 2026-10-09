// Spread onto every ScrollView/FlatList that holds or sits above a TextInput:
// any drag of the content dismisses the keyboard and taps on buttons still
// register while it is open. 'on-drag' rather than iOS's 'interactive'
// (owner, 09.10.2026): interactive only hides the keyboard when the finger
// drags it down past its own top edge, so a normal scroll up through the
// chat left it open and the only way out was tapping empty space.
import type {ScrollViewProps} from 'react-native';

export const KEYBOARD_DISMISS_PROPS: Pick<ScrollViewProps, 'keyboardDismissMode' | 'keyboardShouldPersistTaps'> = {
  keyboardDismissMode: 'on-drag',
  keyboardShouldPersistTaps: 'handled',
};
