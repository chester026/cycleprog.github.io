import React from 'react';
import {render, screen, waitFor} from '@testing-library/react-native';
import {AchievementsScreen} from '../AchievementsScreen';
import {useAchievements} from '../../data/hooks/useAchievements';
import {useEvaluateAchievements} from '../../data/hooks/useEvaluateAchievements';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
}));
jest.mock('../../data/hooks/useAchievements', () => ({useAchievements: jest.fn()}));
jest.mock('../../data/hooks/useEvaluateAchievements', () => ({useEvaluateAchievements: jest.fn()}));
// The real AchievementCard/AchievementMiniCard `require(...webp)` medal
// images, which aren't present in this checkout (binary assets aren't
// committed) — stub both with plain Text so this test can exercise the
// screen's own data-loading/refresh logic without that unrelated failure.
// AchievementsScreen's own UnlockModal requires these medal images
// directly (not through the achievements component barrel above) — same
// "binary assets aren't in this checkout" issue, stubbed the same way.
jest.mock('../../assets/img/achieve/silver.webp', () => 'silver.webp', {virtual: true});
jest.mock('../../assets/img/achieve/rare_steel.webp', () => 'rare_steel.webp', {virtual: true});
jest.mock('../../assets/img/achieve/gold.webp', () => 'gold.webp', {virtual: true});
jest.mock('../../components/achievements', () => {
  const ReactLib = require('react');
  const {Text} = require('react-native');
  return {
    AchievementCard: ({achievement}: any) => ReactLib.createElement(Text, null, achievement.name),
    AchievementMiniCard: ({achievement}: any) => ReactLib.createElement(Text, null, achievement.name),
  };
});

const mockedUseAchievements = useAchievements as jest.Mock;
const mockedUseEvaluate = useEvaluateAchievements as jest.Mock;

const achievements = [
  {
    id: 1,
    category: 'distance',
    name: 'Century Rider',
    description: 'Ride 100km',
    metric: 'total_distance',
    threshold: 100000,
    current_value: 50000,
    progress_pct: 50,
    unlocked: false,
    tier: 'silver',
  },
  {
    id: 2,
    category: 'climbing',
    name: 'Peak Hunter',
    description: 'Climb 1000m',
    metric: 'total_elevation_gain',
    threshold: 1000,
    current_value: 1000,
    progress_pct: 100,
    unlocked: true,
    unlocked_at: '2025-01-01',
    tier: 'gold',
  },
];

describe('AchievementsScreen', () => {
  beforeEach(() => {
    mockedUseAchievements.mockReset();
    mockedUseEvaluate.mockReset();
    mockedUseAchievements.mockReturnValue({
      isLoading: false,
      data: {achievements, stats: {total: 2, unlocked: 1, progress_pct: 50}},
    });
    mockedUseEvaluate.mockReturnValue({mutateAsync: jest.fn().mockResolvedValue({}), isPending: false});
  });

  it('renders stats and achievement names from useAchievements()', () => {
    render(<AchievementsScreen />);
    expect(screen.getByText('achievements.title')).toBeTruthy();
    expect(screen.getByText('Century Rider')).toBeTruthy();
    // "Peak Hunter" is unlocked, so it renders twice: once in the "Recently
    // Unlocked" strip and once in its category grid below.
    expect(screen.getAllByText('Peak Hunter').length).toBeGreaterThan(0);
    // stats.unlocked
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('shows the newly-unlocked modal when pull-to-refresh evaluation reports one', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({
      newly_unlocked: [{name: 'Century Rider', icon: '🏆', tier: 'silver', description: 'Ride 100km'}],
    });
    mockedUseEvaluate.mockReturnValue({mutateAsync, isPending: false});

    render(<AchievementsScreen />);

    // Trigger the RefreshControl's onRefresh directly — RNTL doesn't drive
    // native pull gestures.
    const scrollView = screen.UNSAFE_getByType(require('react-native').ScrollView);
    await waitFor(() => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('achievements.achievementUnlocked')).toBeTruthy());
  });
});
