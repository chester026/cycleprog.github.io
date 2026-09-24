/**
 * Building blocks shared by the eight goal share templates
 * ("Goal Share Screens v5"): canvas, the Goals-section pastel wash, the
 * RIDE→→WISELY lockup, pills, the title, photo layers and number helpers.
 */
import React from 'react';
import {View, Text, Image, StyleSheet, Platform, StyleProp, TextStyle, ViewStyle} from 'react-native';
import Svg, {Defs, RadialGradient, Stop, Rect, Line, Polyline, Path} from 'react-native-svg';
import {useTranslation} from 'react-i18next';
import {Grayscale, ColorMatrix} from 'react-native-color-matrix-image-filters';
import {TIER_CONFIG} from '@bikelab/shared/constants';
import {TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from '../../types';
import {formatRecapKm, formatBigNumber, formatRecapHours, type GoalRecap} from '../recap';
import {colors} from '../../../../theme';

const symbolLogo = require('../../../../assets/img/shareTemplates/logos/symbol.png');
const rideWLogo = require('../../../../assets/img/shareTemplates/logos/ride_w.png');

export const W = TEMPLATE_WIDTH;
export const H = TEMPLATE_HEIGHT;
/**
 * The white vertical brand symbol for the blue page — the same mark as
 * assets/img/logo/BLWhiteVert.png, drawn from its vector source
 * (assets/img/logo/whiteVert.svg, viewBox 69x140) so it stays sharp in the
 * 1080px export; the 54x110 PNG would be upscaled ~2x and go soft. Replaces
 * a made-up white square with a "B" in it.
 */
const WHITE_SYMBOL_PATH =
  'M68.8643 112.707V139.407H51.4287C49.772 139.407 48.4289 138.064 48.4287 136.407V135.613C48.4287 130.971 48.8984 127.178 49.8379 124.232C52.321 116.549 57.0363 112.707 63.9824 112.707H68.8643ZM68.7637 78.6123V104.448H0.140625V78.6123H68.7637ZM40.9492 0C49.5477 6.57058e-05 56.1191 2.05162 60.6631 6.15332C64.8224 9.88817 66.9023 14.74 66.9023 20.709C66.9023 26.6449 64.3158 30.9474 59.1426 33.6152H58.9854C65.6614 36.2497 69 40.9686 69 47.7715C68.9999 54.0073 66.7097 58.9094 62.1309 62.4775C57.3422 66.2124 50.5436 68.0801 41.7354 68.0801H36.9111V0H40.9492ZM28.208 67.9795H0V0H28.208V67.9795Z';
const WHITE_SYMBOL_VIEWBOX = {w: 69, h: 140};
// Sized by eye against the 48px wordmark (owner-tuned): a touch taller than
// the mark inside the blue tab (~47px), with a smaller mark→wordmark gap
// than the tab's padding would give — the tab's 36px read as too loose
// without the tab around it.
const LOCKUP_SYMBOL_H = 56;
const INVERSE_SYMBOL_EXTRA_GAP = 12;
/** Side margin of most layouts in the design. */
export const PAD = 72;

const g = colors.share.goal;

/** iOS ships no serif display face with the app, so this uses the closest system one. */
export const SERIF_FONT = Platform.select({ios: 'Georgia', default: 'serif'});

/** 1080x1920, clipped — ribbons and ghost type bleed off the edges. */
export const GoalCanvas: React.FC<{backgroundColor: string; children: React.ReactNode}> = ({backgroundColor, children}) => (
  <View style={[s.canvas, {backgroundColor}]}>{children}</View>
);

/** Soft blue→violet wash across the top, fading into the light page (Report, Finish line). */
export const PastelWash: React.FC = () => (
  <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
    <Defs>
      <RadialGradient id="washBlue" cx={W * 0.26} cy={-60} r={760} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={g.washBlue} stopOpacity={1} />
        <Stop offset="1" stopColor={g.washBlue} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="washViolet" cx={W * 0.95} cy={-20} r={760} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={g.washViolet} stopOpacity={1} />
        <Stop offset="1" stopColor={g.washViolet} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect x={0} y={0} width={W} height={H} fill={g.lightBg} />
    <Rect x={0} y={0} width={W} height={H} fill="url(#washViolet)" />
    <Rect x={0} y={0} width={W} height={H} fill="url(#washBlue)" />
  </Svg>
);

/** Navy glow in the top-right corner of the dark page (Staggered). */
export const DarkGlow: React.FC = () => (
  <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
    <Defs>
      <RadialGradient id="darkGlow" cx={W} cy={0} r={900} gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={g.darkGlow} stopOpacity={0.9} />
        <Stop offset="1" stopColor={g.darkGlow} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect x={0} y={0} width={W} height={H} fill="url(#darkGlow)" />
  </Svg>
);

type LockupTone = 'onLight' | 'onDark' | 'inverse';

/**
 * "B | RIDE→→ WISELY": the blue B tab plus the wordmark. `inverse` (on the
 * blue page) swaps the tab for the white vertical brand symbol.
 */
export const BrandLockup: React.FC<{tone: LockupTone; style?: StyleProp<ViewStyle>; showSymbol?: boolean}> = ({
  tone,
  style,
  showSymbol = true,
}) => (
  <View style={[s.lockup, style]}>
    {showSymbol ? (
      tone === 'inverse' ? (
        <Svg
          width={(LOCKUP_SYMBOL_H * WHITE_SYMBOL_VIEWBOX.w) / WHITE_SYMBOL_VIEWBOX.h}
          height={LOCKUP_SYMBOL_H}
          style={{marginRight: INVERSE_SYMBOL_EXTRA_GAP}}
          viewBox={`0 0 ${WHITE_SYMBOL_VIEWBOX.w} ${WHITE_SYMBOL_VIEWBOX.h}`}>
          <Path d={WHITE_SYMBOL_PATH} fill={colors.text.inverse} />
        </Svg>
      ) : (
        <View style={s.symbolBox}>
          <Image source={symbolLogo} style={s.symbolImage} resizeMode="contain" />
        </View>
      )
    ) : null}
    <Image
      source={rideWLogo}
      style={[s.wordmark, tone === 'onLight' && {tintColor: g.ink}]}
      resizeMode="contain"
    />
  </View>
);

const HIGH_TIERS = new Set(['epic', 'grand', 'legendary']);

export function isHighTier(tier?: string | null): tier is 'epic' | 'grand' | 'legendary' {
  return !!tier && HIGH_TIERS.has(tier);
}

/** Filled tier pill ("EPIC"). `inverse` = white pill with tier-colored text (on the blue page). */
export const TierPill: React.FC<{tier?: string | null; inverse?: boolean; style?: StyleProp<ViewStyle>}> = ({
  tier,
  inverse,
  style,
}) => {
  const {t} = useTranslation();
  if (!isHighTier(tier)) return null;
  const cfg = TIER_CONFIG[tier];
  return (
    <View style={[s.pill, {backgroundColor: inverse ? colors.text.inverse : cfg.color}, style]}>
      <Text style={[s.tierText, inverse && {color: cfg.color}]}>{t(cfg.key)}</Text>
    </View>
  );
};

/** "● Completed" pill — white on light pages, dark grey on dark ones. */
export const CompletedPill: React.FC<{dark?: boolean}> = ({dark}) => {
  const {t} = useTranslation();
  return (
    <View style={[s.pill, s.completedPill, {backgroundColor: dark ? g.completedPillDark : colors.text.inverse}]}>
      <View style={s.dot} />
      <Text style={[s.completedText, {color: dark ? colors.text.inverse : g.ink}]}>{t('goalDetails.completed')}</Text>
    </View>
  );
};

// --- Title fitting --------------------------------------------------------
// iOS's adjustsFontSizeToFit mis-measures these titles (line height below the
// font size, tight tracking): a two-line title came out as one tiny line. So
// the size is computed up front from approximate SF Pro Black advances
// (in em) and a greedy word wrap, then rendered at a fixed size.
const NARROW = new Set([...'iljtfrI!.,:;\'’|()[]-']);
const WIDE = new Set([...'mwMWШЩЖЮМшщжюм@%']);
function charEm(ch: string): number {
  if (ch === ' ') return 0.28;
  if (NARROW.has(ch)) return 0.32;
  if (WIDE.has(ch)) return 0.9;
  if (/[0-9]/.test(ch)) return 0.62;
  if (ch !== ch.toLowerCase()) return 0.7; // capitals
  return 0.6;
}

export interface TitleMetrics {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

/** Largest scale (<= 1) at which `title` wraps into at most `lines` lines of `width`. */
export function fitTitle(
  title: string,
  opts: TitleMetrics & {width: number; lines: number; minScale?: number},
): TitleMetrics {
  const {width, lines, minScale = 0.35} = opts;
  const words = title.trim().split(/\s+/).filter(Boolean);
  const room = width * 0.96; // estimate, keep a margin
  for (let scale = 1; scale >= minScale; scale -= 0.02) {
    const fs = opts.fontSize * scale;
    const ls = opts.letterSpacing * scale;
    const wordW = (w: string) => [...w].reduce((sum, ch) => sum + charEm(ch) * fs + ls, 0);
    const spaceW = charEm(' ') * fs + ls;
    let count = 1;
    let line = 0;
    let fits = true;
    for (const w of words) {
      const ww = wordW(w);
      if (ww > room) {
        fits = false;
        break;
      }
      if (line === 0) line = ww;
      else if (line + spaceW + ww <= room) line += spaceW + ww;
      else {
        count += 1;
        line = ww;
      }
    }
    if (fits && count <= lines) {
      return {fontSize: Math.round(fs), lineHeight: Math.round(opts.lineHeight * scale), letterSpacing: ls};
    }
  }
  return {
    fontSize: Math.round(opts.fontSize * minScale),
    lineHeight: Math.round(opts.lineHeight * minScale),
    letterSpacing: opts.letterSpacing * minScale,
  };
}

interface GoalTitleProps extends TitleMetrics {
  title: string;
  /** Box width the title wraps in. */
  width: number;
  lines?: number;
  /** Colour, weight, position — size comes from fitTitle. */
  style: StyleProp<TextStyle>;
}

/**
 * Tight leading (line height below the font size, as in the design) makes
 * iOS clip the first line's ascenders — the tops of "C", "l", "b" — and the
 * last line's descenders at the Text's own bounds. The fix is room INSIDE
 * the box (padding the glyphs can draw into) cancelled by equal negative
 * margins, so the title stays exactly where the layout puts it.
 */
export function glyphBleed(fontSize: number, lineHeight: number): number {
  return Math.max(0, Math.round(fontSize - lineHeight + fontSize * 0.12));
}

/** The goal's title at the largest size that fits `lines` lines of `width`. */
export const GoalTitle: React.FC<GoalTitleProps> = ({title, width, lines = 2, style, ...metrics}) => {
  const fitted = fitTitle(title, {...metrics, width, lines});
  const bleed = glyphBleed(fitted.fontSize, fitted.lineHeight);
  const marginTop = Number(StyleSheet.flatten(style)?.marginTop) || 0;
  return (
    <Text
      style={[
        style,
        {width},
        fitted,
        {paddingTop: bleed, paddingBottom: bleed, marginTop: marginTop - bleed, marginBottom: -bleed},
      ]}
      numberOfLines={lines}>
      {title}
    </Text>
  );
};

interface PhotoLayerProps {
  uri?: string;
  isGrayscale?: boolean;
  /** Maps the photo onto a navy→blue duotone instead of full colour. */
  duotone?: boolean;
}

/** Full-bleed user photo (optionally B&W or duotone). Renders nothing without a photo. */
export const PhotoLayer: React.FC<PhotoLayerProps> = ({uri, isGrayscale, duotone}) => {
  if (!uri) return null;
  const image = <Image source={{uri}} style={s.fill} resizeMode="cover" />;
  if (duotone) {
    return (
      <ColorMatrix matrix={DUOTONE_MATRIX} style={s.fill}>
        {image}
      </ColorMatrix>
    );
  }
  return isGrayscale ? <Grayscale style={s.fill}>{image}</Grayscale> : image;
};

// Luminance -> lerp(duotoneDark, duotoneLight). Offsets are 0..1 on iOS and
// 0..255 on Android in this library (see rn-color-matrices' `bias`).
function hexToUnit(hex: string): [number, number, number] {
  const c = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return [c(0), c(1), c(2)];
}
const BIAS = Platform.OS === 'ios' ? 1 : 255;
const [dr, dg, db] = hexToUnit(g.duotoneDark);
const [lr, lg, lb] = hexToUnit(g.duotoneLight);
const lumRow = (dark: number, light: number) => {
  const d = light - dark;
  return [0.2126 * d, 0.7152 * d, 0.0722 * d, 0, dark * BIAS];
};
type Matrix = React.ComponentProps<typeof ColorMatrix>['matrix'];
export const DUOTONE_MATRIX = [...lumRow(dr, lr), ...lumRow(dg, lg), ...lumRow(db, lb), 0, 0, 0, 1, 0] as unknown as Matrix;

/** The long "⟶" arrow of the Inset and Ribbon sign-offs. */
export const LongArrow: React.FC<{width?: number; color?: string; style?: StyleProp<ViewStyle>}> = ({
  width = 160,
  color = colors.text.inverse,
  style,
}) => (
  <Svg width={width} height={34} style={style}>
    <Line x1={0} y1={17} x2={width - 3} y2={17} stroke={color} strokeWidth={3} />
    <Polyline points={`${width - 18},2 ${width - 3},17 ${width - 18},32`} fill="none" stroke={color} strokeWidth={3} />
  </Svg>
);

export type RecapStatKey = 'distance' | 'elevation' | 'rides' | 'hours' | 'days' | 'longest';

/** Display value of one recap number (no unit). */
export function recapStatValue(recap: GoalRecap, key: RecapStatKey): string {
  switch (key) {
    case 'distance':
      return formatRecapKm(recap.distanceKm);
    case 'elevation':
      return formatBigNumber(recap.elevationM);
    case 'rides':
      return formatBigNumber(recap.rides);
    case 'hours':
      return formatRecapHours(recap.movingHours);
    case 'days':
      return formatBigNumber(recap.days);
    case 'longest':
      return formatRecapKm(recap.longestRideKm);
  }
}

const s = StyleSheet.create({
  canvas: {
    width: W,
    height: H,
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    width: W,
    height: H,
  },
  // Symbol scaled 1.5x against an unchanged wordmark (owner: the B tab read
  // too small next to the two-line wordmark) — keep the crop offsets in
  // proportion with the symbol when changing it again.
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // The box is exactly the visible tab: symbol.png is 160x198 with the tab at
  // x 13..146, y 15..183 (133x168). The image is drawn at scale k = 117/168
  // and shifted by the padding, so the tab's left edge sits on the lockup's
  // left edge — i.e. on the same line as the content below it (owner: the
  // old contain-fit left ~10px of transparent padding before the tab).
  symbolBox: {
    width: 93,
    height: 117,
    overflow: 'hidden',
  },
  symbolImage: {
    width: 111.4,
    height: 137.9,
    marginLeft: -9.05,
    marginTop: -10.45,
  },
  wordmark: {
    width: 126,
    height: 48,
  },
  pill: {
    height: 52,
    paddingHorizontal: 26,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierText: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.text.inverse,
  },
  completedPill: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: g.completedDot,
  },
  completedText: {
    fontSize: 25,
    fontWeight: '700',
  },
});
