// Bottom padding a scroll container inside MainTabs needs so its last row
// clears the absolutely positioned floating tab bar (+ home indicator inset).
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';

export const TAB_BAR_CLEARANCE_GAP = 16;

export const useTabBarBottomPadding = (): number => {
  const insets = useSafeAreaInsets();
  return DEFAULT_TAB_BAR_STYLE.height + insets.bottom + TAB_BAR_CLEARANCE_GAP;
};

// Extra clearance on top of the tab bar for lists that also carry a pinned
// pill/FAB (Checklist, Calendar, Coach memory) so the last row scrolls above it.
export const FLOATING_PILL_CLEARANCE_PX = 72;
