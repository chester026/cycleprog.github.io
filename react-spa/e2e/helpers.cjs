// Shared steps for the Playwright specs: the seeded-user login and the
// coach SSE mock's control API (e2e/coach-stream-mock.cjs). Plain CommonJS
// so playwright.config.cjs-style `require()` works without a build step.
const { expect } = require('@playwright/test');
const { SEED_EMAIL, SEED_PASSWORD, COACH_MOCK_PORT } = require('./env.cjs');

const MOCK_URL = `http://127.0.0.1:${COACH_MOCK_PORT}`;

async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(SEED_EMAIL);
  await page.getByPlaceholder('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/garage$/);
}

/** One SSE frame for a coach event object. */
const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;

/** Programs the next POST /api/coach/chat reply; `holdOpen` keeps heartbeating until the client closes. */
async function scriptCoachStream(request, frames, holdOpen = false) {
  const res = await request.put(`${MOCK_URL}/__script`, { data: { frames, holdOpen } });
  expect(res.status()).toBe(204);
}

/** Every chat request body the mock saw since the last script. */
async function coachRequests(request) {
  return (await request.get(`${MOCK_URL}/__requests`)).json();
}

/** `route.fulfill` with a JSON body — for API reads the test answers itself. */
function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

module.exports = { login, sse, scriptCoachStream, coachRequests, json };
