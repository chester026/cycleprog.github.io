// Route files (GPX / FIT) attached to the next coach message for a race
// plan — several at once for a stage race. Picked with the system file
// picker, read by the server into courses one after another
// (POST /api/race-courses), then carried to the coach as hidden context; the
// coach plans each with plan_race.
import {useCallback, useState} from 'react';
import {Alert} from 'react-native';
import {useTranslation} from 'react-i18next';
import {isApiError} from '@bikelab/shared/api';
import {MAX_ATTACHED_ROUTES} from '@bikelab/shared/coach';
import type {AttachedRoute} from '@bikelab/shared/types';
import {useUploadRaceCourse} from '../../data/hooks/useUploadRaceCourse';
import {NotARouteFileError, pickRouteFiles} from '../../utils/pickRouteFile';
import {logger} from '../../lib/logger';

export interface RouteAttachments {
  /** The routes read so far, in the order the rider attached them. */
  attached: AttachedRoute[];
  /** True from the first picked file going up until the last one is read. */
  uploading: boolean;
  /** Opens the file picker and reads what was picked. */
  attach: () => Promise<void>;
  remove: (courseId: number) => void;
  clear: () => void;
}

export function useRouteAttachments(): RouteAttachments {
  const {t} = useTranslation();
  const [attached, setAttached] = useState<AttachedRoute[]>([]);
  const [uploading, setUploading] = useState(false);
  const {mutateAsync: uploadRoute} = useUploadRaceCourse();

  const attach = async () => {
    const room = MAX_ATTACHED_ROUTES - attached.length;
    const limitAlert = () =>
      Alert.alert(t('coach.routeLimitTitle', {max: MAX_ATTACHED_ROUTES}), t('coach.routeLimit', {max: MAX_ATTACHED_ROUTES}));
    if (room <= 0) {
      limitAlert();
      return;
    }
    let picked;
    try {
      picked = await pickRouteFiles();
    } catch (pickError) {
      if (!(pickError instanceof NotARouteFileError)) logger.error('[Coach] route picker failed:', pickError);
      Alert.alert(t('coach.routeNotARouteTitle'), t('coach.routeNotARoute'));
      return;
    }
    if (!picked) return;

    // A file that cannot be read does not stop the ones after it; what went
    // wrong is said once, when all are through.
    const failures: string[] = [];
    setUploading(true);
    for (const file of picked.files.slice(0, room)) {
      try {
        const uploaded = await uploadRoute(file);
        // The same file picked twice is one route.
        setAttached(prev => (prev.some(route => route.course_id === uploaded.course_id) ? prev : [...prev, uploaded]));
      } catch (uploadError) {
        logger.error('[Coach] route upload failed:', uploadError);
        const code = isApiError(uploadError) ? uploadError.code : null;
        const reason =
          code === 'COURSE_NO_ELEVATION'
            ? t('coach.routeNoElevation')
            : code === 'COURSE_TOO_SHORT'
              ? t('coach.routeTooShort')
              : t('coach.routeFailed');
        failures.push(t('coach.routeFailedNamed', {name: file.name, reason}));
      }
    }
    setUploading(false);

    if (failures.length > 0) Alert.alert(t('coach.routeFailedTitle'), failures.join('\n\n'));
    else if (picked.skipped > 0) Alert.alert(t('coach.routeNotARouteTitle'), t('coach.routeNotARoute'));
    else if (picked.files.length > room) limitAlert();
  };

  const remove = useCallback((courseId: number) => setAttached(prev => prev.filter(route => route.course_id !== courseId)), []);
  const clear = useCallback(() => setAttached([]), []);

  return {attached, uploading, attach, remove, clear};
}
