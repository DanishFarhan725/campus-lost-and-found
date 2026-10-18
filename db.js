// db.js
// Data layer with two interchangeable backends behind the same async API:
//  - On Netlify (USE_BLOBS=1): Netlify Blobs, one record per key, so concurrent
//    requests never overwrite each other's whole list.
//  - Locally (`npm start`): the original JSON files in ./data.

const fs = require('fs');
const path = require('path');

const useBlobs = () => process.env.USE_BLOBS === '1';

// ---------- JSON file backend (local) ----------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---------- Blobs backend (Netlify) ----------
function stores() {
  const { getStore } = require('@netlify/blobs');
  return {
    users: getStore({ name: 'users', consistency: 'strong' }),
    items: getStore({ name: 'items', consistency: 'strong' }),
  };
}

function init() {
  if (useBlobs()) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(USERS_FILE, []);
  ensureFile(ITEMS_FILE, []);
}

// ---------- Users ----------
async function findUserByEmail(email) {
  const key = String(email).toLowerCase();
  if (useBlobs()) {
    const { users } = stores();
    const id = await users.get(`email:${key}`);
    return id ? users.get(`id:${id}`, { type: 'json' }) : null;
  }
  return readJSON(USERS_FILE).find(u => u.email.toLowerCase() === key) || null;
}

async function findUserById(id) {
  if (useBlobs()) {
    return stores().users.get(`id:${id}`, { type: 'json' });
  }
  return readJSON(USERS_FILE).find(u => u.id === id) || null;
}

// Returns null if the email is already taken.
async function addUser(user) {
  if (useBlobs()) {
    const { users } = stores();
    // Save the profile first, then claim the email, so a claimed email always points to a real user
    await users.setJSON(`id:${user.id}`, user);
    const { modified } = await users.set(`email:${user.email.toLowerCase()}`, user.id, { onlyIfNew: true });
    if (!modified) {
      await users.delete(`id:${user.id}`);
      return null;
    }
    return user;
  }
  const users = readJSON(USERS_FILE);
  if (users.some(u => u.email.toLowerCase() === user.email.toLowerCase())) return null;
  users.push(user);
  writeJSON(USERS_FILE, users);
  return user;
}

// ---------- Items ----------
async function getItems() {
  if (useBlobs()) {
    const { items } = stores();
    const { blobs } = await items.list();
    const all = await Promise.all(blobs.map(b => items.get(b.key, { type: 'json' })));
    return all.filter(Boolean);
  }
  return readJSON(ITEMS_FILE);
}

async function findItemById(id) {
  if (useBlobs()) {
    return stores().items.get(id, { type: 'json' });
  }
  return readJSON(ITEMS_FILE).find(i => i.id === id) || null;
}

async function addItem(item) {
  if (useBlobs()) {
    await stores().items.setJSON(item.id, item);
    return item;
  }
  const items = readJSON(ITEMS_FILE);
  items.push(item);
  writeJSON(ITEMS_FILE, items);
  return item;
}

async function updateItem(id, updates) {
  if (useBlobs()) {
    const { items } = stores();
    const current = await items.get(id, { type: 'json' });
    if (!current) return null;
    const next = { ...current, ...updates };
    await items.setJSON(id, next);
    return next;
  }
  const items = readJSON(ITEMS_FILE);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  writeJSON(ITEMS_FILE, items);
  return items[idx];
}

async function deleteItem(id) {
  if (useBlobs()) {
    const { items } = stores();
    const current = await items.get(id, { type: 'json' });
    if (!current) return false;
    await items.delete(id);
    return current;
  }
  const items = readJSON(ITEMS_FILE);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return false;
  const removed = items.splice(idx, 1)[0];
  writeJSON(ITEMS_FILE, items);
  return removed;
}

module.exports = {
  init,
  findUserByEmail,
  findUserById,
  addUser,
  getItems,
  findItemById,
  addItem,
  updateItem,
  deleteItem,
};
