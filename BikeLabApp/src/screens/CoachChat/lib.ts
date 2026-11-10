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

/** What tapping a suggestion chip does — see resolveSuggestionPress. */
export type SuggestionPress =
  | {kind: 'send'; text: string; revealDetail?: SuggestionItem['detail']}
  | {kind: 'open_apple_health'}
  | {kind: 'refresh_garmin_health'};

/**
 * Decides what a tapped chip does. Most chips send their label as a message
 * (a `detail` chip also says which one analysis card to reveal). The two
 * `action` chips do something in the app instead:
 *   connect_health        → open the Apple Health screen
 *   refresh_garmin_health → fetch the latest Garmin health days, then ask
 *                           the coach about readiness again (CoachChatScreen)
 * An action this build doesn't know falls back to sending the label, so a
 * chip added on the server later is never a dead button here.
 */
export function resolveSuggestionPress(item: SuggestionItem): SuggestionPress {
  if (item.action === 'connect_health') {
    return {kind: 'open_apple_health'};
  }
  if (item.action === 'refresh_garmin_health') {
    return {kind: 'refresh_garmin_health'};
  }
  return item.detail ? {kind: 'send', text: item.label, revealDetail: item.detail} : {kind: 'send', text: item.label};
}

/**
 * The language a chip was written in — 'ru' when its label has Cyrillic,
 * 'en' otherwise. The server labels its fixed chips in the language of the
 * rider's last message, which is not always the app's own (a rider with the
 * app in English who chats in Russian). A message the app sends on the
 * rider's behalf after tapping such a chip should be in the conversation's
 * language, so it follows the chip rather than the app's locale.
 */
export function suggestionLanguage(label: string): 'ru' | 'en' {
  return /[а-яё]/i.test(label) ? 'ru' : 'en';
}
