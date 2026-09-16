// T-1.6 (docs/audit/layers/01-server.md S-42) — console.* must be gone from
// the server's own application code (pino via lib/logger.js everywhere
// instead). Two narrow, explicitly-listed exceptions remain by design:
//   - config/index.js: runs before lib/logger.js can even be constructed
//     (it validates the env logger.js itself depends on), so it's still
//     allowed to console.error/warn during startup validation failures.
//   - server.js's process-level shutdown/uncaught handlers: these run at
//     a point where Express/pino-http request context doesn't apply and
//     the process is about to exit, so a plain console.error is kept as a
//     last-resort, best-effort log alongside the Sentry capture.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Directories/files this task touched, per the console.* -> logger.*
// migration (server/*.js at the top level, plus these subdirectories).
const SCAN_TARGETS = [
  'server.js',
  'routes',
  'services',
  'middleware',
  'lib',
  'recommendations',
  'achievements.js',
  'aiAnalysis.js',
  'aiCoach.js',
  'aiGoals.js',
  'brevo-config.js',
  'imagekit-config.js',
  'ouraService.js',
  'db.js',
];

// Explicit exceptions: {file: [allowed console.* substrings, matched by line}
const ALLOWED_CONSOLE_LINES = {
  'config/index.js': [
    "console.error('Invalid environment configuration:",
    'console.error(`Invalid environment configuration:',
    "console.warn(",
  ],
  'server.js': [
    // process.on('unhandledRejection'...) / process.on('uncaughtException'...)
    "console.error('unhandledRejection', r)",
    'console.error(e)',
  ],
};

function walk(rel) {
  const full = path.join(ROOT, rel);
  const stat = fs.statSync(full);
  if (stat.isFile()) return [rel];
  const out = [];
  for (const entry of fs.readdirSync(full)) {
    if (entry === 'node_modules') continue;
    const childRel = path.join(rel, entry);
    const childFull = path.join(ROOT, childRel);
    if (fs.statSync(childFull).isDirectory()) {
      out.push(...walk(childRel));
    } else if (entry.endsWith('.js')) {
      out.push(childRel);
    }
  }
  return out;
}

function isAllowed(rel, line) {
  const allowed = ALLOWED_CONSOLE_LINES[rel];
  if (!allowed) return false;
  return allowed.some((snippet) => line.includes(snippet));
}

describe('no bare console.* left in migrated server code', () => {
  it('server.js, routes/, services/, middleware/, lib/, recommendations/ and the top-level *.js modules use logger, not console', () => {
    const offenders = [];
    const allFiles = new Set();
    for (const target of SCAN_TARGETS) walk(target).forEach((f) => allFiles.add(f));

    for (const rel of allFiles) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      content.split('\n').forEach((line, i) => {
        if (/console\.(log|warn|error|info|debug)\s*\(/.test(line) && !isAllowed(rel, line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
