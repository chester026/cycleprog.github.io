import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {BackgroundPicker, BackgroundPickerVariant} from './BackgroundPicker';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({t: (key: string) => key}),
}));
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}));
jest.mock('../../assets/img/shareTemplates/template1.webp', () => 1, {virtual: true});
jest.mock('../../assets/img/shareTemplates/template2.webp', () => 1, {virtual: true});
jest.mock('../../assets/img/shareTemplates/template5.webp', () => 1, {virtual: true});

const noop = () => {};

describe('BackgroundPicker', () => {
  const variants: Array<[BackgroundPickerVariant, string[]]> = [
    ['bigStats', ['shareStudio.brand1', 'shareStudio.png', 'shareStudio.photo']],
    ['charts', ['shareStudio.brand1', 'shareStudio.brand5', 'shareStudio.brand2', 'shareStudio.png', 'shareStudio.photo']],
    ['minimal', ['shareStudio.brand2', 'shareStudio.png', 'shareStudio.photo']],
    ['simple', ['shareStudio.png', 'shareStudio.photo']],
    ['goalDark', ['shareStudio.dark', 'shareStudio.photo']],
    ['goalPhoto', ['shareStudio.photo']],
  ];

  it.each(variants)('renders the %s variant with its own set of options', (variant, expectedLabels) => {
    render(
      <BackgroundPicker
        variant={variant}
        selectedType="transparent"
        onSelectType={noop}
        onSelectImage={noop}
      />,
    );

    expect(screen.getByText('shareStudio.background')).toBeTruthy();
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('does not offer a brand option for the simple variant', () => {
    render(<BackgroundPicker variant="simple" selectedType="transparent" onSelectType={noop} onSelectImage={noop} />);
    expect(screen.queryByText('shareStudio.brand1')).toBeNull();
    expect(screen.queryByText('shareStudio.brand2')).toBeNull();
  });

  it('does not offer a transparent PNG for the goal templates', () => {
    render(<BackgroundPicker variant="goalDark" selectedType="dark" onSelectType={noop} onSelectImage={noop} />);
    expect(screen.queryByText('shareStudio.png')).toBeNull();
  });
});
