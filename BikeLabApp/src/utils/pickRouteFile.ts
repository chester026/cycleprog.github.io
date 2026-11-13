// Picking a route file (GPX / FIT) for the coach — the system document
// picker through @react-native-documents/picker. iOS has no built-in type
// for either format, so the picker shows every file and the extension is
// checked here.
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';

export interface RouteFile {
  uri: string;
  name: string;
  type: string;
}

/** Thrown when the rider picked something that is not a route file. */
export class NotARouteFileError extends Error {
  constructor() {
    super('Not a GPX or FIT file');
    this.name = 'NotARouteFileError';
  }
}

export function isRouteFileName(name: string | null | undefined): boolean {
  return /\.(gpx|fit)$/i.test(name ?? '');
}

/**
 * The picked file, or null when the rider closed the picker. Rejects with
 * NotARouteFileError for any other kind of file.
 */
export async function pickRouteFile(): Promise<RouteFile | null> {
  let picked;
  try {
    [picked] = await pick({ type: [types.allFiles], mode: 'import' });
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
  if (!isRouteFileName(picked.name)) throw new NotARouteFileError();
  return {
    uri: picked.uri,
    name: picked.name as string,
    type: picked.type ?? 'application/octet-stream',
  };
}
