// Guards against the old `{ error: true, message: X }` error-response shape
// (T-1.5, docs/audit/layers/04-cross-layer.md §5.6) creeping back in. Every
// error body must be `{ error: '<string>', code: 'UPPER_SNAKE' }` instead.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function filesToScan() {
  const files = ['server.js', 'achievements.js', 'aiCoach.js'];
  for (const dir of ['routes', 'recommendations']) {
    const full = path.join(ROOT, dir);
    if (fs.existsSync(full)) {
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.js')) files.push(path.join(dir, f));
      }
    }
  }
  return files.filter((f) => fs.existsSync(path.join(ROOT, f)));
}

describe('error response format', () => {
  it('never uses the legacy `error: true` shape anywhere in server/routes', () => {
    const offenders = [];
    for (const rel of filesToScan()) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (/error:\s*true\b/.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
