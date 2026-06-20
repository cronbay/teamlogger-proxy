const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from any origin (your dashboard HTML file or claude.ai artifact)
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Cronbay TeamLogger Proxy' });
});

// Main proxy endpoint - forwards to TeamLogger API
app.get('/api/screenshots', async (req, res) => {
  try {
    const {
      employee,
      year,
      month,
      day,
      keyValue,
      keyId,
      dayStartsAtHours,
      dayEndsAtHours,
      timezoneOffsetMinutes
    } = req.query;

    if (!employee || !year || !month || !day || !keyValue) {
      return res.status(400).json({
        error: 'Missing required parameters: employee, year, month, day, keyValue'
      });
    }

    let tlUrl = `https://api2.teamlogger.com/api/user_screenshot_urls?employee=${encodeURIComponent(employee)}&year=${year}&month=${month}&day=${day}&timezoneOffsetMinutes=${timezoneOffsetMinutes || -330}`;

    if (dayStartsAtHours && Number(dayStartsAtHours) > 0) {
      tlUrl += `&dayStartsAtHours=${dayStartsAtHours}`;
    }
    if (dayEndsAtHours && Number(dayEndsAtHours) > 0 && Number(dayEndsAtHours) < 24) {
      tlUrl += `&dayEndsAtHours=${dayEndsAtHours}`;
    }

    const headers = {
      'Authorization': `Bearer ${keyValue}`
    };
    if (keyId) {
      headers['X-API-Key-ID'] = keyId;
    }

    console.log(`[Proxy] Fetching: ${tlUrl.replace(keyValue, '***')}`);

    const tlResponse = await fetch(tlUrl, { headers });
    const responseText = await tlResponse.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }

    res.status(tlResponse.status).json(responseData);

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

// Claude AI analysis proxy endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, apiKey, maxTokens } = req.body;

    if (!prompt || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: prompt, apiKey' });
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens || 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const responseText = await claudeResponse.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }

    res.status(claudeResponse.status).json(responseData);

  } catch (error) {
    console.error('[Proxy] Claude API error:', error.message);
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cronbay TeamLogger Proxy running on port ${PORT}`);
});
