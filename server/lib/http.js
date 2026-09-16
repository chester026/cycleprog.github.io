// Shared axios instances with a sane default timeout. Everything this server
// calls with axios is an external HTTP dependency (Strava, Open-Meteo,
// Brevo, Oura, ImageKit's own image CDN via the proxy route) — none of it
// should be able to hang a request indefinitely.
const axios = require('axios');

const stravaHttp = axios.create({ timeout: 10000 });
const externalHttp = axios.create({ timeout: 10000 });

module.exports = { stravaHttp, externalHttp };
