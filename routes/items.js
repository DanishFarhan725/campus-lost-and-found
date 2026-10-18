// routes/items.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const images = require('../images');

const router = express.Router();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_CATEGORIES = ['Electronics', 'Books', 'ID Cards', 'Clothing', 'Bags', 'Keys', 'Other'];
// Netlify Functions accept request bodies up to ~4.5 MB of binary data
const MAX_IMAGE_MB = 4;

// ---------- Multer config (image upload, kept in memory then stored) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in to do that.' });
  }
  next();
}

// Looks up each poster once per request
function posterLookup() {
  const cache = new Map();
  return id => {
    if (!cache.has(id)) cache.set(id, db.findUserById(id));
    return cache.get(id);
  };
}

// ---------- GET /api/items  (browse, search, filter) ----------
router.get('/', async (req, res) => {
  try {
    let items = await db.getItems();
    const { search, category, type, status } = req.query;

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        i =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q)
      );
    }
    if (category && category !== 'All') {
      items = items.filter(i => i.category === category);
    }
    if (type && type !== 'All') {
      items = items.filter(i => i.type === type);
    }
    if (status && status !== 'All') {
      items = items.filter(i => i.status === status);
    }

    // Attach poster name (but never expose password hash etc.)
    const findPoster = posterLookup();
    const sorted = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const enriched = await Promise.all(
      sorted.map(async i => {
        const poster = await findPoster(i.userId);
        return { ...i, posterName: poster ? poster.name : 'Unknown User' };
      })
    );

    res.json({ items: enriched });
  } catch (err) {
    console.error('Browse items error:', err);
    res.status(500).json({ error: 'Could not load items right now.' });
  }
});

// ---------- GET /api/items/mine  (current user's posts) ----------
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const items = (await db.getItems())
      .filter(i => i.userId === req.session.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ items });
  } catch (err) {
    console.error('My items error:', err);
    res.status(500).json({ error: 'Could not load your posts right now.' });
  }
});

// ---------- GET /api/items/:id  (single item detail) ----------
router.get('/:id', async (req, res) => {
  try {
    const item = await db.findItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    const poster = await db.findUserById(item.userId);
    res.json({ item: { ...item, posterName: poster ? poster.name : 'Unknown User', posterEmail: poster ? poster.email : null } });
  } catch (err) {
    console.error('Item detail error:', err);
    res.status(500).json({ error: 'Could not load this item right now.' });
  }
});

// ---------- POST /api/items  (create new post) ----------
router.post('/', requireAuth, (req, res, next) => {
  upload.single('image')(req, res, err => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Image is too large. Please choose one under ${MAX_IMAGE_MB}MB.`
          : err.message || 'Image upload failed.';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { type, title, description, category, location, date } = req.body;

    if (!type || !['lost', 'found'].includes(type)) {
      return res.status(400).json({ error: 'Type must be either "lost" or "found".' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required.' });
    }
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Please choose a valid category.' });
    }
    if (!location || !location.trim()) {
      return res.status(400).json({ error: 'Location is required.' });
    }

    let imageFilename = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      imageFilename = `${uuidv4()}${ext}`;
      await images.saveImage(imageFilename, req.file.buffer, req.file.mimetype);
    }

    const item = {
      id: uuidv4(),
      userId: req.session.userId,
      type,
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      imageFilename,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    await db.addItem(item);
    res.status(201).json({ item });
  } catch (err) {
    console.error('Create item error:', err);
    res.status(500).json({ error: 'Could not create your post. Please try again.' });
  }
});

// ---------- PATCH /api/items/:id/status  (mark claimed / reopen) ----------
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const item = await db.findItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.userId !== req.session.userId) {
      return res.status(403).json({ error: 'You can only update your own posts.' });
    }
    const { status } = req.body;
    if (!['open', 'claimed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "open" or "claimed".' });
    }
    const updated = await db.updateItem(item.id, { status });
    res.json({ item: updated });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Could not update the item status.' });
  }
});

// ---------- DELETE /api/items/:id ----------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const item = await db.findItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.userId !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    if (item.imageFilename) {
      await images.deleteImage(item.imageFilename);
    }

    await db.deleteItem(item.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete item error:', err);
    res.status(500).json({ error: 'Could not delete the item.' });
  }
});

module.exports = router;
