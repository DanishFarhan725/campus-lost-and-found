// db.js
// Lightweight JSON-file "database" — chosen instead of SQLite so this project
// installs with zero native compilation issues on any machine (Windows/Mac/Linux).
// Still provides real persistence and full CRUD, just stored as JSON on disk.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');

function ensureFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(USERS_FILE, []);
  ensureFile(ITEMS_FILE, []);
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

// ---------- Users ----------
function getUsers() {
  return readJSON(USERS_FILE);
}

function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

function findUserByEmail(email) {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
}

function findUserById(id) {
  const users = getUsers();
  return users.find(u => u.id === id);
}

function addUser(user) {
  const users = getUsers();
  users.push(user);
  saveUsers(users);
  return user;
}

// ---------- Items ----------
function getItems() {
  return readJSON(ITEMS_FILE);
}

function saveItems(items) {
  writeJSON(ITEMS_FILE, items);
}

function findItemById(id) {
  return getItems().find(i => i.id === id);
}

function addItem(item) {
  const items = getItems();
  items.push(item);
  saveItems(items);
  return item;
}

function updateItem(id, updates) {
  const items = getItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates };
  saveItems(items);
  return items[idx];
}

function deleteItem(id) {
  const items = getItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return false;
  const removed = items.splice(idx, 1)[0];
  saveItems(items);
  return removed;
}

module.exports = {
  init,
  getUsers,
  findUserByEmail,
  findUserById,
  addUser,
  getItems,
  findItemById,
  addItem,
  updateItem,
  deleteItem,
};
