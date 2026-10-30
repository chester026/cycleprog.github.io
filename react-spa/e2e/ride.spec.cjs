// Ride analysis e2e: Garage "Analyze ride" → RideAnalysisModal (streams, HR
// zones, goal progress) → "Discuss with Coach" → /coach?prompt=…&activity=…
// → the prompt auto-sends with the ride attached as hidden context.
//
// Activities only ever come from Strava (GET /api/activities answers `[]`
// for a user without a Strava link, and there is no table to seed), so the
// four activity reads are answered from the test; the by-activity lookup
// and everything else hit the real API, and the chat stream is the mock.
const { test, expect } = require('@playwright/test');
const { login, sse, scriptCoachStream, coachRequests, json } = require('./helpers.cjs');

const ACTIVITY_ID = 4242;
const CONVERSATION_ID = '33333333-4444-4555-8666-777777777777';

const activity = {
  id: ACTIVITY_ID,
  name: 'Sunday Gran Fondo',
  type: 'Ride',
  start_date: '2026-10-11T07:30:00Z',
  start_date_local: '2026-10-11T09:30:00Z',
  distance: 128400,
  moving_time: 17280,
  elapsed_time: 18000,
  total_elevation_gain: 1850,
  average_speed: 7.43,
  max_speed: 18.2,
  average_heartrate: 148,
  max_heartrate: 181,
  average_cadence: 84,
  map: { summary_polyline: null },
};

// 20 min at 1 s, HR sweeping across the zones so the distribution has bars.
const N = 1200;
const streams = {
  time: { data: Array.from({ length: N }, (_, i) => i) },
  heartrate: { data: Array.from({ length: N }, (_, i) => 120 + (i % 60)) },
  cadence: { data: Array.from({ length: N }, () => 84) },
  velocity_smooth: { data: Array.from({ length: N }, () => 7.4) },
  distance: { data: Array.from({ length: N }, (_, i) => i * 7.4) },
  altitude: { data: Array.from({ length: N }, (_, i) => 200 + (i % 300)) },
};

const goalProgress = [
  { id: 9, title: 'Climb 10 000 m', status: 'active', tier: 'epic', progress: 41, progressGain: 18, contributions: [] },
];

const pathIs = (pathname) => (url) => url.pathname === pathname;

test.describe('ride analysis', () => {
  test('opens the modal from Garage and hands the ride to the coach', async ({ page, request }) => {
    await page.route(pathIs('/api/activities'), (route) => json(route, [activity]));
    // PartnersLogo's device-brand lookup (useDeviceBrand) reads the ride's detail by id.
    await page.route(pathIs(`/api/activities/${ACTIVITY_ID}`), (route) => json(route, activity));
    await page.route(pathIs(`/api/activities/${ACTIVITY_ID}/streams`), (route) => json(route, streams));
    await page.route(pathIs(`/api/activities/${ACTIVITY_ID}/meta-goals-progress`), (route) => json(route, goalProgress));
    await scriptCoachStream(request, [
      sse({ type: 'conversation', conversation_id: CONVERSATION_ID }),
      sse({ type: 'token', content: 'Strong ride — your climbing is improving.' }),
      sse({ type: 'done', conversation_id: CONVERSATION_ID, message_id: 'm-ride' }),
    ]);

    await login(page);
    await page.getByRole('button', { name: 'Analyze ride' }).click();

    const modal = page.getByRole('dialog', { name: 'Ride Analytics' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Sunday Gran Fondo')).toBeVisible();
    await expect(modal.getByText('128.4 km')).toBeVisible();
    await expect(modal.getByText(/Ride Quality: \d+/)).toBeVisible();
    await expect(modal.getByText('HR Zones')).toBeVisible();
    await expect(modal.getByText('Climb 10 000 m')).toBeVisible();

    await modal.getByRole('button', { name: 'Discuss with Coach' }).click();
    await expect(modal).toBeHidden();

    // The deep link is consumed (params stripped) and the prompt auto-sent
    // with the ride id as hidden context.
    await expect(page.getByTestId('coach-chat')).toBeVisible();
    await expect(page.getByTestId('chat-bubble-user')).toContainText('Sunday Gran Fondo');
    await expect.poll(() => coachRequests(request)).toEqual([
      expect.objectContaining({ hidden_context: `activity_id: ${ACTIVITY_ID}`, conversation_id: null, client: 'web' }),
    ]);
    await expect(page.getByTestId('chat-bubble-assistant')).toContainText('your climbing is improving');
    await expect(page).toHaveURL(new RegExp(`/coach/c/${CONVERSATION_ID}$`));
  });
});
