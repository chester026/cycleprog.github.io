// "Complete goal" flow: pick the rides that did the goal (longest ride in its
// window preselected), then POST complete. With no rides under
// COMPLETE_WITHOUT_CONFIRM_PERCENT progress it asks first. Owner decision
// 06.10.2026.
import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Alert} from 'react-native';
import type {MetaGoal} from '@bikelab/shared/types';
import {ActivityPickerModal} from '../../components/coach/ActivityPickerModal';
import {useCompleteMetaGoal} from '../../data/hooks/useCompleteMetaGoal';
import type {Activity} from '../../types/activity';
import {COMPLETE_WITHOUT_CONFIRM_PERCENT, pickGoalPickerRides} from './lib';

interface CompleteGoalModalProps {
  visible: boolean;
  onClose: () => void;
  metaGoal: MetaGoal;
  activities: Activity[];
  overallProgress: number;
  /** Fired after the server closed the goal — the screen opens the Share Studio. */
  onCompleted: () => void;
}

export const CompleteGoalModal: React.FC<CompleteGoalModalProps> = ({
  visible,
  onClose,
  metaGoal,
  activities,
  overallProgress,
  onCompleted,
}) => {
  const {t} = useTranslation();
  const completeMetaGoal = useCompleteMetaGoal();
  const {windowRides, earlierRides, preselectedIds} = useMemo(
    () => pickGoalPickerRides(activities, metaGoal.created_at),
    [activities, metaGoal.created_at],
  );

  const submit = (activityIds: number[]) => {
    completeMetaGoal.mutate(
      {id: metaGoal.id, activityIds},
      {
        onSuccess: () => {
          onClose();
          onCompleted();
        },
        onError: () => Alert.alert(t('common.error'), t('goalDetails.failedComplete')),
      },
    );
  };

  const handleConfirm = (selected: Activity[]) => {
    const ids = selected.map(a => a.id);
    if (ids.length > 0 || overallProgress >= COMPLETE_WITHOUT_CONFIRM_PERCENT) {
      submit(ids);
      return;
    }
    Alert.alert(t('goalDetails.completeGoal'), t('goalDetails.completeAnywayConfirm', {percent: Math.round(overallProgress)}), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('goalDetails.completeAnyway'), onPress: () => submit([])},
    ]);
  };

  return (
    <ActivityPickerModal
      visible={visible}
      onClose={onClose}
      onConfirm={handleConfirm}
      activities={windowRides}
      earlierActivities={earlierRides}
      earlierCaption={t('goalDetails.earlierRides')}
      title={t('goalDetails.completePickerTitle')}
      confirmLabel={() => t('goalDetails.completeCta')}
      emptyConfirmLabel={t('goalDetails.completeWithoutRides')}
      emptyText={t('goalDetails.noRidesToPick')}
      preselectedIds={preselectedIds}
    />
  );
};
