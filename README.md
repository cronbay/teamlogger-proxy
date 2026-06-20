# Cronbay TeamLogger Proxy

A tiny server that forwards screenshot requests to TeamLogger's API, bypassing browser CORS restrictions.

## Why this exists

Browsers block direct calls from a webpage to `api2.teamlogger.com` due to CORS policy. This proxy runs the request server-side (like `curl` does), then returns the result to your browser — no CORS issue.

## Deploy to Render.com (free, ~10 minutes)

1. Go to https://render.com and sign up (free, no credit card needed for this tier)
2. Click **New +** → **Web Service**
3. Choose **"Deploy from a Git repository"** OR **"Public Git repository"**
   - If you don't have a GitHub repo, use the steps below to create one first
4. Settings:
   - **Name:** `cronbay-teamlogger-proxy`
   - **Region:** Singapore (closest to India)
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Click **Create Web Service**
6. Wait ~2 minutes for deployment
7. Render will give you a URL like: `https://cronbay-teamlogger-proxy.onrender.com`

## How to get this code onto GitHub first

1. Go to https://github.com and create a free account if you don't have one
2. Click **New repository** → name it `teamlogger-proxy` → make it **Private** → Create
3. Upload these two files (`server.js` and `package.json`) using the **"uploading an existing file"** link on the new repo page
4. Commit the files
5. Go back to Render.com and point it to this repository

## Using the proxy

Once deployed, your dashboard calls:
```
https://cronbay-teamlogger-proxy.onrender.com/api/screenshots?employee=CT01082024&year=2026&month=5&day=22&keyValue=YOUR_KEY_VALUE&keyId=YOUR_KEY_ID&dayStartsAtHours=9&dayEndsAtHours=19
```

Instead of calling TeamLogger directly.

## Important notes

- **Free tier sleeps after 15 mins of inactivity** — first request after idle may take ~30 seconds to "wake up" the server. This is fine for daily manual checks.
- **Your API keys are passed as query parameters** to your own proxy — this is fine since only you control and access this proxy URL, but don't share the proxy URL publicly.
- To keep the server always warm, you can upgrade to Render's paid tier later, or use a free "ping" service to hit the URL every 10 minutes.
