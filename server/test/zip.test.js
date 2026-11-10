const zlib = require('zlib');
const { readZip } = require('../lib/zip');

// Builds a real archive by hand (local headers + central directory + EOCD)
// so the reader is tested against the format, not against itself.
function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = f.method === 8 ? zlib.deflateRawSync(f.data) : f.data;
    const extra = f.localExtra || Buffer.alloc(0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(f.flags || 0, 6);
    local.writeUInt16LE(f.method, 8);
    local.writeUInt32LE(raw.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(f.flags || 0, 8);
    central.writeUInt16LE(f.method, 10);
    central.writeUInt32LE(raw.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, extra, raw);
    centrals.push(central, name);
    offset += 30 + name.length + extra.length + raw.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

describe('readZip', () => {
  const fit = Buffer.concat([Buffer.from([14, 32, 0, 0, 0, 0, 0, 0]), Buffer.from('.FIT'), Buffer.alloc(4000, 7)]);

  it('reads deflated and stored entries, skipping directories', () => {
    const zip = buildZip([
      { name: 'rides/', method: 0, data: Buffer.alloc(0) },
      { name: 'rides/123_ACTIVITY.fit', method: 8, data: fit },
      { name: 'note.txt', method: 0, data: Buffer.from('привет') },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['rides/123_ACTIVITY.fit', 'note.txt']);
    expect(entries[0].data.equals(fit)).toBe(true);
    expect(entries[1].data.toString('utf8')).toBe('привет');
  });

  it('uses the local header\'s own extra-field length to find the data', () => {
    const zip = buildZip([{ name: 'a.fit', method: 8, data: fit, localExtra: Buffer.alloc(28, 1) }]);
    expect(readZip(zip)[0].data.equals(fit)).toBe(true);
  });

  it('rejects what it cannot read instead of returning garbage', () => {
    expect(() => readZip(Buffer.from('not a zip at all, just some text'))).toThrow('Not a ZIP archive');
    expect(() => readZip(Buffer.alloc(4))).toThrow('Not a ZIP archive');
    expect(() => readZip(buildZip([{ name: 'x', method: 12, data: fit }]))).toThrow('Unsupported ZIP compression method 12');
    expect(() => readZip(buildZip([{ name: 'x', method: 0, data: fit, flags: 1 }]))).toThrow('Encrypted ZIP entry');
    const truncated = buildZip([{ name: 'x', method: 0, data: fit }]);
    truncated.writeUInt32LE(fit.length + 9999, 30 + 1 + fit.length + 20); // central dir compressed size
    expect(() => readZip(truncated)).toThrow('Truncated ZIP entry');
  });
});
