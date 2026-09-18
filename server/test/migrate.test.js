const fs = require('fs');
const path = require('path');

// node-pg-migrate itself needs a live Postgres to actually run migrations
// against (this environment has none — see docs/audit/00-AUDIT-AND-PLAN.md
// T-1.4), so these tests stick to what's checkable without a DB connection:
// that migrate.js wires node-pg-migrate up correctly (shape/exports only),
// that every committed migration file is valid, non-empty-or-comment-only
// SQL input, and that the schema DDL this task moved out of server.js /
// achievements.js is actually gone from there (S-29's DoD).

describe('migrate.js', () => {
  it('exports a runMigrations function', () => {
    const { runMigrations } = require('../migrate');
    expect(typeof runMigrations).toBe('function');
  });
});

describe('server/migrations/*.sql', () => {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  it('has at least the baseline and startup-iife migrations', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\d+_baseline\.sql$/),
        expect.stringMatching(/^\d+_startup-iife\.sql$/),
      ])
    );
  });

  it.each(files)('%s is non-empty and has at least one non-comment, non-blank line', (file) => {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);

    const meaningfulLines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'));

    // The baseline migration is a deliberate placeholder (see its own
    // comment) until someone runs scripts/dump-schema.js against prod and
    // commits the result — everything else must already contain real SQL.
    if (/_baseline\.sql$/.test(file)) {
      return;
    }
    expect(meaningfulLines.length).toBeGreaterThan(0);
  });

  it('startup-iife migration contains the tables the old IIFE created', () => {
    const content = fs.readFileSync(
      path.join(migrationsDir, files.find((f) => /_startup-iife\.sql$/.test(f))),
      'utf8'
    );
    for (const table of [
      'oauth_states',
      'auth_codes',
      'bike_component_resets',
      'bike_component_labels',
      'analytics_snapshots',
      'achievements',
      'user_achievements',
      'coach_conversations',
      'coach_messages',
      'synced_activities',
      'synced_bikes',
      'calendar_events',
      'oura_daily_data',
    ]) {
      expect(content).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
  });
});

describe('S-29 DoD: no schema DDL left in application code', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const achievementsJs = fs.readFileSync(path.join(__dirname, '..', 'achievements.js'), 'utf8');

  // Matches an actual DDL statement, not the word appearing inside a comment
  // explaining that it used to be here.
  const ddlPattern = /^\s*(await\s+)?(pool\.query\(`?\s*)?(CREATE TABLE|ALTER TABLE)\b/im;

  it('server.js contains no CREATE TABLE / ALTER TABLE statements', () => {
    const codeOnly = stripLineComments(serverJs);
    expect(codeOnly).not.toMatch(ddlPattern);
  });

  it('achievements.js contains no CREATE TABLE / ALTER TABLE statements', () => {
    const codeOnly = stripLineComments(achievementsJs);
    expect(codeOnly).not.toMatch(ddlPattern);
  });
});

function stripLineComments(src) {
  return src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}
