const { downsampleStreamsResponse, parseDownsampleParam, MAX_DOWNSAMPLE_POINTS } = require('../lib/downsampleStreams');

describe('parseDownsampleParam', () => {
  it('returns null for missing/invalid input', () => {
    expect(parseDownsampleParam(undefined)).toBeNull();
    expect(parseDownsampleParam('')).toBeNull();
    expect(parseDownsampleParam('abc')).toBeNull();
    expect(parseDownsampleParam('0')).toBeNull();
    expect(parseDownsampleParam('-5')).toBeNull();
  });

  it('parses a positive integer', () => {
    expect(parseDownsampleParam('400')).toBe(400);
  });

  it('caps at MAX_DOWNSAMPLE_POINTS', () => {
    expect(parseDownsampleParam('999999')).toBe(MAX_DOWNSAMPLE_POINTS);
  });
});

describe('downsampleStreamsResponse', () => {
  function numericStream(n) {
    return { data: Array.from({ length: n }, (_, i) => i) };
  }

  it('returns the input unchanged when targetPoints is falsy', () => {
    const streams = { heartrate: numericStream(10) };
    expect(downsampleStreamsResponse(streams, null)).toBe(streams);
  });

  it('leaves a stream alone when it already fits within targetPoints', () => {
    const streams = { heartrate: numericStream(10) };
    const result = downsampleStreamsResponse(streams, 400);
    expect(result.heartrate.data).toEqual(streams.heartrate.data);
  });

  it('bucket-averages a numeric stream down to at most targetPoints', () => {
    const streams = { heartrate: numericStream(1000) };
    const result = downsampleStreamsResponse(streams, 100);
    expect(result.heartrate.data.length).toBeLessThanOrEqual(100);
    // Values should stay within the original range and be monotonically non-decreasing (bucket-averaged sequential ramp).
    for (let i = 1; i < result.heartrate.data.length; i += 1) {
      expect(result.heartrate.data[i]).toBeGreaterThanOrEqual(result.heartrate.data[i - 1]);
    }
    expect(result.heartrate.original_size).toBe(1000);
  });

  it('keeps time and heartrate index-aligned after downsampling (same reduced length)', () => {
    const streams = { heartrate: numericStream(1000), time: numericStream(1000) };
    const result = downsampleStreamsResponse(streams, 137);
    expect(result.heartrate.data.length).toBe(result.time.data.length);
  });

  it('bucket-firsts a latlng stream instead of averaging pairs', () => {
    const latlng = { data: Array.from({ length: 500 }, (_, i) => [i, i * 2]) };
    const result = downsampleStreamsResponse({ latlng }, 50);
    expect(result.latlng.data.length).toBeLessThanOrEqual(50);
    // Every point must be one of the original [lat, lng] pairs, not an average.
    for (const point of result.latlng.data) {
      expect(latlng.data).toContainEqual(point);
    }
  });

  it('passes through a stream field with no data array unchanged', () => {
    const streams = { heartrate: numericStream(10), weird: { foo: 'bar' } };
    const result = downsampleStreamsResponse(streams, 5);
    expect(result.weird).toEqual({ foo: 'bar' });
  });
});
