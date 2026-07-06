// Shared with App.tsx (MainTabs' default tabBarStyle) so screens that
// temporarily hide the floating tab bar (see CoachChatScreen) can restore
// the exact same style on the way out, instead of duplicating these values
// and risking drift if the design changes later.
export const DEFAULT_TAB_BAR_STYLE = {
  position: 'absolute' as const,
  backgroundColor: 'transparent',
  borderTopWidth: 1,
  borderTopColor: 'rgba(255, 255, 255, 0.1)',
  height: 74,
  paddingBottom: 24,
  paddingTop: 4,
  paddingHorizontal: 16,
  elevation: 0,
};
