const { spawnSync } = require('child_process');
const path = require('path');

// A minimal but fully valid env for ./config — spawned in a fresh process so
// we can assert on process.exit(1)/stderr without tearing down this test
// worker's own already-loaded ../config module.
// Deliberately NOT spread from process.env: this test worker's own env
// (set by test/setup-env.js) already has valid values for everything below,
// which would mask a bug in a test that deletes one of these keys. PATH is
// kept so the spawned `node` resolves cleanly on every platform.
function validEnv(overrides = {}) {
  return {
    PATH: process.env.PATH,
    NODE_ENV: 'development',
    JWT_SECRET: 'x'.repeat(32),
    STRAVA_CLIENT_ID: 'client-id',
    STRAVA_CLIENT_SECRET: 'client-secret',
    OPENAI_API_KEY: 'sk-test',
    PGHOST: 'localhost',
    ...overrides,
  };
}

// Run from a temp cwd so dotenv does NOT pick up a developer's real
// server/.env and silently fill in the variables the test deliberately omits.
const os = require('os');
const configPath = path.join(__dirname, '..', 'config', 'index.js');

function runConfig(env) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
  });
}

describe('config/index.js', () => {
  it('exits 0 with a minimal valid env', () => {
    const result = runConfig(validEnv());
    expect(result.status).toBe(0);
  });

  it('exits 1 and reports JWT_SECRET when it is missing', () => {
    const env = validEnv();
    delete env.JWT_SECRET;
    const result = runConfig(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });

  it('accepts DATABASE_URL instead of PGHOST', () => {
    const env = validEnv({ DATABASE_URL: 'postgres://user:pass@host:5432/db' });
    delete env.PGHOST;
    const result = runConfig(env);
    expect(result.status).toBe(0);
  });

  it('exits 1 when neither DATABASE_URL nor PGHOST is set', () => {
    const env = validEnv();
    delete env.PGHOST;
    const result = runConfig(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/PGHOST/);
  });

  it('exits 1 when JWT_SECRET is under 32 chars in production', () => {
    const env = validEnv({ NODE_ENV: 'production', JWT_SECRET: 'short-secret-16c' });
    const result = runConfig(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });

  it('exits 0 (with a warning) when JWT_SECRET is 8-31 chars outside production', () => {
    const env = validEnv({ JWT_SECRET: 'twelve-chars' });
    const result = runConfig(env);
    expect(result.status).toBe(0);
  });

  it('exits 1 when JWT_SECRET is under 8 chars even outside production', () => {
    const env = validEnv({ JWT_SECRET: 'short' });
    const result = runConfig(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });
});
