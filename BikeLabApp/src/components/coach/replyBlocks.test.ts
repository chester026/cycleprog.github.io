import {isLongNote, replyPreview, splitReplyBlocks} from './replyBlocks';

describe('splitReplyBlocks', () => {
  it('leaves ordinary text and bullets as one block of text', () => {
    const content = 'Do **3 x 10 min** tempo\n- warm up well\n- keep the cadence high';
    expect(splitReplyBlocks(content)).toEqual([{kind: 'text', text: content}]);
  });

  it('turns a run of "Label: number" bullets into rows, between the text around it', () => {
    const content = ['Your zones from FTP 183 W:', '- Z2: 102–137 W', '- **Tempo:** 138–165 W', '* Threshold: **166–192 W**', '', 'Ride most of the week in Z2.'].join('\n');
    expect(splitReplyBlocks(content)).toEqual([
      {kind: 'text', text: 'Your zones from FTP 183 W:'},
      {
        kind: 'rows',
        rows: [
          {label: 'Z2', value: '102–137 W'},
          {label: 'Tempo', value: '138–165 W'},
          {label: 'Threshold', value: '166–192 W'},
        ],
      },
      {kind: 'text', text: 'Ride most of the week in Z2.'},
    ]);
  });

  it('keeps a single such bullet, sentences and values without a number as text', () => {
    for (const content of [
      'Numbers:\n- FTP: 183 W\n- then we retest',
      '- Note: take the first climb easy\n- Tip: eat before the second one',
      '- Tuesday: 60 minutes in Z2 at 108–145 W, cadence above 85 the whole way\n- Thursday: 4 x 8 minutes at threshold with 4 minutes easy between them',
    ]) {
      expect(splitReplyBlocks(content)).toEqual([{kind: 'text', text: content}]);
    }
  });

  it('reads a changed number as the new value and the one it replaces, however the change is written', () => {
    const content = [
      '- Дистанция: 1200 км вместо 400 км',
      '- Набор высоты: 16 000 м вместо 6000 м',
      '- Длинные поездки 80+ км: 8 вместо 5',
      '- Distance: 400 → 1200 km',
      '- Average power: ~~230~~ 183 W',
      '- FTP: 190 W (was 183 W)',
      '- Zone 2: 102–137 W',
    ].join('\n');
    expect(splitReplyBlocks(content)).toEqual([
      {
        kind: 'rows',
        rows: [
          {label: 'Дистанция', value: '1200 км', was: '400'},
          {label: 'Набор высоты', value: '16 000 м', was: '6000'},
          {label: 'Длинные поездки 80+ км', value: '8', was: '5'},
          {label: 'Distance', value: '1200 km', was: '400'},
          {label: 'Average power', value: '183 W', was: '230'},
          {label: 'FTP', value: '190 W', was: '183'},
          // A range is one value, not a change.
          {label: 'Zone 2', value: '102–137 W'},
        ],
      },
    ]);
  });

  it('keeps the old value\'s own unit when it differs, and leaves words around an arrow alone', () => {
    expect(splitReplyBlocks('- Long ride: 3 h вместо 150 мин\n- Tempo: 2 × 15 min\n- Route: A → B, 40 km')).toEqual([
      {
        kind: 'rows',
        rows: [
          {label: 'Long ride', value: '3 h', was: '150 мин'},
          {label: 'Tempo', value: '2 × 15 min'},
          {label: 'Route', value: 'A → B, 40 km'},
        ],
      },
    ]);
  });

  it('gives nothing for an empty reply', () => {
    expect(splitReplyBlocks('')).toEqual([]);
  });
});

describe('isLongNote', () => {
  it('is true past five lines or a few sentences, false for an ordinary message', () => {
    expect(isLongNote('Ok, put the plan in the calendar')).toBe(false);
    expect(isLongNote('a\nb\nc\nd\ne\nf')).toBe(true);
    expect(isLongNote('x'.repeat(281))).toBe(true);
  });
});

describe('replyPreview', () => {
  const paragraph = (n: number) => `Paragraph ${n}: ${'steady riding in zone two builds the base. '.repeat(6).trim()}`;

  it('is null for a reply that fits a screen or two', () => {
    expect(replyPreview('Ride easy tomorrow.')).toBeNull();
    expect(replyPreview('x'.repeat(1400))).toBeNull();
  });

  it('keeps the opening paragraphs of a long reply, ending between two of them', () => {
    const content = Array.from({length: 8}, (_, i) => paragraph(i + 1)).join('\n\n');
    const preview = replyPreview(content) as string;
    expect(preview.length).toBeLessThanOrEqual(700);
    expect(content.startsWith(preview)).toBe(true);
    expect(preview.endsWith('builds the base.')).toBe(true);
    expect(preview.split('\n\n')).toHaveLength(2);
  });

  it('falls back to the end of a line, then of a word, when there is no paragraph break to cut at', () => {
    const lines = Array.from({length: 40}, (_, i) => `- Week ${i + 1}: three rides, the long one a little longer`).join('\n');
    const byLine = replyPreview(lines) as string;
    expect(byLine.endsWith('a little longer')).toBe(true);
    const oneLine = 'word '.repeat(400);
    const byWord = replyPreview(oneLine) as string;
    expect(byWord.endsWith('word')).toBe(true);
    expect(replyPreview('x'.repeat(2000))).toHaveLength(700);
  });
});
