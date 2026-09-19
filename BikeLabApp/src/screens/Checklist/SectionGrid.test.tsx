import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react-native';
import {SectionGrid} from './SectionGrid';
import {groupBySection} from './lib';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));

const rows = [
  {id: 1, section: 'What to buy', item: 'Bicycle', checked: true},
  {id: 2, section: 'What to buy', item: 'Helmet', checked: false, link: 'https://www.rei.com/x'},
] as any;

describe('SectionGrid', () => {
  it('renders a card per item, testID-tagged, with the checked one showing the green tick', () => {
    const [section] = groupBySection(rows);
    render(
      <SectionGrid
        section={section}
        cardWidth={100}
        onToggleItem={jest.fn()}
        onLongPressItem={jest.fn()}
        onAddItem={jest.fn()}
        onEditSection={jest.fn()}
      />,
    );

    expect(screen.getByText('WHAT TO BUY')).toBeTruthy();
    expect(screen.getByTestId('checklist-item-1')).toBeTruthy();
    expect(screen.getByTestId('checklist-item-2')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getAllByTestId('checklist-check-done')).toHaveLength(1);
    expect(screen.getAllByTestId('checklist-check-open')).toHaveLength(1);
    expect(screen.getByText('rei.com')).toBeTruthy();
  });

  it('toggles an item on press and opens its detail sheet on long press', () => {
    const [section] = groupBySection(rows);
    const onToggleItem = jest.fn();
    const onLongPressItem = jest.fn();
    render(
      <SectionGrid
        section={section}
        cardWidth={100}
        onToggleItem={onToggleItem}
        onLongPressItem={onLongPressItem}
        onAddItem={jest.fn()}
        onEditSection={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('checklist-item-2'));
    expect(onToggleItem).toHaveBeenCalledWith(expect.objectContaining({id: 2}));

    fireEvent(screen.getByTestId('checklist-item-2'), 'longPress');
    expect(onLongPressItem).toHaveBeenCalledWith(expect.objectContaining({id: 2}));
  });

  it('opens an inline input and adds an item to this section', () => {
    const [section] = groupBySection(rows);
    const onAddItem = jest.fn();
    render(
      <SectionGrid
        section={section}
        cardWidth={100}
        onToggleItem={jest.fn()}
        onLongPressItem={jest.fn()}
        onAddItem={onAddItem}
        onEditSection={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('checklist-add-item'));
    fireEvent.changeText(screen.getByPlaceholderText('checklist.addItemPlaceholder'), 'Bibs');
    fireEvent.press(screen.getByText('checklist.add'));

    expect(onAddItem).toHaveBeenCalledWith('What to buy', 'Bibs');
  });

  it('opens the section rename/delete sheet from the header pencil', () => {
    const [section] = groupBySection(rows);
    const onEditSection = jest.fn();
    render(
      <SectionGrid
        section={section}
        cardWidth={100}
        onToggleItem={jest.fn()}
        onLongPressItem={jest.fn()}
        onAddItem={jest.fn()}
        onEditSection={onEditSection}
      />,
    );

    fireEvent.press(screen.getByText('WHAT TO BUY').parent!);
    expect(onEditSection).toHaveBeenCalled();
  });
});
