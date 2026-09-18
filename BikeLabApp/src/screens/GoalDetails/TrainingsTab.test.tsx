import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import type {MetaGoal} from '@bikelab/shared/types';
import {TrainingsTab} from './TrainingsTab';
import {apiFetch} from '../../utils/api';

// See GoalDetails/lib.test.ts's identical comment.
jest.mock('@kingstinct/react-native-healthkit', () => ({}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

// Not resolvable under the jest preset's default asset extensions (see
// FTPAnalysis.test.tsx's identical mock) — `virtual` mocks stand in for
// the real image/webp assets TrainingsTab/TrainingCard require().
jest.mock('../../assets/img/mostrecomended.webp', () => 1, {virtual: true});
jest.mock('../../assets/img/blob1.png', () => 1, {virtual: true});
jest.mock('../../assets/img/blob2.png', () => 1, {virtual: true});
jest.mock('../../assets/img/blob3.png', () => 1, {virtual: true});
jest.mock('../../assets/img/blob4.png', () => 1, {virtual: true});
jest.mock('../../utils/api', () => ({
  apiFetch: jest.fn(),
}));

const mockedApiFetch = apiFetch as jest.Mock;

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeMetaGoal(overrides: Partial<MetaGoal> = {}): MetaGoal {
  return {
    id: 1,
    title: 'Ride 1000km',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as MetaGoal;
}

describe('TrainingsTab', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue([]);
  });

  it('shows the "ask coach" empty state when the meta-goal has no AI trainingTypes', async () => {
    const onAskCoachForPlan = jest.fn();
    renderWithClient(<TrainingsTab metaGoal={makeMetaGoal()} onAskCoachForPlan={onAskCoachForPlan} />);

    await waitFor(() => expect(screen.getByText('goalDetails.noTrainings')).toBeTruthy());

    fireEvent.press(screen.getByText('goalDetails.askCoachPlan'));
    expect(onAskCoachForPlan).toHaveBeenCalledTimes(1);
  });

  it('renders the AI-generated training center when trainingTypes are present', async () => {
    // The "mostRecommended" card only renders inside the horizontal
    // ScrollView, which itself only mounts when there's a second (priority)
    // training alongside it — same quirk the original screen had
    // (grouped.priority.length > 0 gates the whole row, mostRecommended
    // included), preserved 1:1 rather than "fixed" here.
    const metaGoal = makeMetaGoal({
      trainingTypes: [
        {type: 'endurance', title: 'Long Ride', description: 'Build endurance', priority: 1},
        {type: 'tempo', title: 'Tempo Ride', description: 'Build tempo', priority: 2},
      ],
    });

    renderWithClient(<TrainingsTab metaGoal={metaGoal} onAskCoachForPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText('Long Ride')).toBeTruthy());
    expect(screen.getByText('Tempo Ride')).toBeTruthy();
    expect(screen.getByText('goalDetails.aiTrainings')).toBeTruthy();
    // The two static "repeatable" cards always render alongside AI ones.
    expect(screen.getByText('goalDetails.recoveryRide')).toBeTruthy();
    expect(screen.getByText('goalDetails.groupRide')).toBeTruthy();
  });

  it('opens the training details modal when a repeatable card is pressed', async () => {
    // Repeatable cards (Recovery/Group Ride) only render alongside the AI
    // training center, same as the original screen — see the comment on
    // the previous test.
    const metaGoal = makeMetaGoal({
      trainingTypes: [
        {type: 'endurance', title: 'Long Ride', description: 'Build endurance', priority: 1},
        {type: 'tempo', title: 'Tempo Ride', description: 'Build tempo', priority: 2},
      ],
    });
    renderWithClient(<TrainingsTab metaGoal={metaGoal} onAskCoachForPlan={() => {}} />);

    await waitFor(() => expect(screen.getByText('goalDetails.recoveryRide')).toBeTruthy());
    fireEvent.press(screen.getByText('goalDetails.recoveryRide'));

    expect(screen.getByText('training.structure')).toBeTruthy();
  });
});
