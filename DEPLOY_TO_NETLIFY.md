# Deploy Campus Lost & Found to Netlify

On Netlify the app runs without a long-lived server:

- **Pages** (`public/`) are served by Netlify's CDN.
- **The Express API** runs as one Netlify Function (`netlify/functions/api.js`). `/api/*` and `/uploads/*` are routed to it in `netlify.toml`.
- **Users, items and photos** are stored in Netlify Blobs (stores `users`, `items`, `images`), so they persist between deploys.
- **Logins** use a signed cookie (`cookie-session`), so they work across function instances.

## Required setting

Set an environment variable named `SESSION_SECRET` to a long random string (Project configuration > Environment variables, scope: Functions). Changing it logs everyone out.

## Limits

- Photos are limited to 4MB (Netlify Functions accept up to about 4.5MB per request).
- Blobs is simple key/value storage, fine for a campus-sized project. For heavy use, move users and items to a real database.

## Running locally

`npm install` then `npm start` still works exactly as before, using `data/*.json` and `uploads/` on your computer.
