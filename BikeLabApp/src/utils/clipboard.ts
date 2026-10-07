// Single place that talks to the system clipboard. RN 0.83 still ships
// `Clipboard` in core (it logs a one-time "extracted from react-native"
// warning on first access); when @react-native-clipboard/clipboard is added
// as a dependency only this file changes.
import {Clipboard} from 'react-native';

export function copyToClipboard(text: string): void {
  Clipboard.setString(text);
}
