// A coach reply as the chat draws it: running text, and — where the coach
// lists numbers as "- Label: value" bullets — rows with the label on the
// left and the value on the right, which read faster than a bullet list.

export interface ReplyRow {
  label: string;
  value: string;
  /** The number this row replaces ("1200 km instead of 400 km") — drawn struck through before the value. */
  was?: string;
}

export type ReplyBlock = {kind: 'text'; text: string} | {kind: 'rows'; rows: ReplyRow[]};

// A row has to stay on one line of a phone: longer labels and values are
// sentences, and those stay bullets.
const ROW_LABEL_MAX_CHARS = 32;
const ROW_VALUE_MAX_CHARS = 28;
// One "Label: value" bullet among ordinary ones is not a table.
const MIN_ROWS = 2;

const BULLET = /^\s*[-*•]\s+/;

function toRow(line: string): ReplyRow | null {
  if (!BULLET.test(line)) return null;
  const plain = line.replace(BULLET, '').replace(/\*\*/g, '').trim();
  const colon = plain.indexOf(':');
  if (colon <= 0) return null;
  const label = plain.slice(0, colon).trim();
  const value = plain.slice(colon + 1).trim();
  if (!label || !value || label.length > ROW_LABEL_MAX_CHARS || value.length > ROW_VALUE_MAX_CHARS) return null;
  // Rows are for numbers; "Note: take it easy" is prose.
  if (!/\d/.test(value)) return null;
  return {label, ...splitChange(value)};
}

// The ways a changed number is written: "1200 km instead of 400 km",
// "400 → 1200 km", "~~400~~ 1200 km", "1200 km (was 400)".
const CHANGE_PATTERNS = [
  /^(?<now>.+?)\s+(?:вместо|instead of)\s+(?<was>.+)$/i,
  /^(?<was>.+?)\s*(?:→|->|=>)\s*(?<now>.+)$/,
  /^~~(?<was>.+?)~~\s*(?<now>.+)$/,
  /^(?<now>.+?)\s*\((?:было|раньше|was|before)[:\s]+(?<was>.+?)\)$/i,
];

/** A row's value as the new number and, when the coach wrote a change, the number it replaces. */
function splitChange(value: string): {value: string; was?: string} {
  for (const pattern of CHANGE_PATTERNS) {
    const groups = pattern.exec(value)?.groups;
    if (!groups || !/\d/.test(groups.now) || !/\d/.test(groups.was)) continue;
    const now = groups.now.trim();
    let was = groups.was.trim();
    // "400 km" before "1200 km": the unit is said once, by the new value.
    const unit = /[^\d\s.,–-][^\d]*$/.exec(now)?.[0].trim();
    if (unit && was.endsWith(unit)) was = was.slice(0, -unit.length).trim();
    return {value: now, was};
  }
  return {value};
}

export function splitReplyBlocks(content: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let text: string[] = [];
  let rows: ReplyRow[] = [];
  let rowLines: string[] = [];

  const flushText = () => {
    const joined = text.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined.length > 0) blocks.push({kind: 'text', text: joined});
    text = [];
  };
  const flushRows = () => {
    if (rows.length >= MIN_ROWS) {
      flushText();
      blocks.push({kind: 'rows', rows});
    } else {
      text.push(...rowLines);
    }
    rows = [];
    rowLines = [];
  };

  for (const line of content.split('\n')) {
    const row = toRow(line);
    if (row) {
      rows.push(row);
      rowLines.push(line);
    } else {
      flushRows();
      text.push(line);
    }
  }
  flushRows();
  flushText();
  return blocks;
}

// A rider's message longer than this is folded in the transcript — a pasted
// plan would otherwise push the coach's answer screens away.
const LONG_NOTE_MAX_CHARS = 280;
export const LONG_NOTE_MAX_LINES = 5;

export function isLongNote(content: string): boolean {
  return content.length > LONG_NOTE_MAX_CHARS || content.split('\n').length > LONG_NOTE_MAX_LINES;
}

// A coach reply longer than this (a week-by-week plan runs to several
// screens) is shown by its opening, the rest behind "Show more" — the
// transcript stays scannable (owner, 19.11.2026).
const LONG_REPLY_MIN_CHARS = 1400;
// How much of a long reply stays in view: about a screen's worth, ended at
// a paragraph where there is one.
const REPLY_PREVIEW_MAX_CHARS = 700;
// A cut that would leave less than this is not worth making at that point.
const REPLY_PREVIEW_MIN_CHARS = 200;

/** The opening of a long reply, cut at the end of a paragraph (else a line, else a word); null when the reply is short enough to show whole. */
export function replyPreview(content: string): string | null {
  if (content.length <= LONG_REPLY_MIN_CHARS) return null;
  const head = content.slice(0, REPLY_PREVIEW_MAX_CHARS);
  const cut = [head.lastIndexOf('\n\n'), head.lastIndexOf('\n'), head.lastIndexOf(' ')].find(at => at >= REPLY_PREVIEW_MIN_CHARS);
  return (cut === undefined ? head : head.slice(0, cut)).trimEnd();
}
