import React from 'react';
import {render, screen} from '@testing-library/react-native';
import {GoalReport} from '../GoalReport';
import {GoalStaggered} from '../GoalStaggered';
import {GoalStacked} from '../GoalStacked';
import {GoalPhoto} from '../GoalPhoto';
import {GoalFinish} from '../GoalFinish';
import {GoalInset} from '../GoalInset';
import {GoalDuotone} from '../GoalDuotone';
import {GoalRibbon} from '../GoalRibbon';
import {DUOTONE_MATRIX, fitTitle, glyphBleed} from '../parts';
import type {GoalTemplateProps} from '../types';
import type {GoalRecap} from '../../recap';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
jest.mock('react-native-color-matrix-image-filters', () => {
  const {View} = require('react-native');
  return {Grayscale: View, ColorMatrix: View};
});
jest.mock('../../../../../assets/img/shareTemplates/logos/ride_w.png', () => 1, {virtual: true});
jest.mock('../../../../../assets/img/shareTemplates/logos/symbol.png', () => 1, {virtual: true});

const recap: GoalRecap = {
  start: new Date(2026, 6, 11),
  end: new Date(2026, 8, 21),
  days: 73,
  distanceKm: 395.2,
  elevationM: 2924,
  rides: 13,
  movingHours: 19.3,
  activeDays: 13,
  longestRideKm: 40.8,
  everests: 2924 / 8849,
};

const base: GoalTemplateProps = {
  goalTitle: 'Climbing Skill Enhancement',
  tier: 'epic',
  recap,
  dates: {
    range: 'Jul 11 — Sep 21, 2026',
    rangeShort: 'Jul 11 — Sep 21',
    start: 'Jul 11',
    finish: 'Sep 21',
    completedNumeric: '09/21/2026',
  },
  backgroundType: 'dark',
};

const photo = {backgroundType: 'photo' as const, backgroundImage: 'file:///ride.jpg'};

describe('goal templates', () => {
  it('Report: title, pills and a 2x2 of big numbers', () => {
    render(<GoalReport {...base} />);
    expect(screen.getByText('Climbing Skill Enhancement')).toBeTruthy();
    expect(screen.getByText('goalTier.epic')).toBeTruthy();
    expect(screen.getByText('goalDetails.completed')).toBeTruthy();
    expect(screen.getByText('395')).toBeTruthy();
    expect(screen.getByText('2924')).toBeTruthy();
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
    expect(screen.queryByText('goalShare.everestVs')).toBeNull();
  });

  it('Report: no tier pill for a base goal', () => {
    render(<GoalReport {...base} tier="base" />);
    expect(screen.queryByText('goalTier.base')).toBeNull();
  });

  it('Staggered: completion date line and the four numbers, with or without a photo', () => {
    const {rerender} = render(<GoalStaggered {...base} />);
    expect(screen.getByText(/09\/21\/2026/)).toBeTruthy();
    expect(screen.getByText('395')).toBeTruthy();
    rerender(<GoalStaggered {...base} {...photo} isGrayscale />);
    expect(screen.getByText('2924')).toBeTruthy();
  });

  it('Stacked: ledger values with units and the Everest ratio', () => {
    render(<GoalStacked {...base} />);
    expect(screen.getByText(/^395/)).toBeTruthy();
    expect(screen.getByText(/^40\.8/)).toBeTruthy();
    expect(screen.getByText('goalShare.everest:{"times":"×0.3"}')).toBeTruthy();
  });

  it('Photo: stats card over the photo', () => {
    render(<GoalPhoto {...base} {...photo} />);
    expect(screen.getByText('goalShare.label.hours')).toBeTruthy();
    expect(screen.getByText('19')).toBeTruthy();
  });

  it('Finish line: start/finish track at 100%', () => {
    render(<GoalFinish {...base} />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Jul 11')).toBeTruthy();
    expect(screen.getByText('Sep 21')).toBeTruthy();
  });

  it('Inset: 2x2 numbers grid, no handwritten line', () => {
    render(<GoalInset {...base} />);
    expect(screen.getByText('395')).toBeTruthy();
    expect(screen.getByText('goalShare.label.distanceKm')).toBeTruthy();
    expect(screen.getByText('goalShare.label.elevationM')).toBeTruthy();
    expect(screen.getByText('goalShare.label.rides')).toBeTruthy();
    expect(screen.getByText('goalShare.label.saddleH')).toBeTruthy();
    expect(screen.queryByText('goalShare.inset.script')).toBeNull();
  });

  it('Duotone: plain title and a 2x2 numbers grid, no serif tagline', () => {
    render(<GoalDuotone {...base} {...photo} />);
    expect(screen.getByText('Climbing Skill Enhancement')).toBeTruthy();
    expect(screen.getByText('395')).toBeTruthy();
    expect(screen.queryByText('goalShare.tagline.worthLower')).toBeNull();
  });

  it('Ribbon: bracketed ledger, ribbon text in the label, no COMPLETED', () => {
    render(<GoalRibbon {...base} />);
    expect(screen.queryByText('goalShare.completedLabel')).toBeNull();
    expect(screen.getByText('[01]')).toBeTruthy();
    expect(screen.getByText('[05]')).toBeTruthy();
    expect(screen.getByText(/goalTier\.epic goalShare\.ribbonGoal/)).toBeTruthy();
  });
});

describe('DUOTONE_MATRIX', () => {
  it('is a 4x5 colour matrix that keeps alpha', () => {
    expect(DUOTONE_MATRIX).toHaveLength(20);
    expect(DUOTONE_MATRIX.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
});

describe('fitTitle', () => {
  const metrics = {fontSize: 150, lineHeight: 130, letterSpacing: -6};

  it('keeps full size when the title already fits', () => {
    expect(fitTitle('Base', {...metrics, width: 936, lines: 2}).fontSize).toBe(150);
  });

  it('shrinks until the title wraps into the allowed lines — not to one tiny line', () => {
    const two = fitTitle('Climbing Skill Enhancement', {...metrics, width: 936, lines: 2});
    const one = fitTitle('Climbing Skill Enhancement', {...metrics, width: 936, lines: 1});
    expect(two.fontSize).toBeLessThan(150);
    expect(two.fontSize).toBeGreaterThan(one.fontSize * 1.5);
    expect(two.lineHeight / two.fontSize).toBeCloseTo(130 / 150, 1);
  });

  it('shrinks a single long word to the width', () => {
    const r = fitTitle('Сверхмарафонский', {...metrics, width: 600, lines: 3});
    expect(r.fontSize).toBeLessThan(80);
  });
});

describe('glyphBleed', () => {
  it('reserves room for ascenders when leading is tighter than the font', () => {
    expect(glyphBleed(150, 130)).toBe(38);
    expect(glyphBleed(20, 40)).toBe(0);
  });
});
