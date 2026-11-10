// Minimal in-memory ZIP reader (stored + deflate entries, no zip64, no
// encryption). Garmin's Personal API hands an activity's original file back
// as a ZIP (GET /download-service/files/activity/:id) and nothing else in
// the server reads archives yet, so this stays dependency-free. Account
// exports with thousands of files need a streaming reader instead — this
// one holds everything in memory and refuses anything past MAX_ENTRY_BYTES.
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const EOCD_MAX_COMMENT = 0xffff;

// A single activity file is a few MB at most; the cap is what stops a
// crafted archive from inflating to gigabytes.
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

function findEocd(buf) {
  const lowest = Math.max(0, buf.length - EOCD_MIN - EOCD_MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= lowest; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * @param {Buffer} buf a whole ZIP archive
 * @returns {{name: string, data: Buffer}[]} files only (directory entries are skipped)
 */
function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < EOCD_MIN) throw new Error('Not a ZIP archive');
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('Not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) throw new Error('Corrupt ZIP directory');
    const flags = buf.readUInt16LE(offset + 8);
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const size = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error(`Encrypted ZIP entry: ${name}`);
    if (size > MAX_ENTRY_BYTES) throw new Error(`ZIP entry too large: ${name}`);
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error('Corrupt ZIP entry');
    // The local header repeats name/extra with its OWN lengths — the extra
    // field often differs from the central directory's.
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    if (raw.length !== compressedSize) throw new Error('Truncated ZIP entry');

    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
    else throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

module.exports = { readZip, MAX_ENTRY_BYTES };
