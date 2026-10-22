import React from 'react';
import { describeProfileUpdate } from '@bikelab/shared/coach';
import { ACCENT, CoachCard, Eyebrow, IconTile } from './CoachCardChrome';
import { ProfileIcon } from './icons';
import { t } from '../copy';
import styles from './cards.module.css';

const UNIT_KEYS = { kg: 'coach.unitKg', cm: 'coach.unitCm', bpm: 'common.bpm', years: 'coach.unitYears' };

/**
 * One update_rider_profile result — only the fields the coach changed, as
 * "Weight 78 kg · Max HR 186 bpm". Which fields are recognised, and their
 * units, is shared (`describeProfileUpdate`). Pressable so the rider can
 * jump to the Personal tab and correct a value.
 */
export default function ProfileUpdatedCard({ updated, onPress }) {
  const parts = describeProfileUpdate(updated).map(
    ({ labelKey, value, unit }) => `${t(labelKey)} ${value}${unit ? ` ${t(UNIT_KEYS[unit])}` : ''}`,
  );
  if (parts.length === 0) return null;
  return (
    <CoachCard accent={ACCENT.green} onPress={onPress} testId="profile-updated-card">
      <span className={styles.headRow}>
        <IconTile>
          <ProfileIcon />
        </IconTile>
        <Eyebrow>{t('coach.profileUpdatedLabel')}</Eyebrow>
      </span>
      <span className={styles.titleCompact}>{parts.join(' · ')}</span>
    </CoachCard>
  );
}
