// images.js
// Stores item photos. On Netlify (USE_BLOBS=1) they live in Netlify Blobs;
// locally they are written to ./uploads as before.

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const useBlobs = () => process.env.USE_BLOBS === '1';

function imageStore() {
  const { getStore } = require('@netlify/blobs');
  return getStore({ name: 'images', consistency: 'strong' });
}

function init() {
  if (useBlobs()) return;
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function saveImage(filename, buffer, contentType) {
  if (useBlobs()) {
    // Copy into a standalone ArrayBuffer (Node Buffers can share a larger pool)
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await imageStore().set(filename, bytes, { metadata: { contentType } });
    return;
  }
  await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);
}

// Returns { data: Buffer, contentType } or null
async function getImage(filename) {
  if (useBlobs()) {
    const entry = await imageStore().getWithMetadata(filename, { type: 'arrayBuffer' });
    if (!entry) return null;
    return { data: Buffer.from(entry.data), contentType: entry.metadata.contentType || 'application/octet-stream' };
  }
  return null; // local files are served by express.static
}

async function deleteImage(filename) {
  try {
    if (useBlobs()) await imageStore().delete(filename);
    else await fs.promises.unlink(path.join(UPLOADS_DIR, filename));
  } catch {
    // best-effort cleanup, ignore errors
  }
}

module.exports = { UPLOADS_DIR, init, saveImage, getImage, deleteImage };
