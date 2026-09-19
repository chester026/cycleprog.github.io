// T-7.1 DoD: every mounted route is either declared in the shared API
// contract (@bikelab/shared/api `contract`) and guarded by contract(def), or
// explicitly marked uncontracted(reason). And every contract entry maps to a
// real route — so a removed route can't linger in the client-facing
// contract. Requires server.js without booting (require.main guard).
const { inventory } = require('../lib/routeInventory');
const shared = require('@bikelab/shared/api');

const { app } = require('../server');

describe('API contract inventory', () => {
  const routes = inventory(app).filter((r) => r.path.startsWith('/api'));
  const registry = shared.contract || {};
  const declared = new Map(shared.listEndpoints(registry).map((e) => [shared.endpointKey(e.def), e]));

  it('finds the mounted /api routes', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('every /api route is contracted or explicitly uncontracted', () => {
    const missing = routes
      .filter((r) => !r.contracted && !r.uncontracted)
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(missing, `routes without contract()/uncontracted():\n${missing.join('\n')}`).toEqual([]);
  });

  it('every contracted route has a contract entry with the same method+path', () => {
    const undeclared = routes
      .filter((r) => r.contracted && !declared.has(`${r.method} ${r.path}`))
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(undeclared, `contracted routes missing from shared contract:\n${undeclared.join('\n')}`).toEqual([]);
  });

  it('every contract entry maps to a mounted route', () => {
    const mounted = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const stale = [...declared.keys()].filter((k) => !mounted.has(k)).sort();
    expect(stale, `contract entries with no route:\n${stale.join('\n')}`).toEqual([]);
  });
});
