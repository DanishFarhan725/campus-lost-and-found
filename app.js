// app.js
// Builds the Express app. Used by server.js (local `npm start`) and by the
// Netlify Function in netlify/functions/api.js.
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const db = require('./db');
const images = require('./images');
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');

function createApp() {
  const app = express();

  // ---------- Setup ----------
  db.init();
  images.init();

  // ---------- Middleware ----------
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.set('trust proxy', 1);

  if (!process.env.SESSION_SECRET && process.env.USE_BLOBS === '1') {
    console.warn('SESSION_SECRET is not set: sessions are signed with an insecure default key.');
  }

  // Sessions live in a signed cookie, so they work across serverless instances
  app.use(
    cookieSession({
      name: 'session',
      keys: [process.env.SESSION_SECRET || 'dev-only-change-me'],
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  );

  // Static files (on Netlify these are served by the CDN instead)
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(images.UPLOADS_DIR));

  // Uploaded photos stored in Netlify Blobs
  app.get('/uploads/:filename', async (req, res, next) => {
    try {
      const image = await images.getImage(req.params.filename);
      if (!image) return next();
      res.set('Content-Type', image.contentType);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(image.data);
    } catch (err) {
      next(err);
    }
  });

  // ---------- API routes ----------
  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemRoutes);

  // ---------- Fallback to index.html for any other route (SPA) ----------
  // IMPORTANT: only fall back for actual page routes. Asset paths (api, uploads,
  // css, js) that reach this point genuinely don't exist and must 404 normally —
  // otherwise a missing image/script would silently serve the HTML shell instead.
  app.get('*', (req, res, next) => {
    const isAssetPath =
      req.path.startsWith('/api/') ||
      req.path.startsWith('/uploads/') ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/');
    if (isAssetPath) return res.status(404).json({ error: 'Not found.' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ---------- Error handling (catch-all, last resort) ----------
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

module.exports = createApp;
