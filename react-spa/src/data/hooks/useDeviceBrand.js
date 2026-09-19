import { useQuery } from '@tanstack/react-query';
import { call, activities } from '../api';
import { queryKeys } from '../keys';

const STALE_TIME = 24 * 60 * 60 * 1000; // 24h — device name on an activity never changes
const MAX_ACTIVITIES_CHECKED = 3;

/**
 * Replaces the `device_${brandKey}_${userId}` localStorage TTL cache that
 * `components/PartnersLogo.jsx` used to keep by hand (T-6.4, audit W-18).
 *
 * Looks at the first few `activities` for a `device_name` matching one of
 * `brands` (e.g. `['Garmin']`), fetching activity detail (`GET
 * /api/activities/:id`) only for those few. Returns `{ shouldShow,
 * deviceName }`:
 * - no `brands` given → always show, no fetch, no device name.
 * - `brands` given but no match found among the checked activities → hide.
 */
export function useDeviceBrand(activityList, brands) {
  const hasBrandFilter = Boolean(brands && brands.length);
  const brandKey = hasBrandFilter ? brands.join('_').toLowerCase() : '';
  const activityIds = hasBrandFilter ? (activityList || []).slice(0, MAX_ACTIVITIES_CHECKED).map((a) => a.id) : [];

  const query = useQuery({
    queryKey: queryKeys.deviceBrand(brandKey, activityIds),
    queryFn: async () => {
      for (const id of activityIds) {
        try {
          const detail = await call(activities.detail, { params: { id } });
          if (!detail?.device_name) continue;
          const matches = brands.some((brand) => detail.device_name.toLowerCase().includes(brand.toLowerCase()));
          if (matches) {
            let cleanDeviceName = detail.device_name;
            brands.forEach((brand) => {
              cleanDeviceName = cleanDeviceName.replace(new RegExp(`^${brand}\\s+`, 'i'), '');
            });
            return { shouldShow: true, deviceName: cleanDeviceName };
          }
        } catch {
          // this activity's detail failed to load — keep checking the rest
        }
      }
      return { shouldShow: false, deviceName: '' };
    },
    enabled: hasBrandFilter && activityIds.length > 0,
    staleTime: STALE_TIME,
  });

  if (!hasBrandFilter) {
    return { shouldShow: true, deviceName: '' };
  }

  return {
    shouldShow: query.data?.shouldShow ?? false,
    deviceName: query.data?.deviceName ?? '',
  };
}
