/**
 * GoalShareStudioModal - Share Studio for a completed goal: the goal's title
 * and the numbers behind it (kilometres, climbing, rides, hours, days over
 * the goal's window) as a story card, in the eight layouts of the
 * "Goal Share Screens v5" design.
 *
 * Same chrome and export pipeline as the ride studio (ShareStudioShell).
 * Your own photo from the gallery: Photo and Duotone are built around one
 * (the preview prompts for it until picked), Staggered and Ribbon take one
 * as an alternative to the dark page.
 */
import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {launchImageLibrary} from 'react-native-image-picker';
import type {MetaGoal} from '@bikelab/shared/types';
import type {Activity} from '../../../types/activity';
import {ShareStudioShell} from '../ShareStudioShell';
import {TemplateCarousel, type TemplateOption} from '../TemplateCarousel';
import {BackgroundPicker, type BackgroundPickerVariant} from '../BackgroundPicker';
import type {BackgroundType} from '../types';
import {computeGoalRecap, goalCompletedAt, formatRecapKm, type GoalRecap, type RecapGoal} from './recap';
import {
  GoalReport,
  GoalStaggered,
  GoalStacked,
  GoalPhoto,
  GoalFinish,
  GoalInset,
  GoalDuotone,
  GoalRibbon,
  type GoalTemplateType,
  type GoalTemplateProps,
  type GoalShareDates,
} from './templates';
import {AddPhotoIcon} from '../../../assets/img/icons/AddPhotoIcon';
import {getDateLocale} from '../../../i18n/dateLocale';
import {logger} from '../../../lib/logger';
import {makeStyles, useTheme, withOpacity} from '../../../theme';

// Owner order: Inset leads (and is the default), Report sits next to Finish line.
const TEMPLATES: GoalTemplateType[] = ['inset', 'staggered', 'stacked', 'photo', 'report', 'finish', 'duotone', 'ribbon'];

const TEMPLATE_COMPONENT: Record<GoalTemplateType, React.FC<GoalTemplateProps>> = {
  report: GoalReport,
  staggered: GoalStaggered,
  stacked: GoalStacked,
  photo: GoalPhoto,
  finish: GoalFinish,
  inset: GoalInset,
  duotone: GoalDuotone,
  ribbon: GoalRibbon,
};

/** Built around a photo — prompt for one until it's picked. */
const PHOTO_TEMPLATES = new Set<GoalTemplateType>(['photo', 'duotone']);

const PICKER_VARIANT: Partial<Record<GoalTemplateType, BackgroundPickerVariant>> = {
  staggered: 'goalDark',
  ribbon: 'goalDark',
  photo: 'goalPhoto',
  duotone: 'goalPhoto',
};

/** "1 Aug — 31 Aug 2026" in the app's date locale. */
export function formatGoalDateRange(recap: Pick<GoalRecap, 'start' | 'end'>, locale: string): string {
  const sameYear = recap.start.getFullYear() === recap.end.getFullYear();
  const from = recap.start.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? null : {year: 'numeric'}),
  });
  const to = recap.end.toLocaleDateString(locale, {day: 'numeric', month: 'short', year: 'numeric'});
  return `${from} — ${to}`;
}

export function buildGoalShareDates(recap: GoalRecap, completedAt: Date, locale: string): GoalShareDates {
  const short = (d: Date) => d.toLocaleDateString(locale, {day: 'numeric', month: 'short'});
  return {
    range: formatGoalDateRange(recap, locale),
    rangeShort: `${short(recap.start)} — ${short(recap.end)}`,
    start: short(recap.start),
    finish: short(recap.end),
    completedNumeric: completedAt.toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: 'numeric'}),
  };
}

export interface GoalShareStudioProps {
  visible: boolean;
  onClose: () => void;
  metaGoal: MetaGoal;
  activities: Activity[];
}

