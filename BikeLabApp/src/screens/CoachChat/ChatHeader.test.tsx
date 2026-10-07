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
});
