// Shared constants between global-setup.cjs and the spec files (T-6.5, audit
// W-38..W-41). Kept tiny and dependency-free (no `dotenv`, no test-runner
// APIs) so it can be `require()`d from playwright.config.js too, before any
// Playwright globals exist.
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');

// Fixed (not dynamically probed) ports — this suite always runs alone in
// its own CI job/container, so a static port avoids the
// "pick-a-free-port-before-config-loads" chicken-and-egg problem: Playwright
// reads `use.baseURL` from playwright.config.js before global-setup ever
// runs, so the web port can't be discovered dynamically without also
// threading it back into the config file.
const API_PORT = Number(process.env.E2E_API_PORT || 8099);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5183);

const E2E_DB = process.env.E2E_DB || 'bikelab_e2e';

const SEED_EMAIL = 'e2e-smoke@example.com';
const SEED_PASSWORD = 'Sup3rSecret!';

module.exports = {
  REPO_ROOT,
  SERVER_DIR,
  API_PORT,
  WEB_PORT,
  E2E_DB,
  SEED_EMAIL,
  SEED_PASSWORD,
};
