// Header block of GoalDetailsScreen — blob/blur backdrop, back/delete
// buttons, title/tier/due/status pills, description, and the
// "ask the coach" progress banner (T-5.4, audit A-27).
import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import type {MetaGoal} from '@bikelab/shared/types';
import {TIER_CONFIG} from '@bikelab/shared/constants';
import {isMetaGoalExpired} from '@bikelab/shared/calc';
import BlobOrb from '../../components/BlobOrb';
import {CalendarIcon} from '../../assets/img/icons/CalendarIcon';
import {TrashIcon} from '../../assets/img/icons/TrashIcon';
import {ProgressRing} from '../../components/coach/ProgressRing';
import {makeStyles} from '../../theme';
import {formatDate} from './lib';

interface GoalHeaderProps {
  metaGoal: MetaGoal;
  overallProgress: number;
  locale: string;
  onBack: () => void;
  onDelete: () => void;
  onAskCoach: () => void;
}

export const GoalHeader: React.FC<GoalHeaderProps> = ({
  metaGoal,
  overallProgress,
  locale,
  onBack,
  onDelete,
  onAskCoach,
}) => {
  const {t} = useTranslation();

  const tier = metaGoal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const isHighTier = tier === 'legendary' || tier === 'epic' || tier === 'grand';
  const dueDate = metaGoal.target_date ?? null;
  // Past its target date and still open. The banner below then offers the
  // one thing that's actually useful in that state — extending or
  // retargeting it through the coach — instead of generic advice.
  const expired = isMetaGoalExpired(metaGoal);

  return (
    <>
      {/* Blob + blur backdrop behind the header — same BlobOrb/BlurView
          combo as CoachChatScreen, but scrolls away WITH the header now
          instead of staying pinned — the whole screen scrolls as one
          unit, only the tab bar/footer button stay fixed. */}
      <View style={styles.heroBackground} pointerEvents="none">
        <View style={styles.blobContainer}>
          <BlobOrb size={420} />
        </View>
        <BlurView
          blurType="light"
          blurAmount={25}
          style={styles.absoluteFill}
          reducedTransparencyFallbackColor="rgba(250, 250, 250, 0.9)"
        />
      </View>

      {/* Header content sits over the blob — title is plain solid black,
          no accent highlight, per explicit design direction. */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {/* i18n note (T-5.4): the original literal here was a hardcoded
              "← Back" — goalDetails.backToGoals ("← Back to Goals") already
              existed in en/ru.json but was never wired to any Text, so this
              is a one-word visible text change, reported to the owner. */}
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>{t('goalDetails.backToGoals')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteIconBtn} onPress={onDelete}>
            <TrashIcon size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>{metaGoal.title}</Text>
        </View>

        <View style={styles.metaRow}>
          {isHighTier ? <View style={[styles.tierBadge, {backgroundColor: tierCfg.color}]}>
              <Text style={styles.tierBadgeText}>{t(tierCfg.key)}</Text>
            </View> : null}
          <View style={styles.pill}>
            <CalendarIcon size={14} color="rgba(0, 0, 0, 0.55)" />
            <Text style={styles.pillText}>
              {dueDate
                ? `${t('goalDetails.due')}${formatDate(dueDate, locale, t)}`
                : t('goalDetails.noDeadline')}
            </Text>
          </View>
          <View style={styles.pill}>
            <View
              style={[
                styles.statusDot,
                {backgroundColor: metaGoal.status === 'completed' ? '#9ca3af' : expired ? '#f59e0b' : '#22c55e'},
              ]}
            />
            <Text style={styles.pillText}>
              {metaGoal.status === 'completed'
                ? t('goalDetails.completed')
                : expired
                  ? t('goalDetails.statusExpired')
                  : t('goalDetails.statusActive')}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{metaGoal.description}</Text>

        {/* Overall progress (avg of all sub-goals) merged into the "ask
            coach" nudge instead of its own row — one card instead of two,
            and the ring sits in a fixed-size slot so it doesn't fight with
            title/pill wrapping the way a standalone bar/ring did. Subtitle
            stays generic (no percent) — the ring itself already carries
            the number, no need to say it twice. */}
        <TouchableOpacity style={styles.aiBanner} activeOpacity={0.85} onPress={onAskCoach}>
          {/* Solid blue badge (same weight/color as the original icon)
              nested inside a thin progress ring — percent in the center
              instead of the sparkle so the number itself carries the
              progress info, ring arc reinforces it visually. */}
          <ProgressRing
            size={52}
            strokeWidth={4.5}
            value={overallProgress}
            colors={['#274dd3', '#5B7FE8']}
            gradientId="goalBannerRing"
            trackColor="rgba(39, 77, 211, 0.12)">
            <View style={styles.aiBannerIconInner}>
              <Text style={styles.aiBannerIconPercent}>{Math.round(overallProgress)}%</Text>
            </View>
          </ProgressRing>
          <View style={styles.aiBannerText}>
            <Text style={styles.aiBannerTitle}>
              {t(expired ? 'goalDetails.expiredBannerTitle' : 'goalDetails.askCoachBannerTitle')}
            </Text>
            <Text style={styles.aiBannerSubtitle}>
              {t(expired ? 'goalDetails.expiredBannerSubtitle' : 'goalDetails.askCoachBannerSubtitle')}
            </Text>
          </View>
          <Text style={styles.aiBannerChevron}>›</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = makeStyles(theme => ({
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Fixed backdrop behind the header — a bounded-height absolute layer, same
  // pattern as CoachChatScreen's heroBackgroundFixed: an oversized BlobOrb
  // offset upward so it bleeds off both edges, clipped by overflow:'hidden',
  // then a light BlurView wash softens it into the pastel gradient look.
  heroBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    height: 440,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blobContainer: {
    position: 'absolute',
    top: -230,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
  },
  header: {
    paddingHorizontal: theme.spacing[16],
    paddingTop: 60,
    paddingBottom: theme.spacing[8],
  },
  // Back button + delete icon share a row now (delete used to be a text
  // button down in actionsRow) — mirrors the mockup's top-right circular
  // icon button, same rgba-white-glass treatment as CoachChatScreen's
  // iconButton.
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[20],
  },
  backBtn: {
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: theme.colors.text.primary,
    fontSize: 15,
    fontWeight: theme.typography.fontWeight.bold,
  },
  // Same treatment as CoachChatScreen's iconButton (the chat header's ×/+
  // buttons) — white-glass fill with a hairline border, not just a flat
  // tint, so it reads clearly against the blob background.
  deleteIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[12],
    flexWrap: 'wrap',
    marginBottom: theme.spacing[16],
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  tierBadge: {
    paddingHorizontal: theme.spacing[12],
    paddingVertical: 7,
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierBadgeText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    lineHeight: theme.typography.lineHeight.tight,
  },
  description: {
    fontSize: theme.typography.fontSize.lg,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 21,
    marginBottom: theme.spacing[20],
  },
  metaRow: {
    flexDirection: 'row',
    gap: theme.spacing[8],
    flexWrap: 'wrap',
    marginBottom: theme.spacing[16],
  },
  // Rounded pills over the blob — same shape language for both the "due
  // date" and "status" chips so they read as one family. Needs to be
  // near-opaque + a hairline border, not just a light tint, or it blends
  // into the pastel blob wash behind it depending on scroll position.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    paddingHorizontal: theme.spacing[12],
    paddingVertical: 7,
    borderRadius: theme.radii.pill,
  },
  pillText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: 'rgba(0, 0, 0, 0.65)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.16)',
    borderRadius: theme.radii.lg,
    padding: theme.spacing[14],
    marginTop: theme.spacing[12],
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  aiBannerIconInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBannerIconPercent: {
    color: theme.colors.black,
    fontSize: theme.typography.fontSize.base,
    fontWeight: '800',
  },
  aiBannerText: {
    flex: 1,
  },
  aiBannerTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '800',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  aiBannerSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: 'rgba(0, 0, 0, 0.45)',
  },
  aiBannerChevron: {
    fontSize: 22,
    fontWeight: theme.typography.fontWeight.bold,
    color: 'rgba(0, 0, 0, 0.25)',
  },
}));
