const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Cronbay TeamLogger Proxy' });
});

// Main proxy - uses TL_API_KEY env var (avoids URL encoding corruption of long JWT tokens)
app.get('/api/screenshots', async (req, res) => {
  try {
    const { employee, year, month, day, dayStartsAtHours, dayEndsAtHours, timezoneOffsetMinutes } = req.query;

    const keyValue = process.env.TL_API_KEY;
    const keyId = process.env.TL_KEY_ID;

    if (!keyValue) {
      return res.status(500).json({ error: 'TL_API_KEY not configured in server environment' });
    }
    if (!employee || !year || !month || !day) {
      return res.status(400).json({ error: 'Missing required parameters: employee, year, month, day' });
    }

    let tlUrl = `https://api2.teamlogger.com/api/user_screenshot_urls?employee=${encodeURIComponent(employee)}&year=${year}&month=${month}&day=${day}&timezoneOffsetMinutes=${timezoneOffsetMinutes || -330}`;

    if (dayStartsAtHours && Number(dayStartsAtHours) > 0) tlUrl += `&dayStartsAtHours=${dayStartsAtHours}`;
    if (dayEndsAtHours && Number(dayEndsAtHours) > 0 && Number(dayEndsAtHours) < 24) tlUrl += `&dayEndsAtHours=${dayEndsAtHours}`;

    const headers = { 'Authorization': `Bearer ${keyValue}` };
    if (keyId) headers['X-API-Key-ID'] = keyId;

    console.log(`[Proxy] Fetching: ${tlUrl}`);

    const tlResponse = await fetch(tlUrl, { headers });
    const responseText = await tlResponse.text();

    console.log(`[Proxy] Status: ${tlResponse.status} | Body: ${responseText.slice(0, 300)}`);

    let responseData;
    try { responseData = JSON.parse(responseText); } catch (e) { responseData = { raw: responseText }; }

    res.status(tlResponse.status).json(responseData);

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

// Claude AI analysis proxy - uses apiKey from request body
app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, apiKey, maxTokens } = req.body;

    if (!prompt || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: prompt, apiKey' });
    }

    let claudeResponse;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens || 1200,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.error(`[Proxy] Claude attempt ${attempt} failed:`, err.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    if (lastError) throw lastError;

    const responseData = await claudeResponse.json();
    res.status(claudeResponse.status).json(responseData);

  } catch (error) {
    console.error('[Proxy] Claude API error:', error.message);
    res.status(502).json({ error: 'Proxy error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cronbay TeamLogger Proxy running on port ${PORT}`);
});
