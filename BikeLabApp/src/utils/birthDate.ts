// Birth-date <-> Date helpers shared by PersonalInfoScreen and the
// onboarding wizard's Step1PersonalInfo — both store `birth_date` as the
// wire format (ISO `YYYY-MM-DD`, see @bikelab/shared UserProfile.birth_date)
// but render it through @react-native-community/datetimepicker, which works
// in terms of a JS `Date`. Deliberately built on local Y/M/D, not
// `date.toISOString()` (which converts through UTC and can shift the
// calendar day by one near midnight in timezones behind/ahead of UTC).
export function birthDateToDate(birthDate: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!match) return null;
  const [, y, mo, d] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects "2024-02-30" style overflow, which `Date` would otherwise
  // silently roll into March.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

export function dateToBirthDateString(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** True for a real calendar date that isn't in the future (a rider can't have been born yet). */
export function isValidBirthDate(birthDate: string | null | undefined, asOf: Date = new Date()): boolean {
  const date = birthDateToDate(birthDate);
  return date !== null && date.getTime() <= asOf.getTime();
}