export const GoalShareStudioModal: React.FC<GoalShareStudioProps> = ({visible, onClose, metaGoal, activities}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [template, setTemplate] = useState<GoalTemplateType>(TEMPLATES[0]);
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('dark');
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const [isGrayscale, setIsGrayscale] = useState(false);

  const recap = useMemo(() => computeGoalRecap(metaGoal as RecapGoal, activities), [metaGoal, activities]);
  const dates = useMemo(
    () => buildGoalShareDates(recap, goalCompletedAt(metaGoal as RecapGoal), getDateLocale()),
    [recap, metaGoal],
  );

  const templateOptions: ReadonlyArray<TemplateOption<GoalTemplateType>> = TEMPLATES.map(key => ({
    key,
    label: t(`goalShare.template.${key}`),
  }));

  // Photo templates always show the photo; the dark-or-photo ones keep a
  // photo you already picked, so it follows you across templates.
  const handleSelectTemplate = (next: GoalTemplateType) => {
    setTemplate(next);
    if (PHOTO_TEMPLATES.has(next)) setBackgroundType('photo');
    else if (!(backgroundType === 'photo' && backgroundImage)) setBackgroundType('dark');
  };

  const pickPhoto = async () => {
    try {
      const result = await launchImageLibrary({mediaType: 'photo', quality: 1, selectionLimit: 1, maxWidth: 2048, maxHeight: 2048});
      const uri = result.assets?.[0]?.uri;
      if (uri) {
        setBackgroundImage(uri);
        setBackgroundType('photo');
      }
    } catch (e) {
      logger.error('Image pick error:', e);
    }
  };

  const Template = TEMPLATE_COMPONENT[template];
  const pickerVariant = PICKER_VARIANT[template];
  const needsPhoto = PHOTO_TEMPLATES.has(template) && !backgroundImage;
  const hasPhoto = backgroundType === 'photo' && !!backgroundImage;
  const showBw: boolean = hasPhoto && template !== 'duotone';

  return (
    <ShareStudioShell
      visible={visible}
      onClose={onClose}
      transparent={false}
      showGrayscaleToggle={showBw}
      isGrayscale={isGrayscale}
      onToggleGrayscale={() => setIsGrayscale(!isGrayscale)}
      shareMessage={`${metaGoal.title} — ${formatRecapKm(recap.distanceKm)} ${t('common.km')} 🚴`}
      preview={
        <Template
          goalTitle={metaGoal.title}
          tier={metaGoal.tier}
          recap={recap}
          dates={dates}
          backgroundType={backgroundType}
          backgroundImage={backgroundImage}
          isGrayscale={isGrayscale}
        />
      }
      previewOverlay={
        needsPhoto ? (
          <TouchableOpacity testID="goal-share-pick-photo" style={styles.pickPhoto} onPress={pickPhoto} activeOpacity={0.8}>
            <AddPhotoIcon size={28} color={theme.colors.text.inverse} />
            <Text style={styles.pickPhotoText}>{t('goalShare.choosePhoto')}</Text>
            <Text style={styles.pickPhotoHint}>{t('goalShare.choosePhotoHint')}</Text>
          </TouchableOpacity>
        ) : null
      }>
      <TemplateCarousel<GoalTemplateType> options={templateOptions} selectedTemplate={template} onSelect={handleSelectTemplate} />
      {pickerVariant ? (
        <View style={styles.section}>
          <BackgroundPicker
            variant={pickerVariant}
            selectedType={backgroundType}
            selectedImage={backgroundImage}
            onSelectType={setBackgroundType}
            onSelectImage={setBackgroundImage}
          />
        </View>
      ) : null}
    </ShareStudioShell>
  );
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  // Plain text over the preview — no card/border (owner: the boxed prompt
  // sat on top of the template too heavily). Padding only keeps the tap
  // target comfortable.
  pickPhoto: {
    // Pinned near the top of the preview instead of the shell's centred
    // overlay slot (owner: higher, closer to the top edge).
    position: 'absolute',
    top: '10%',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    padding: 16,
  },
  pickPhotoText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  pickPhotoHint: {
    fontSize: 11,
    color: withOpacity(theme.colors.text.inverse, 0.7),
  },
}));

export default GoalShareStudioModal;
