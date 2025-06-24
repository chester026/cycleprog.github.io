const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = 8080;

const CLIENT_ID = '165560';
const CLIENT_SECRET = 'eb3045c2a8ff4b1d2157e26ec14be58aa6fe995f';
let access_token = '';
let refresh_token = '';
let expires_at = 0;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/exchange_token', async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });
    access_token = response.data.access_token;
    refresh_token = response.data.refresh_token;
    expires_at = response.data.expires_at;
    res.redirect('/trainings.html');
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Token exchange failed');
  }
});

app.get('/activities', async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    if (now >= expires_at) {
      const refresh = await axios.post('https://www.strava.com/oauth/token', {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      });
      access_token = refresh.data.access_token;
      refresh_token = refresh.data.refresh_token;
      expires_at = refresh.data.expires_at;
    }

    const activities = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    res.json(activities.data);
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Failed to fetch activities');
  }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
