// Screens inside MainTabs read useSafeAreaInsets() (via useTabBarBottomPadding)
// and tests render them without a SafeAreaProvider — zero insets by default.
// (The library's own jest/mock.tsx is ESM and not transformed here.)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  SafeAreaProvider: ({children}) => children,
}));
