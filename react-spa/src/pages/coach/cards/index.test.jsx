import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeAnalysisMeta } from '@bikelab/shared/coach';
import ChatMessageBubble from '../ChatMessageBubble';
import { renderCoachCards } from './index';
import { CARD_ROUTES } from './routes';
import { ACTIVITIES, CONVERSATION } from './__fixtures__/conversation';

// Golden test: the whole fixture conversation rendered through the bubble's
// card slots — the set of cards per assistant message is what the app's
// ChatMessageBubble.tsx gating produces for the same tool results.
const CARD_TEST_IDS = [
  'ride-score-card',
  'overtraining-trend-card',
  'recovery-card',
  'chat-bubble-assistant',
  'metric-comparison-baseline',
  'metric-comparison-similar',
  'skills-delta-card',
  'goal-created-card',
  'goal-completed-card',
  'calendar-event-created-card',
  'calendar-plan-created-card',
  'add-to-calendar-button',
  'checklist-updated-card',
  'coach-memory-card',
  'profile-updated-card',
];

function renderMessage(index, { navigate = vi.fn(), activities = ACTIVITIES } = {}) {
  const meta = computeAnalysisMeta(CONVERSATION);
  const message = CONVERSATION[index];
  const renderCards = (slot, ctx) => renderCoachCards(slot, { ...ctx, navigate, activities });
  const utils = render(<ChatMessageBubble message={message} analysisMeta={meta[index]} renderCards={renderCards} />);
  const ids = Array.from(utils.container.querySelectorAll('[data-testid]'))
    .map((n) => n.dataset.testid)
    .filter((id) => CARD_TEST_IDS.includes(id));
  return { ...utils, ids, navigate };
}

describe('renderCoachCards golden conversation', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('first analysis: score + trend before the text, details withheld', () => {
    expect(renderMessage(1).ids).toEqual(['ride-score-card', 'overtraining-trend-card', 'chat-bubble-assistant']);
  });

  it('detail-chip reply shows only the requested card, no score repeat', () => {
    expect(renderMessage(3).ids).toEqual(['chat-bubble-assistant', 'metric-comparison-baseline']);
  });

  it('organic later analysis shows every available angle after the text', () => {
    expect(renderMessage(5).ids).toEqual([
      'chat-bubble-assistant',
      'metric-comparison-baseline',
      'metric-comparison-similar',
      'skills-delta-card',
    ]);
    expect(screen.getByTestId('metric-comparison-similar')).toHaveTextContent('vs Sunday climb');
  });

  it('analyze_readiness with Oura rows: trend + recovery before the text', () => {
    expect(renderMessage(7).ids).toEqual(['overtraining-trend-card', 'recovery-card', 'chat-bubble-assistant']);
    expect(screen.getByTestId('recovery-card')).toHaveTextContent('82');
  });

  it('get_oura_readiness alone also yields trend + recovery', () => {
    expect(renderMessage(9).ids).toEqual(['overtraining-trend-card', 'recovery-card', 'chat-bubble-assistant']);
  });

  it('readiness turn without a ride list skips the trend card', () => {
    expect(renderMessage(9, { activities: [] }).ids).toEqual(['recovery-card', 'chat-bubble-assistant']);
  });

  it('create_goal → GoalCreated linking to /goals/:id', () => {
    const { ids, navigate } = renderMessage(11);
    expect(ids).toEqual(['chat-bubble-assistant', 'goal-created-card']);
    fireEvent.click(screen.getByTestId('goal-created-card'));
    expect(navigate).toHaveBeenCalledWith('/goals/7');
  });

  it('one create_calendar_event → detailed event card + .ics button, linking to the event day', () => {
    const { ids, navigate } = renderMessage(13);
    expect(ids).toEqual(['chat-bubble-assistant', 'calendar-event-created-card', 'add-to-calendar-button']);
    fireEvent.click(screen.getByTestId('calendar-event-created-card'));
    expect(navigate).toHaveBeenCalledWith('/calendar?date=2026-10-20');
  });

  it('several create_calendar_event → one plan card + one .ics button; update/delete add nothing', () => {
    const { ids, navigate } = renderMessage(15);
    expect(ids).toEqual(['chat-bubble-assistant', 'calendar-plan-created-card', 'add-to-calendar-button']);
    expect(screen.getByTestId('calendar-plan-created-card')).toHaveTextContent('3 events added to your calendar');
    expect(screen.getByTestId('add-to-calendar-button')).toHaveTextContent('Add 3 events to calendar (.ics)');
    fireEvent.click(screen.getByTestId('calendar-plan-created-card'));
    expect(navigate).toHaveBeenCalledWith('/calendar?date=2026-10-21');
  });

  it('checklist tools → one card per added batch / checked item / removal, none for a rename', () => {
    const { ids, navigate } = renderMessage(17);
    expect(ids).toEqual(['chat-bubble-assistant', 'checklist-updated-card', 'checklist-updated-card', 'checklist-updated-card']);
    const cards = screen.getAllByTestId('checklist-updated-card');
    expect(cards[0]).toHaveTextContent('Clothes');
    expect(cards[1]).toHaveTextContent('Checked off: Helmet');
    expect(cards[2]).toHaveTextContent('Item removed');
    fireEvent.click(cards[0]);
    expect(navigate).toHaveBeenCalledWith(CARD_ROUTES.checklist);
  });

  it('memory and profile tools → memory ×2 then profile ×1 (failed update dropped), with their deep links', () => {
    const { ids, navigate } = renderMessage(19);
    expect(ids).toEqual(['chat-bubble-assistant', 'coach-memory-card', 'coach-memory-card', 'profile-updated-card']);
    const memory = screen.getAllByTestId('coach-memory-card');
    expect(memory[0]).toHaveTextContent('Remembered: Prefers morning rides');
    expect(memory[1]).toHaveTextContent('Forgot: Knee hurts on climbs');
    expect(screen.getByTestId('profile-updated-card')).toHaveTextContent('Weight 78 kg · Height 182 cm');
    fireEvent.click(memory[0]);
    expect(navigate).toHaveBeenCalledWith('/profile?tab=coach');
    fireEvent.click(screen.getByTestId('profile-updated-card'));
    expect(navigate).toHaveBeenCalledWith('/profile?tab=personal');
  });

  it('complete_goal → GoalCompleted with the ride count', () => {
    const { ids, navigate } = renderMessage(21);
    expect(ids).toEqual(['chat-bubble-assistant', 'goal-completed-card']);
    expect(screen.getByTestId('goal-completed-card')).toHaveTextContent('2 rides attached');
    fireEvent.click(screen.getByTestId('goal-completed-card'));
    expect(navigate).toHaveBeenCalledWith('/goals/7');
  });

  it('read-only tools, bike tools and failed writes render no cards', () => {
    expect(renderMessage(23).ids).toEqual(['chat-bubble-assistant']);
  });

  it('a streaming message with running tool calls renders no cards yet', () => {
    const running = {
      id: 'live',
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: 'x',
      toolCalls: [{ name: 'create_goal', args: {}, status: 'running' }],
    };
    const { container } = render(
      <ChatMessageBubble message={running} renderCards={(slot, ctx) => renderCoachCards(slot, { ...ctx, navigate: vi.fn(), activities: [] })} />,
    );
    expect(container.querySelector('[data-testid="goal-created-card"]')).toBeNull();
  });
});
