// Translates the shared fixed chip sets for the welcome screen and home
// hero — the key lists themselves live in @bikelab/shared/coach so web
// shows the same prompts.
import {QUICK_START_SUGGESTION_KEYS, WELCOME_SUGGESTION_KEYS} from '@bikelab/shared/coach';
import {SuggestionItem} from '../../types/coach';

/** The empty-chat welcome screen's fixed chip set (also the CoachChatScreen fallback before any suggestions arrive). */
export function buildWelcomeSuggestions(t: (key: string) => string): SuggestionItem[] {
  return WELCOME_SUGGESTION_KEYS.map(key => ({label: t(key)}));
}

// `prompt`, when present, is what actually gets SENT instead of `label` —
// see QUICK_START_SUGGESTION_KEYS for why the total-stats chip needs one.
export function buildQuickStartSuggestions(
  t: (key: string) => string,
): (SuggestionItem & {prompt?: string})[] {
  return QUICK_START_SUGGESTION_KEYS.map(({labelKey, promptKey}) => ({
    label: t(labelKey),
    ...(promptKey ? {prompt: t(promptKey)} : {}),
  }));
}
