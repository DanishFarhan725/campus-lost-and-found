// server.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Setup ----------
db.init();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

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

app.listen(PORT, () => {
  console.log(`\n🎒 Campus Lost & Found running at http://localhost:${PORT}\n`);
});
