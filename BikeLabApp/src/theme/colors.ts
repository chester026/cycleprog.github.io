// Semantic color tokens — T-5.4 (audit A-27).
//
// The app today is dark-first with occasional bright "pop" cards (white
// cards with dark ink text, floating on the dark screen background). These
// tokens preserve every hex value already in use across the app; nothing
// was re-colored. See `README.md` in this folder for the full raw-color
// inventory and how it maps into these names.

/** Converts a `#rgb`/`#rrggbb` hex string to `rgba(r, g, b, alpha)`.
 * Used instead of hand-picking dozens of one-off translucency tokens —
 * matches the app's existing `rgba(R, G, B, alpha)` literals exactly
 * (e.g. `withOpacity('#1a1a1a', 0.7)` === `'rgba(26, 26, 26, 0.7)'`).
 */
export function withOpacity(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map(c => c + c)
      .join('');
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const colors = {
  // App/screen background (modals, ShareStudio dark templates: #0a0a0a).
  background: '#0a0a0a',
  // Dark elevated surface (cards/panels sitting on `background`).
  surface: '#1A1A1A',
  // Slightly lighter dark card surface (#222), widely reused across the
  // *Analysis/ShareStudio dark cards — distinct shade from `surface`.
  surfaceDark: '#222222',
  // Dark card surface (#212121), a shade between `surface` and
  // `surfaceDark` — SkillsRadarChart's profile badge, ShareStudio's
  // template carousel.
  surfaceDarkAlt: '#212121',
  // Dark hairline border (#2a2a2a) on dark surfaces, widely reused.
  borderDark: '#2a2a2a',
  // Bright "pop" surface — white cards used by ActivityCard/StatsCard and
  // PrimaryButton's secondary variant.
  surfaceElevated: '#ffffff',
  // Very light gray "pop" surface (#f8f8fa) — ProgressChart's card and a
  // few Profile/Achievements screens' section backgrounds.
  surfaceLight: '#f8f8fa',
  // Light-mode screen background (#F5F5F5), widely reused by the "bright
  // card" settings/onboarding screens.
  backgroundLight: '#F5F5F5',
  // Light hairline border/divider (#e0e0e0), widely reused.
  borderLight: '#e0e0e0',
  // Hairline border on a bright surface (ActivityCard card border).
  border: '#ECECEC',
  // Slightly lighter hairline border variant (PrimaryButton secondary).
  borderSubtle: '#EFEFEF',
  // iOS-style hairline separator (#C7C7CC), widely reused across
  // screens/components for list dividers and input borders.
  separator: '#C7C7CC',
  // Very light hairline divider on bright surfaces (#f0f0f0), distinct from
  // `border`/`separator` — used between list rows.
  divider: '#f0f0f0',
  // Disabled control background/text/icon gray (#ccc), reused across
  // buttons, badges and inactive icons.
  disabled: '#cccccc',

  text: {
    // Dark ink, used on bright surfaces (#1a1a1a / #1A1A1A in the wild).
    primary: '#1a1a1a',
    // Secondary/dimmed text on bright surfaces (#666).
    secondary: '#666666',
    // Muted/tertiary text (#888).
    muted: '#888888',
    // Text on dark/accent surfaces (#fff).
    inverse: '#ffffff',
    // Near-black ink (#0E0E12), a shade darker than `primary` — used by the
    // coach rich chat cards for numeric/emphasis text.
    deepInk: '#0E0E12',
    // iOS system muted-label gray (#8E8E93), distinct from `muted`.
    iosMuted: '#8E8E93',
    // Lighter muted gray (#999), used where `muted`/`iosMuted` read too dark.
    faint: '#999999',
    // iOS system gray 3-ish tone (#AEAEB2) — BikeOnboarding's "original"
    // component value + slider labels.
    iosMutedLight: '#AEAEB2',
    // TextInput placeholder gray (#aaaaaa), used across EventForm's inputs.
    placeholder: '#aaaaaa',
  },

  // Brand blue — primary CTA / active state (#274dd3).
  accent: '#274dd3',
  // Tinted accent surface + border, used behind small accent chips
  // (ActivityCard's "AI Analytic" pill).
  accentSurface: 'rgba(39, 77, 211, 0.08)',
  accentSurfaceBorder: 'rgba(39, 77, 211, 0.1)',

  success: '#10b981',
  // A second, brighter green (#4CAF50) reused across SpeedAnalysis's chart
  // line, achievements' completed state and other "done"/positive accents —
  // a distinct shade from `success`, not a typo (see theme README).
  successAlt: '#4CAF50',
  // Distinct darker green used by the scoreDelta/TrendBadge convention
  // (ProgressChart, TrendBadge, PowerAnalysis/HeartAnalysis/
  // CadenceAnalysis/GarageScreen positive-trend text) — kept separate from
  // `success` since it's a different shade already in use, not a typo.
  successStrong: '#16a34a',
  warning: '#f59e0b',
  danger: '#ef4444',
  // Light pink danger surface, used by PrimaryButton's danger variant (#FDECEC).
  dangerSurface: '#FDECEC',
  // A second, more saturated red (#DC2626) reused for error text across
  // SyncToAppleCalendarPrompt and SkillsRadarChart's negative trend — a
  // distinct shade from `danger`, not a typo.
  dangerStrong: '#DC2626',

  // Shadow color for elevated bright cards (#10101E) — see shadows.ts.
  shadow: '#10101E',
  // Pure black, used as the base for `withOpacity`-derived translucent
  // overlays/muted text on bright surfaces (e.g. StatsCard's statLabel).
  black: '#000000',
  // Dark scrim over background images (TrainingCard overlay).
  scrim: 'rgba(0, 0, 0, 0.3)',
  // Near-black "ink" (#191b20), a shade lighter than `black` — used as both
  // text and background across GoalsPanel's active tab, WeatherBlock and
  // LastRideHero.
  ink: '#191b20',

  chart: {
    series1: '#274dd3',
    series2: '#10b981',
    series3: '#FF5E00',
    series4: '#8B5CF6',
    series5: '#00B2FF',
    series6: '#f59e0b',
    // Axis/rule line color on dark chart backgrounds (react-native-
    // gifted-charts' xAxisColor/rulesColor across the *Analysis charts).
    axisLine: '#333333',
    // Legend text on a dark chart card (TrendLineChart's legend row).
    legendTextOnDark: '#f6f8ff',
    // Muted caption/description text under a dark chart card.
    caption: '#6b7280',
    // PowerAnalysis's rich-overlay accent (also TrendLineChart's default).
    powerAccent: '#7eaaff',
    // TrendLineChart's RichChartDetail overlay background.
    richOverlayBg: '#2B2B2B',
    // ProgressChart's bright-card line/pointer/block-label blue.
    progressLine: '#3d9bf9',
    // Axis line + axis/label text on ProgressChart/SkillsRadarChart's
    // bright-card (light background) gifted-charts instances.
    axisLineLight: '#e1e1e1',
    axisTextLight: '#94a3b8',
    // SkillsRadarChart's SVG grid circles/axis lines.
    radarGrid: '#3b4252',
  },

  // ProgressChart's effort-rate categories (excellent/good/steady/low/
  // offPlan) — also used for per-metric breakdown values.
  score: {
    good: '#3b82f6',
    low: '#f97316',
  },

  // FTPAnalysis's VO2max scale.
  vo2max: {
    // 5-stop gradient underlying the beginner→world-class scale bands.
    gradient: ['#e77c31', '#f1c244', '#b3e450', '#7adb87', '#55b3d1', '#4f80f0'],
    indicatorLine: '#565863',
    indicatorBadgeBg: '#24272a',
    labelText: '#aaaaaa',
  },

  // MetricAnalysisSection's big translucent uppercase title + "no data" text
  // (shared shell for Heart/Speed/Cadence/Power *Analysis components).
  analysis: {
    bigTitle: '#d6d6d6',
    noData: '#b0b8c9',
    // PowerAnalysis's "with wind data" / "power meter" highlighted stat
    // cards — dark green variants distinct from the regular card bg.
    windCardBg: '#1a4d2e',
    powerMeterCardBg: '#0d5c3a',
    // SpeedAnalysis's max-speed bar chart — a darker green than `successAlt`.
    speedMaxBar: '#388B3C',
    // SpeedAnalysis's hill-terrain trend chart accent.
    speedHillsAccent: '#FF9800',
  },

  // MetaGoalCard's "expired" (past target date, still open) flat-grey state.
  goals: {
    expiredBorder: '#E4E4E4',
    expiredBg: '#F4F4F4',
    expiredBadgeBg: '#EDEDED',
  },

  // BikeGarage screen's bike-selector pill row / component detail sheet.
  garage: {
    pillBorder: '#D1D1D6',
    // ComponentDetailSheet's health-percent progress-bar track.
    barTrack: '#EBEBED',
    // ComponentDetailSheet's row divider — distinct shade from `divider`.
    divider: '#F0F0F2',
    // OverviewCard's health-gauge track ring.
    gaugeTrack: '#DDDDE0',
    // OverviewCard's "ask coach" footer strip background.
    coachFooterBg: '#F1F3F8',
  },

  // BestAvgSpeedWidget's monthly bar chart.
  speedWidget: {
    cardBg: '#f1f0f0',
    selectedBar: '#7DA6FF',
    inactiveBar: '#ACB6D1',
  },

  // src/assets/img/icons/*'s shared default `color` prop values.
  icon: {
    // Most icons' default (AddPhoto/Altitude/Calendar/CardioLoad/
    // DirectionsBike/Home/Share).
    default: '#e3e3e3',
    // EditIcon/TrashIcon's darker default.
    dark: '#333',
    // MicIcon's default.
    muted: '#666',
  },

  // AIAnalysisModal's error state text.
  aiAnalysis: {
    errorText: '#ff5e5e',
  },

  // ShareStudio — export-card templates. Intentionally colorful/one-off
  // per template; grouped by template + role rather than by hue (see
  // README.md). `gradients` are the shared preset backgrounds offered by
  // BackgroundPicker, independent of any one template.
  share: {
    gradients: {
      dark: ['#0a0a0a', '#1a1a2e', '#16213e'],
      blue: ['#0f2027', '#203a43', '#2c5364'],
      purple: ['#0f0c29', '#302b63', '#24243e'],
      sunset: ['#0f0c29', '#4a2c2a', '#1a1a2e'],
    },
    // Semi-transparent white text shades shared by more than one export-card
    // template (opaque white and the brand blue reuse `text.inverse` /
    // `accent` directly instead of being duplicated here).
    mutedWhite50: 'rgba(255, 255, 255, 0.5)', // TemplateD's mini-chart title, TemplateF's chart label
    mutedWhite60: 'rgba(255, 255, 255, 0.6)', // TemplateA's date, TemplateC's light stat label, TemplateF's bottom-stat icon
    // Template-specific one-off values, named by template + role.
    templateB: {
      // Bottom fade so the stats overlay reads over a busy map/photo. The
      // leading fully-transparent stops are the `'transparent'` keyword, not
      // a color value, and stay as literals at the call site.
      gradientFadeDark: ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.75)'],
      mutedLabel: 'rgba(255,255,255,0.45)',
      // RouteMap's "no route data" placeholder (shown in place of the map).
      mapPlaceholderBg: '#111',
      mapPlaceholderText: 'rgba(255,255,255,0.2)',
    },
    templateC: {
      gradientTop: ['rgba(11, 30, 97, 0.2)', 'rgba(39, 77, 211, 0.15)'],
      gradientBottom: ['rgba(0, 0, 0, 0.15)', 'rgba(0, 0, 0, 0.86)'],
    },
    templateD: {
      gradientTop: ['rgba(11, 30, 97, 0.05)', 'rgba(39, 48, 211, 0.1)'],
      gradientBottom: ['rgba(0, 0, 0, 0)', 'rgba(1, 1, 8, 0.78)'],
    },
    templateF: {
      mutedTitle: 'rgba(255, 255, 255, 0.8)',
    },
    // BackgroundPicker's checkerboard ("transparent" option) and photo-add
    // circle — dark-neutral shades with no existing generic token.
    picker: {
      checkerLight: '#ccc',
      checkerDark: '#444',
      // `checkerDarkVariantDark` reuses `icon.dark`'s exact value (#333).
      photoCircleBg: '#3a3a3a',
      mutedLabel: '#999',
      // MapStylePicker's "dark map" swatch (its "light map" swatch reuses `borderLight`, #e0e0e0).
      mapDarkSwatch: '#2c2c2c',
    },
    // Dark panel background shared by ExportBar's action row and
    // ShareStudioModal's preview container.
    darkPanelBg: '#222',
    // TemplateCarousel's option card background (its thumbnail placeholder
    // reuses `surfaceDarkAlt`, #212121).
    carouselOptionBg: '#2d2d2d',
  },

  // BikesModal's stat-divider.
  bikes: {
    statDivider: '#ddd',
  },

  // CoachMemoryScreen's category pill (Profile > Coach Settings > Memory).
  coachMemory: {
    pillBg: '#EAEAEC',
    pillText: '#6B6B70',
    trashIcon: '#B0B0B5',
  },

  // AchievementsScreen's overall-progress bar track.
  achievementsProgressTrack: '#e8e8e8',

  // PersonalInfoScreen/HRZonesScreen-style settings screens' gender/segment
  // control track background.
  segmentTrackBg: '#E9E9EC',

  // ProfileScreen's settings-row divider (iOS list-separator gray, a shade
  // darker than `separator`).
  settingsDivider: '#c6c6c8',

  // BikesWidget's "see all" link — a distinct royal-blue, not `accent`.
  bikesWidgetLink: '#4169E1',

  // RideAnalyticsScreen's "Ride Quality" score-band dot/label colors
  // (7 bands, poor -> awesome; the lowest and highest band share a color).
  rideQuality: {
    poor: '#6A4CCF',
    belowAvg: '#EF6C00',
    average: '#F9A825',
    good: '#7CB342',
    wellDone: '#2BB673',
    excellent: '#5B8DEF',
    awesome: '#6A4CCF',
  },

  // GoalDetails' GoalHeader — its progress-ring gradient's second stop
  // (accent -> a lighter blue), distinct from any existing token.
  goalHeaderRingEnd: '#5B7FE8',

  // Garage screen's NutritionCalculator personalized-badge background
  // (a shade darker than `successAlt`; same value as the CSS
  // `rgb(44, 171, 42)` it replaces).
  nutritionBadgeBg: '#2CAB2A',

  // Garage screen's ChecklistPreview strip.
  checklistPreview: {
    progressTrack: '#E1E1E1',
    badgeBg: '#EbEbEb',
    badgeBorder: '#D9D9DE',
  },

  // WeatherBlock's error-state text — a distinct red from `danger` (#ef4444),
  // not a typo.
  weatherErrorText: '#e53935',

  // CoachChatScreen's chat-view screen background — an off-white a shade
  // brighter than `surfaceLight`.
  coachChatBg: '#fdfdfd',

  // RideAnalyticsScreen's screen background + the "Discuss with Coach"
  // scrim gradient's opaque bottom stop — a near-black distinct from
  // `background`/`surface`.
  rideAnalyticsBg: '#111216',

  // Garage screen's LastRideHero map card.
  lastRideHero: {
    dimOverlay: 'rgba(1, 6, 19, 0.35)',
    gradientTop: 'rgba(2, 13, 37, 0.08)',
    gradientBottom: 'rgba(24, 2, 53, 0.08)',
  },

  // KnowledgeCenterModal's dark sidebar/content panes.
  knowledgeCenter: {
    bg: '#111',
    sidebarBg: '#0d0d0d',
    contentBg: '#151515',
    bulletText: '#bbb',
  },

  // ActivityDetailsModal's dark-card muted text/icons.
  activityDetails: {
    mutedText: '#555',
    closeIcon: '#666',
  },

  // ActivitiesScreen's year-picker dropdown.
  activities: {
    // Off-white screen background, a hair lighter than `backgroundLight`.
    screenBg: '#fafafa',
    // Selected-year row tint in the year-picker modal.
    yearSelectedTint: 'rgba(0, 0, 255, 0.06)',
  },

  // StravaIntegrationScreen's brand-colored bits.
  strava: {
    // "Connected" status icon circle.
    statusOkBg: '#22c55e',
    // Strava's own brand orange (profile icon circle).
    brandOrange: '#FC4C02',
    // Benefits list's icon circle background.
    benefitIconBg: '#EDEEFB',
  },

  // Achievement medal tier text colors (AchievementCard/AchievementMiniCard).
  achievements: {
    silverText: '#6A6A6A',
    goldText: '#5a4a3a',
  },

  // DayList's day-row list (CalendarScreen).
  calendar: {
    // Day number / weekday label / list chevron, muted (non-today) shade.
    dateMuted: '#c7c7c7',
    // Background of a past/completed activity or event row.
    rowBg: '#f5f5f5',
    // Near-black solid fill — today's "play" button, WeekStrip's selected-day
    // circle, and EventDetailSheet's "Ask agent" button.
    nearBlackFill: '#111111',
    // Completed-activity checkmark icon.
    checkIcon: '#9CA3AF',
    // EventDetailSheet's description/meta-chip body text and edit/delete icons.
    bodyText: '#333333',
  },

  // Light hairline (#eee) — WeekStrip's separator, MetaGoalCard's progress
  // ring track. Distinct shade from `divider`/`border`, not a typo.
  hairline: '#eee',

  // Coach chat rich cards ("Rich Chat Cards v2" reference) — CoachCardChrome
  // and the card types built on it.
  coach: {
    // LinearGradient end stop for the card surface (accent.gradTop → white).
    cardGradientEnd: '#FFFFFF',
    // CoachCardChrome's small uppercase eyebrow label.
    eyebrowText: '#8A8A93',
    // CoachCardChrome's Divider default color.
    divider: '#F1F1F4',
    // Per-accent icon/tint/glow/border/gradient-stop set — one entry per
    // `AccentTheme` kind CoachCardChrome renders (blue/green/amber/orange/
    // red/purple/gray cards).
    accents: {
      blue: {
        icon: '#2F6BFF',
        tint: 'rgba(47, 107, 255, 0.12)',
        glow: 'rgba(47, 107, 255, 0.09)',
        border: '#E9EAF0',
        gradTop: '#FBFCFF',
      },
      green: {
        icon: '#1FB16B',
        tint: 'rgba(31, 177, 107, 0.10)',
        glow: 'rgba(20, 168, 99, 0.09)',
        border: '#E4EFE9',
        gradTop: '#F6FCF9',
      },
      amber: {
        icon: '#F5A11E',
        tint: 'rgba(245, 161, 30, 0.12)',
        glow: 'rgba(245, 161, 30, 0.08)',
        border: '#F0E7D8',
        gradTop: '#FFFAF2',
      },
      orange: {
        icon: '#FC5200',
        tint: 'rgba(252, 82, 0, 0.10)',
        glow: 'rgba(252, 82, 0, 0.08)',
        border: '#F6E2D8',
        gradTop: '#FFF8F4',
      },
      red: {
        icon: '#E5484D',
        tint: 'rgba(229, 72, 77, 0.10)',
        glow: 'rgba(229, 72, 77, 0.08)',
        border: '#F5DEDF',
        gradTop: '#FFF8F8',
      },
      // icon happens to match `chart.series4` — same purple, different role.
      purple: {
        icon: '#8B5CF6',
        tint: 'rgba(139, 92, 246, 0.12)',
        glow: 'rgba(139, 92, 246, 0.08)',
        border: '#ECE7FB',
        gradTop: '#FAF8FF',
      },
      gray: {
        icon: '#6B7280',
        tint: 'rgba(107, 114, 128, 0.10)',
        glow: 'rgba(107, 114, 128, 0.06)',
        border: '#ECECEF',
        gradTop: '#FAFAFC',
      },
    },
    // Neutral (no-score) fill for RecoveryCard/RideScoreCard's progress ring
    // and its secondary/"/100" text.
    neutralRingStart: '#D8D8DE',
    neutralRingEnd: '#B0B0B7',
    // RecoveryCard/CalendarEventCreatedCard/MetricComparisonCard row-label
    // gray, a shade darker than `text.iosMuted`.
    rowMuted: '#9A9AA2',
    // ProgressRing's default (unfilled) track color.
    progressRingTrack: '#EDEFF1',
    // OvertrainingTrendCard's HR-vs-speed-divergence risk buckets.
    overtrainingRisk: {
      high: '#D84343',
      elevated: '#F26B1D',
      moderate: '#F9A825',
      low: '#7CB342',
    },
    // OvertrainingTrendCard's hand-rolled HR/speed line chart.
    trendChart: {
      hrFill: '#F5511E',
      hrStrokeStart: '#FF6A2C',
      hrStrokeEnd: '#F5401A',
      speedStrokeStart: '#2FB6FF',
      speedStrokeEnd: '#0E9BEE',
      speedLegendDot: '#17A9F0',
      legendText: '#61616B',
      fatigueNote: '#B5560A',
    },
    // RecoveryCard's readiness-score bucket ring gradients (APPLE_HEALTH_SPEC
    // §5's score-interpretation table: 85-100 Peak ... 0-29 Very Low).
    recoveryRings: {
      peak: ['#2FD37E', '#14A863'],
      good: ['#A4D96B', '#7CB342'],
      moderate: ['#FFC24B', '#F5A11E'],
      low: ['#FF8A50', '#F26B1D'],
      veryLow: ['#EF6B6B', '#D84343'],
    },
    // SkillsDeltaCard's per-skill mini-tile hairline border.
    skillTileBorder: '#EFEFF2',
    // SkillsDeltaCard's positive/negative delta pill backgrounds.
    badgePositiveBg: '#DBF3E5',
    badgeNegativeBg: '#FCE3E3',
    // MetricComparisonCard's old-value/arrow/positive-highlight text.
    metricOldValue: '#B6B6BC',
    metricArrow: '#CFCFD4',
    metricBetter: '#12965A',
    // ConversationListItem's row bottom border.
    listRowBorder: '#F2F2F2',
    // ChatMessageBubble's coach-side (non-user) bubble background.
    bubbleCoachBg: '#f1f1f1',
    // SuggestedActions' top-relevance chip gradient ring.
    suggestedGradient: ['#4F6BFF', '#9B5DE5'],
    // SyncToAppleCalendarPrompt's neutral button base + text + error text.
    syncButtonBase: '#80848E',
    syncButtonText: '#1F232E',
    // "Supports goal: ..." chip on CalendarEventCreatedCard/
    // CalendarPlanCreatedCard.
    goalChipBase: '#2F4BDF',
    // RideScoreCard's effort-score bucket ring gradients (opposite direction
    // from `recoveryRings` — high effort is the intense/red end, not good).
    effortRings: {
      recovery: ['#7CC2FF', '#4DA3FF'],
      easy: ['#2FD37E', '#14A863'],
      moderate: ['#FFC24B', '#F5A11E'],
      tempo: ['#A4D96B', '#7CB342'],
      hard: ['#FF8A50', '#F26B1D'],
      heavy: ['#9B7EEA', '#6A4CCF'],
      exhausted: ['#EF6B6B', '#D84343'],
    },
  },
} as const;

export type Colors = typeof colors;
