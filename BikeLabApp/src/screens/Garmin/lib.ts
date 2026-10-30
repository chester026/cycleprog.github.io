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
