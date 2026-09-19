// Walks a mounted Express 4 app and returns every concrete route with its
// full path, methods and whether it carries a contract()/uncontracted()
// marker (middleware/contract.js). Used by test/contract.inventory.test.js
// (fails on routes missing from the shared contract) and `npm run routes`
// (the generated route list — T-7.1 DoD).
//
// Express 4 stores a mount prefix only as a regexp (layer.regexp) plus
// `layer.keys`; the reconstruction below covers what this app uses (static
// string mounts like '/api/activities' and ':param' segments) — anything
// fancier surfaces as `<regexp>` so the inventory test flags it.

function layerPathFromRegexp(layer) {
  if (layer.path) return layer.path;
  const src = layer.regexp && layer.regexp.source;
  if (!src) return '';
  if (layer.regexp.fast_slash) return '';
  // Express builds: ^\/api\/activities\/?(?=\/|$)  for app.use('/api/activities', ...)
  let s = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
  // Path params in mount points: (?:([^\/]+?)) per key.
  const keys = (layer.keys || []).map((k) => k.name);
  let i = 0;
  s = s.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, () => `:${keys[i++] ?? 'param'}`);
  if (/[()\\?*+]/.test(s)) return `<${src}>`;
  return s;
}

function collect(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      const route = layer.route;
      const methods = Object.keys(route.methods).filter((m) => route.methods[m]).map((m) => m.toUpperCase());
      const markers = route.stack.map((l) => l.handle);
      const contractLayer = markers.find((h) => h && h.name === 'contractMiddleware');
      const uncontractedLayer = markers.find((h) => h && h.__uncontracted);
      const paths = Array.isArray(route.path) ? route.path : [route.path];
      for (const p of paths) {
        for (const method of methods) {
          if (method === '_ALL') continue;
          out.push({
            method,
            path: normalize(prefix + p),
            contracted: Boolean(contractLayer),
            uncontracted: uncontractedLayer ? uncontractedLayer.__uncontracted : null,
          });
        }
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      collect(layer.handle.stack, prefix + layerPathFromRegexp(layer), out);
    }
  }
}

function normalize(p) {
  const s = p.replace(/\/{2,}/g, '/');
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;
}

function inventory(app) {
  const out = [];
  collect(app._router.stack, '', out);
  return out;
}

module.exports = { inventory };
