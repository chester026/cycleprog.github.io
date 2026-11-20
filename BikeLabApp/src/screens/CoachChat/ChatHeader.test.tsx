import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {ChatHeader} from './ChatHeader';
import {ChatInput} from '../../components/coach/ChatInput';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('coach header and input buttons', () => {
  it('labels the round header buttons for screen readers', () => {
    const onNewChat = jest.fn();
    const onBack = jest.fn();
    render(<ChatHeader onBack={onBack} onNewChat={onNewChat} onTitlePress={jest.fn()} streaming={false} title="Gran Fondo Cyprus" />);

    fireEvent.press(screen.getByLabelText('coach.newChat'));
    expect(onNewChat).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('coach.back'));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows the chat's title and opens its options from it; a chat with no messages yet has none", () => {
    const onTitlePress = jest.fn();
    const {rerender} = render(
      <ChatHeader onBack={jest.fn()} onNewChat={jest.fn()} onTitlePress={onTitlePress} streaming={false} title="Gran Fondo Cyprus" />,
    );
    expect(screen.getByText('Gran Fondo Cyprus')).toBeTruthy();
    fireEvent.press(screen.getByTestId('coach-chat-title'));
    expect(onTitlePress).toHaveBeenCalledTimes(1);

    rerender(<ChatHeader onBack={jest.fn()} onNewChat={jest.fn()} onTitlePress={onTitlePress} streaming={false} title={null} />);
    expect(screen.queryByTestId('coach-chat-title')).toBeNull();
    // The title slot says "New chat"; so does the button's label.
    expect(screen.getByText('coach.newChat')).toBeTruthy();
  });

  it('keeps the input attach button distinct from the header new-chat button', () => {
    const onAttachPress = jest.fn();
    render(<ChatInput onSend={jest.fn()} onCancel={jest.fn()} streaming={false} onAttachPress={onAttachPress} />);

    fireEvent.press(screen.getByLabelText('coach.attachActivities'));
    expect(onAttachPress).toHaveBeenCalled();
    expect(screen.queryByLabelText('coach.newChat')).toBeNull();
  });

  it('shows every attached route with its size, the upload in progress after them, and lets each be removed', () => {
    const onRemoveRoute = jest.fn();
    const stage1 = {course_id: 12, name: 'Stage 1', distance_km: 92.3, elevation_gain_m: 1480, climbs: []};
    const stage2 = {course_id: 13, name: 'Stage 2', distance_km: 104, elevation_gain_m: 2100, climbs: []};
    const {rerender} = render(
      <ChatInput onSend={jest.fn()} onCancel={jest.fn()} streaming={false} onAttachPress={jest.fn()} routeUploading />,
    );
    expect(screen.getByTestId('coach-route-uploading')).toBeTruthy();
    expect(screen.queryByTestId(/^coach-route-pill-/)).toBeNull();

    // The first stage is read, the second is on its way.
    rerender(
      <ChatInput
        onSend={jest.fn()}
        onCancel={jest.fn()}
        streaming={false}
        onAttachPress={jest.fn()}
        attachedRoutes={[stage1]}
        routeUploading
        onRemoveRoute={onRemoveRoute}
      />,
    );
    expect(screen.getByTestId('coach-route-pill-12')).toBeTruthy();
    expect(screen.getByTestId('coach-route-uploading')).toBeTruthy();

    rerender(
      <ChatInput
        onSend={jest.fn()}
        onCancel={jest.fn()}
        streaming={false}
        onAttachPress={jest.fn()}
        attachedRoutes={[stage1, stage2]}
        onRemoveRoute={onRemoveRoute}
      />,
    );
    expect(screen.queryByTestId('coach-route-uploading')).toBeNull();
    expect(screen.getAllByTestId(/^coach-route-pill-/)).toHaveLength(2);
    fireEvent.press(screen.getByTestId('coach-route-remove-13'));
    expect(onRemoveRoute).toHaveBeenCalledWith(13);
  });
});
