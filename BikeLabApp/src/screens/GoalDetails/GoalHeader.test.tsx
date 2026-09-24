import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {GoalHeader} from './GoalHeader';

// See lib.test.ts's identical comment — GoalHeader -> ./lib ->
// ../../utils/healthService -> the native healthkit module.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('@react-native-community/blur', () => {
  const {View} = require('react-native');
  return {BlurView: View};
});
jest.mock('../../components/BlobOrb', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: (props: any) => <View {...props} />};
});

function makeMetaGoal(overrides: Partial<MetaGoal> = {}): MetaGoal {
  return {
    id: 1,
    title: 'Ride 1000km',
    description: 'Get to 1000km this year',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as MetaGoal;
}

describe('GoalHeader', () => {
  const noop = () => {};

  it('renders the title, description and rounded overall-progress percent', () => {
    render(
      <GoalHeader
        metaGoal={makeMetaGoal()}
        overallProgress={42.6}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
      />,
    );

    expect(screen.getByText('Ride 1000km')).toBeTruthy();
    expect(screen.getByText('Get to 1000km this year')).toBeTruthy();
    expect(screen.getByText('43%')).toBeTruthy();
  });

  it('shows the tier badge only for a non-base tier', () => {
    render(
      <GoalHeader
        metaGoal={makeMetaGoal({tier: 'epic'})}
        overallProgress={0}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
      />,
    );
    expect(screen.getByText('goalTier.epic')).toBeTruthy();
  });

  it('fires onDelete/onAskCoach when tapped', () => {
    const onDelete = jest.fn();
    const onAskCoach = jest.fn();
    render(
      <GoalHeader
        metaGoal={makeMetaGoal()}
        overallProgress={10}
        locale="en-US"
        onBack={noop}
        onDelete={onDelete}
        onAskCoach={onAskCoach}
      />,
    );

    fireEvent.press(screen.getByText('goalDetails.askCoachBannerTitle'));
    expect(onAskCoach).toHaveBeenCalledTimes(1);
  });

  it('swaps the status pill and the coach banner once the target date has passed', () => {
    render(
      <GoalHeader
        metaGoal={makeMetaGoal({target_date: '2020-01-01'})}
        overallProgress={30}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
      />,
    );

    expect(screen.getByText('goalDetails.statusExpired')).toBeTruthy();
    expect(screen.getByText('goalDetails.expiredBannerTitle')).toBeTruthy();
    expect(screen.queryByText('goalDetails.askCoachBannerTitle')).toBeNull();
  });

  it('leaves a goal due in the future alone', () => {
    render(
      <GoalHeader
        metaGoal={makeMetaGoal({target_date: '2099-01-01'})}
        overallProgress={30}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
      />,
    );

    expect(screen.getByText('goalDetails.statusActive')).toBeTruthy();
    expect(screen.getByText('goalDetails.askCoachBannerTitle')).toBeTruthy();
  });

  it('offers a share button only once the goal is completed', () => {
    const onShare = jest.fn();
    const {rerender} = render(
      <GoalHeader
        metaGoal={makeMetaGoal()}
        overallProgress={80}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
        onShare={onShare}
      />,
    );
    expect(screen.queryByTestId('goal-share-button')).toBeNull();

    rerender(
      <GoalHeader
        metaGoal={makeMetaGoal({status: 'completed'})}
        overallProgress={100}
        locale="en-US"
        onBack={noop}
        onDelete={noop}
        onAskCoach={noop}
        onShare={onShare}
      />,
    );
    fireEvent.press(screen.getByTestId('goal-share-button'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
