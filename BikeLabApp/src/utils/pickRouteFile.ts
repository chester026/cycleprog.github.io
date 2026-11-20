// Picking route files (GPX / FIT) for the coach — the system document
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

/** What the rider picked: the route files, and how many other files were among them. */
export interface PickedRouteFiles {
  files: RouteFile[];
  skipped: number;
}

/**
 * The picked route files — the picker lets the rider tick several at once
 * (the stages of a race) — or null when they closed it. Other kinds of file
 * in the selection are left out and counted; rejects with NotARouteFileError
 * when none of the picked files is a route.
 */
export async function pickRouteFiles(): Promise<PickedRouteFiles | null> {
  let picked;
  try {
    picked = await pick({
      type: [types.allFiles],
      mode: 'import',
      allowMultiSelection: true,
    });
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
  const files = picked
    .filter(file => isRouteFileName(file.name))
    .map(file => ({
      uri: file.uri,
      name: file.name as string,
      type: file.type ?? 'application/octet-stream',
    }));
  if (files.length === 0) throw new NotARouteFileError();
  return { files, skipped: picked.length - files.length };
}
