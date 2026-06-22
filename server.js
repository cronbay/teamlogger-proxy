const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Cronbay TeamLogger Proxy' });
});

// Fetch screenshots and download images as base64 for Claude vision analysis
app.get('/api/screenshots', async (req, res) => {
  try {
    const { employee, year, month, day, timezoneOffsetMinutes } = req.query;

    const keyValue = process.env.TL_API_KEY;
    const keyId = process.env.TL_KEY_ID;

    if (!keyValue) {
      return res.status(500).json({ error: 'TL_API_KEY not configured in server environment' });
    }
    if (!employee || !year || !month || !day) {
      return res.status(400).json({ error: 'Missing required parameters: employee, year, month, day' });
    }

    // Fetch screenshot URLs from TeamLogger (no hour filters - return all screenshots for the day)
    const tlUrl = `https://api2.teamlogger.com/api/user_screenshot_urls?employee=${encodeURIComponent(employee)}&year=${year}&month=${month}&day=${day}&timezoneOffsetMinutes=${timezoneOffsetMinutes || -330}`;

    const headers = { 'Authorization': `Bearer ${keyValue}` };
    if (keyId) headers['X-API-Key-ID'] = keyId;

    console.log(`[Proxy] Fetching screenshot URLs for ${employee} on ${year}-${month}-${day}`);

    const tlResponse = await fetch(tlUrl, { headers });
    const screenshotData = await tlResponse.json();

    console.log(`[Proxy] Got ${Array.isArray(screenshotData) ? screenshotData.length : 0} screenshots`);

    if (!Array.isArray(screenshotData) || screenshotData.length === 0) {
      return res.json([]);
    }

    // Download up to 15 screenshots as base64 for Claude vision analysis
    // Space them evenly across the day for a representative sample
    const maxScreenshots = 15;
    const step = Math.ceil(screenshotData.length / maxScreenshots);
    const sampled = screenshotData.filter((_, i) => i % step === 0).slice(0, maxScreenshots);

    console.log(`[Proxy] Downloading ${sampled.length} sampled screenshots as base64...`);

    const screenshotsWithImages = await Promise.all(
      sampled.map(async (screenshot) => {
        try {
          const imgUrl = screenshot.screenshotUrl || screenshot.url || screenshot;
          if (!imgUrl || typeof imgUrl !== 'string') return { ...screenshot, base64: null };

          const imgResponse = await fetch(imgUrl);
          if (!imgResponse.ok) return { ...screenshot, base64: null };

          const arrayBuffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';

          return {
            screenshotTime: screenshot.screenshotTime,
            urlExpiresAt: screenshot.urlExpiresAt,
            base64,
            mediaType: contentType
          };
        } catch (e) {
          console.error(`[Proxy] Failed to download screenshot:`, e.message);
          return { screenshotTime: screenshot.screenshotTime, base64: null };
        }
      })
    );

    const successful = screenshotsWithImages.filter(s => s.base64);
    console.log(`[Proxy] Successfully downloaded ${successful.length} screenshots`);

    res.json({
      total: screenshotData.length,
      analysed: successful.length,
      screenshots: screenshotsWithImages
    });

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
});

// Claude AI analysis proxy - sends images + prompt to Claude vision
app.post('/api/analyze', async (req, res) => {
  try {
    const { prompt, apiKey, screenshots, maxTokens } = req.body;

    if (!prompt || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields: prompt, apiKey' });
    }

    // Build message content - include actual images if available
    let messageContent = [];

    if (screenshots && screenshots.length > 0) {
      const validScreenshots = screenshots.filter(s => s.base64);
      console.log(`[Proxy] Sending ${validScreenshots.length} images to Claude for visual analysis`);

      // Add each screenshot image
      for (const screenshot of validScreenshots) {
        if (screenshot.screenshotTime) {
          messageContent.push({
            type: 'text',
            text: `Screenshot taken at: ${screenshot.screenshotTime}`
          });
        }
        messageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: screenshot.mediaType || 'image/jpeg',
            data: screenshot.base64
          }
        });
      }
    }

    // Add the analysis prompt at the end
    messageContent.push({ type: 'text', text: prompt });

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
            max_tokens: maxTokens || 1500,
            messages: [{ role: 'user', content: messageContent }]
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
