// Scripted stand-in for POST /api/coach/chat (SSE), booted by
// global-setup.cjs and reached through Vite's `/api/coach/chat` proxy so the
// browser sees a same-origin stream. A spec programs it before sending:
//
//   PUT  /__script  {frames: string[], holdOpen: boolean}
//        frames are raw SSE text (`data: {...}\n\n` or `: ping\n\n`), written
//        150 ms apart; with holdOpen the connection stays up on heartbeats
//        until the client closes it (what the Stop button does).
//   GET  /__requests → every chat request body seen since the last script.
//
// Anything else answers 404 so an unexpected call fails loudly.
const http = require('http');

const FRAME_INTERVAL_MS = 150;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function startCoachStreamMock(port) {
  let script = { frames: [], holdOpen: false };
  let requests = [];

  const server = http.createServer(async (req, res) => {
    if (req.method === 'PUT' && req.url === '/__script') {
      script = await readJson(req);
      requests = [];
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(requests));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/coach/chat') {
      requests.push(await readJson(req));
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      let i = 0;
      const tick = setInterval(() => {
        if (i < script.frames.length) {
          res.write(script.frames[i++]);
        } else if (script.holdOpen) {
          res.write(': ping\n\n');
        } else {
          clearInterval(tick);
          res.end();
        }
      }, FRAME_INTERVAL_MS);
      req.on('close', () => clearInterval(tick));
      return;
    }
    res.writeHead(404).end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startCoachStreamMock };
