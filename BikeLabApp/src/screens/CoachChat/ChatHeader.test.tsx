import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {ChatHeader} from './ChatHeader';
import {ChatInput} from '../../components/coach/ChatInput';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('coach header and input buttons', () => {
  it('labels the header new-chat button and delete button for screen readers', () => {
    const onNewChat = jest.fn();
    render(
      <ChatHeader onBack={jest.fn()} onNewChat={onNewChat} onDeleteCurrent={jest.fn()} streaming={false} hasConversation />,
    );

    fireEvent.press(screen.getByLabelText('coach.newChat'));
    expect(onNewChat).toHaveBeenCalled();
    expect(screen.getByLabelText('coach.deleteChat')).toBeTruthy();
  });

  it('keeps the input attach button distinct from the header new-chat button', () => {
    const onAttachPress = jest.fn();
    render(<ChatInput onSend={jest.fn()} onCancel={jest.fn()} streaming={false} onAttachPress={onAttachPress} />);

    fireEvent.press(screen.getByLabelText('coach.attachActivities'));
    expect(onAttachPress).toHaveBeenCalled();
    expect(screen.queryByLabelText('coach.newChat')).toBeNull();
  });

  it('shows an attached route with its size, the upload in progress, and lets it be removed', () => {
    const onRemoveRoute = jest.fn();
    const route = {course_id: 12, name: 'Lefkara Classic', distance_km: 92.3, elevation_gain_m: 1480, climbs: []};
    const {rerender} = render(
      <ChatInput onSend={jest.fn()} onCancel={jest.fn()} streaming={false} onAttachPress={jest.fn()} routeUploading />,
    );
    expect(screen.getByTestId('coach-route-uploading')).toBeTruthy();
    expect(screen.queryByTestId('coach-route-pill')).toBeNull();

    rerender(
      <ChatInput
        onSend={jest.fn()}
        onCancel={jest.fn()}
        streaming={false}
        onAttachPress={jest.fn()}
        attachedRoute={route}
        onRemoveRoute={onRemoveRoute}
      />,
    );
    expect(screen.queryByTestId('coach-route-uploading')).toBeNull();
    expect(screen.getByTestId('coach-route-pill')).toBeTruthy();
    fireEvent.press(screen.getByTestId('coach-route-remove'));
    expect(onRemoveRoute).toHaveBeenCalled();
  });
});
