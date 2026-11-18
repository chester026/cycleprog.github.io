// What the app does when Strava's OAuth round-trip for CONNECTING Strava
// comes back (`bikelab://strava-linked`, see navigation/deepLinks.ts). One
// place for the whole app: the flow can be started from the Garage card,
// onboarding or the Strava integration screen, several of which are mounted
// at once — each listening for itself would mean several alerts for one
// result.
import {Alert} from 'react-native';
import i18n from '../i18n/i18n';
import {queryClient} from '../data/queryClient';
import {queryKeys} from '../data/keys';

export interface StravaLinkResult {
  ok: boolean;
  /** Why linking failed, when the server can say — `another_account`: the athlete belongs to a different BikeLab account. */
  reason?: string;
}

export function handleStravaLinkResult({ok, reason}: StravaLinkResult): void {
  if (ok) {
    // Strava is on the profile row now, and rides and bikes can load.
    queryClient.invalidateQueries({queryKey: queryKeys.profile});
    queryClient.invalidateQueries({queryKey: queryKeys.activities()});
    queryClient.invalidateQueries({queryKey: queryKeys.bikes});
    return;
  }
  if (reason === 'another_account') {
    Alert.alert(i18n.t('strava.anotherAccountTitle'), i18n.t('strava.anotherAccountMessage'));
    return;
  }
  Alert.alert(i18n.t('common.error'), i18n.t('strava.linkFailed'));
}
