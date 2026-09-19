#!/usr/bin/env node
// `npm run routes` — the route list generated from code (T-7.1 DoD).
// Prints METHOD PATH  [contract|uncontracted: reason|MISSING].
const { inventory } = require('../lib/routeInventory');
const { app } = require('../server');
const rows = inventory(app).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
for (const r of rows) {
  const status = r.contracted ? 'contract' : r.uncontracted ? `uncontracted: ${r.uncontracted}` : 'MISSING';
  console.log(`${r.method.padEnd(6)} ${r.path.padEnd(52)} ${status}`);
}
process.exit(0);
