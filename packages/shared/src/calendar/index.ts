/**
 * Pure calendar helpers shared by the app's Calendar screen and the web's
 * /calendar page (local date math, the month grid, grouping by day, the
 * coach's start/end-time duration encoding) plus the RFC 5545 `.ics` builder
 * the web uses to hand created events to the rider's own calendar app.
 */
export * from './dates.js';
export * from './ics.js';
