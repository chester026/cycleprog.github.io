import React from 'react';
import {KeyboardAvoidingView, ScrollView} from 'react-native';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {FormSheet} from './FormSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

describe('FormSheet', () => {
  it('renders the title, subtitle and each labeled field', () => {
    render(
      <FormSheet
        visible
        title="New item"
        subtitle="Add one to this section"
        fields={[{key: 'name', value: 'Helmet', onChangeValue: jest.fn(), label: 'Item name'}]}
        primaryLabel="Add"
        onPrimaryPress={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('New item')).toBeTruthy();
    expect(screen.getByText('Add one to this section')).toBeTruthy();
    expect(screen.getByText('Item name')).toBeTruthy();
    expect(screen.getByDisplayValue('Helmet')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('submits the last field on its keyboard return and moves focus otherwise', () => {
    const onPrimaryPress = jest.fn();
    render(
      <FormSheet
        visible
        title="New section"
        fields={[
          {key: 'section', value: 'What to buy', onChangeValue: jest.fn()},
          {key: 'item', value: 'Bicycle', onChangeValue: jest.fn()},
        ]}
        primaryLabel="Add"
        onPrimaryPress={onPrimaryPress}
        onClose={jest.fn()}
      />,
    );

    fireEvent(screen.getByDisplayValue('Bicycle'), 'submitEditing');
    expect(onPrimaryPress).toHaveBeenCalled();
  });

  it('calls onPrimaryPress when the primary pill is pressed, disabled when primaryDisabled', () => {
    const onPrimaryPress = jest.fn();
    const {rerender} = render(
      <FormSheet
        visible
        title="Rename section"
        fields={[{key: 'name', value: '', onChangeValue: jest.fn()}]}
        primaryLabel="Save"
        onPrimaryPress={onPrimaryPress}
        primaryDisabled
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Save'));
    expect(onPrimaryPress).not.toHaveBeenCalled();

    rerender(
      <FormSheet
        visible
        title="Rename section"
        fields={[{key: 'name', value: 'Gear', onChangeValue: jest.fn()}]}
        primaryLabel="Save"
        onPrimaryPress={onPrimaryPress}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByText('Save'));
    expect(onPrimaryPress).toHaveBeenCalled();
  });

  it('renders the destructive action and fires it on press', () => {
    const onDestructivePress = jest.fn();
    render(
      <FormSheet
        visible
        title="Rename section"
        fields={[{key: 'name', value: 'Gear', onChangeValue: jest.fn()}]}
        primaryLabel="Save"
        onPrimaryPress={jest.fn()}
        onClose={jest.fn()}
        destructiveLabel="Delete section"
        onDestructivePress={onDestructivePress}
      />,
    );

    fireEvent.press(screen.getByText('Delete section'));
    expect(onDestructivePress).toHaveBeenCalled();
  });

  it('keeps the primary button above the keyboard and lets a swipe or a tap outside the input dismiss it', () => {
    render(
      <FormSheet
        visible
        title="New item"
        fields={[{key: 'name', value: '', onChangeValue: jest.fn()}]}
        primaryLabel="Add"
        onPrimaryPress={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.keyboardDismissMode).toBe('interactive');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
