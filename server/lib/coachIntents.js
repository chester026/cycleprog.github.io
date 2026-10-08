// Deterministic readiness-intent detector (Problem A, coach-readiness-budget
// task). Relying on a 12k-token system prompt to make gpt-4.1-mini remember
// to call analyze_readiness on every readiness/fatigue/recovery question
// wasn't reliable in practice — routes/coach.js uses this instead to FORCE
// that tool call (tool_choice) on the first model round of a turn whenever
// the rider's own message looks readiness-shaped, rather than hoping the
// model picks it on its own.
//
// English patterns use \b freely (ASCII word boundaries work fine). Russian
// patterns deliberately do NOT use \b: JS's \w is ASCII-only, so \b between
// a space and a Cyrillic letter isn't a boundary at all (both sides count as
// non-word) and would silently never match. Plain stem substrings are the
// standard workaround for a highly-inflected language like Russian and are
// fine for a best-effort classifier like this one.
const READINESS_PATTERNS = [
  // English — readiness/fatigue/recovery/overtraining vocabulary, the HR-vs-
  // speed chart, and the common phrasings from the bug report.
  /\breadi(?:ness|e)\b/i,
  /\brecover(?:y|ed|ing)?\b/i,
  /\bfatigue[d]?\b/i,
  /\bovertrain(?:ed|ing)?\b/i,
  /\bhr\s*(?:vs\.?|versus)\s*speed\b/i,
  /\bheart[\s-]?rate\s*(?:vs\.?|versus)\s*speed\b/i,
  /\bready to (?:train|ride)\b/i,
  /\bshould i (?:ride|train)\b/i,
  /\bam i recovered\b/i,
  /\bhow (?:tired|rested) am i\b/i,

  // Russian — same concepts. No \b (see header comment); "готов" alone would
  // false-positive on unrelated words, so it's required to be followed by
  // "к трен..." (readiness FOR training), matching the task's own example.
  /готов[а-яё]*\s+(?:к\s+)?трен/i,
  /восстанов/i, // восстановление/восстановился/восстанови... (recovery)
  /устал/i, // устал/усталость/устала (tired/fatigue)
  /перетрен/i, // перетренированность/перетренировался (overtraining)
  /отдохну/i, // отдохнул/отдохнуть (rested)
  /пульс[а-яё]*\s+(?:против|vs\.?)\s+скорост/i, // "пульс против/vs скорости"
  /самочувствие/i, // "как я/моё самочувствие" and variants
];

// Excludes clearly unrelated senses of "recover" (account/password recovery)
// from forcing analyze_readiness — a support request like "recover my
// password" should NOT trigger a training-readiness tool call. Deliberately
// checked against the WHOLE message rather than scoped to just the word
// "recover", which means a message that also happens to ask about training
// readiness AND mentions a password reset in the same breath is excluded
// too; that's an acceptable trade-off for a heuristic this cheap.
const UNRELATED_RECOVERY_RE = /\b(?:password|account|log-?in)\b/i;

/**
 * Whether `message` (the rider's own raw text — never the hidden
 * "[App context...]" suffix or an attached-activities block, both of which
 * are folded in separately by routes/coach.js after this check runs) reads
 * as a training-readiness/fatigue/recovery/overtraining question.
 */
function isReadinessIntent(message) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (!text) return false;
  if (UNRELATED_RECOVERY_RE.test(text)) return false;
  return READINESS_PATTERNS.some((re) => re.test(text));
}

// "Can I do THIS ride?" (bug 07.10.2026: "Стоит мне завтра ехать 160км 3000 набора?" forced
// analyze_readiness, which only knows Apple Health/Oura, so a rider with neither got a paragraph
// about connecting Apple Health instead of an answer from his Strava history). A feasibility
// question needs BOTH a described ride (a distance in km) and a question marker — "build me a plan
// for a 120 km gran fondo" or "how many km did I ride" describe a ride/number without asking
// whether the rider can do it. Same no-\b rule for Russian as above.
const RIDE_DISTANCE_RE = /\d(?:[\d.,]*\d)?\s*(?:km|км|километр)/i;
const FEASIBILITY_QUESTION_PATTERNS = [
  /\bshould i\b/i,
  /\bcan i\b/i,
  /\bam i ready for\b/i,
  /\bis it (?:ok|okay|fine|safe) to\b/i,
  /\bwill i (?:be able|manage)\b/i,
  /стоит\s+(?:ли|мне)/i,
  /потян/i,
  /смогу/i,
  /осилю/i,
  /готов[а-яё]*\s+(?:ли\s+я\s+)?к\s/i,
];
// "160 km with 3000 m?" — distance followed shortly by a climbing figure, no question word.
const DISTANCE_WITH_CLIMB_RE =
  /\d(?:[\d.,]*\d)?\s*(?:km|км)[^\d?]{0,25}\d(?:[\d.,\s]*\d)?\s*(?:m(?![a-z])|м(?![а-яё])|метр|набор|climb|elev|hm)/i;

function isRideFeasibilityIntent(message) {
  if (typeof message !== 'string') return false;
  const text = message.trim();
  if (!RIDE_DISTANCE_RE.test(text)) return false;
  if (FEASIBILITY_QUESTION_PATTERNS.some((re) => re.test(text))) return true;
  return text.includes('?') && DISTANCE_WITH_CLIMB_RE.test(text);
}

/**
 * Which tool routes/coach.js forces on the first model round: 'feasibility' (assess_ride_feasibility),
 * 'readiness' (analyze_readiness) or null. A described ride wins over readiness vocabulary
 * ("am I recovered enough for 160 km?" is about that ride).
 */
function coachIntent(message) {
  if (isRideFeasibilityIntent(message)) return 'feasibility';
  if (isReadinessIntent(message)) return 'readiness';
  return null;
}

const FORCED_TOOL_BY_INTENT = {
  feasibility: 'assess_ride_feasibility',
  readiness: 'analyze_readiness',
};

/** The `tool_choice` for the first model round of a turn, or 'auto'. */
function forcedToolChoice(message) {
  const name = FORCED_TOOL_BY_INTENT[coachIntent(message)];
  return name ? { type: 'function', name } : 'auto';
}

module.exports = { isReadinessIntent, isRideFeasibilityIntent, coachIntent, forcedToolChoice };
