// Pure helpers for GarminIntegrationScreen and BikeGarage's GarminBanner.

/** Connect IQ products in packages/garmin-ciq/manifest.xml, display names. */
export const SUPPORTED_GARMIN_DEVICES = ['Edge 1040', 'Edge 1040 Solar', 'Edge 1050'] as const;

/** Keeps digits only and shows them as "123 456" while typing. */
export function formatPairingCodeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

export function isPairingCodeComplete(text: string): boolean {
  return text.replace(/\D/g, '').length === 6;
}

/**
 * A status timestamp (ISO string or Date, as the contract allows) as a
 * local date for GarminConnectCard's rows; an em dash when there is none.
 */
export function formatGarminDate(value: string | Date | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/**
 * A Garmin calendar day ('YYYY-MM-DD') as a local date. Built from its parts
 * on purpose: `new Date('2026-11-09')` is UTC midnight and shows as the 8th
 * anywhere west of Greenwich.
 */
export function formatGarminDay(day: string | null | undefined): string {
  const match = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!match) {
    return '—';
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString();
}

/** The newest health day's figures, as GET /api/garmin/connect/status returns them. */
export interface GarminHealthLatest {
  day: string;
  sleep_hours: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  hrv_status: string | null;
  resting_hr: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  stress_avg: number | null;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * GarminConnectCard's health rows: one per figure the watch actually
 * measured that day, in the order a rider reads recovery — sleep, HRV,
 * resting HR, Body Battery, stress. A figure that is null gets no row.
 */
export function garminHealthRows(latest: GarminHealthLatest | null | undefined, t: Translate): {label: string; value: string}[] {
  if (!latest) {
    return [];
  }
  const rows: {label: string; value: string}[] = [];
  if (latest.sleep_hours != null) {
    rows.push({label: t('garmin.healthSleep'), value: t('garmin.healthHoursValue', {value: latest.sleep_hours.toFixed(1)})});
  }
  if (latest.sleep_score != null) {
    rows.push({label: t('garmin.healthSleepScore'), value: String(latest.sleep_score)});
  }
  if (latest.hrv_ms != null) {
    rows.push({label: t('garmin.healthHrv'), value: t('garmin.healthMsValue', {value: Math.round(latest.hrv_ms)})});
  }
  if (latest.resting_hr != null) {
    rows.push({label: t('garmin.healthRestingHr'), value: t('garmin.healthBpmValue', {value: latest.resting_hr})});
  }
  if (latest.body_battery_high != null) {
    rows.push({
      label: t('garmin.healthBodyBattery'),
      value: latest.body_battery_low != null ? `${latest.body_battery_low}–${latest.body_battery_high}` : String(latest.body_battery_high),
    });
  }
  if (latest.stress_avg != null) {
    rows.push({label: t('garmin.healthStress'), value: String(latest.stress_avg)});
  }
  return rows;
}
