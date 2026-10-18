# Deploy Campus Lost & Found to Netlify

Netlify does not run a long-lived Express server and its function file system is temporary, so `npm start` with `data/*.json` and `uploads/` would lose everything. The app is set up to run like this instead:

- **Pages** (`public/`) are served by Netlify's CDN.
- **The Express API** runs as one Netlify Function (`netlify/functions/api.js`). `/api/*` and `/uploads/*` are routed to it in `netlify.toml`.
- **Users, items and photos** are stored in Netlify Blobs (stores `users`, `items`, `images`), so they persist between requests and deploys.
- **Logins** use a signed cookie (`cookie-session`), so they work across function instances.

## Deploy checklist

1. Push the repo to GitHub and import it in Netlify (Add new project > Import an existing project). `netlify.toml` already sets the publish folder and functions folder, and there's no build command.
2. Set an environment variable named `SESSION_SECRET` to a long random string (Project configuration > Environment variables, scope: Functions). Without it, sessions are signed with a public default key and the function logs a warning. Changing it logs everyone out.
3. Deploy. Netlify Blobs needs no setup; the stores are created on first write.
4. After deploying, register an account, post an item with a photo, and reload to confirm it persists.

## Limits

- Photos are limited to 4MB (Netlify Functions accept up to about 6MB per request, and uploads are base64-encoded on the way in).
- Blobs is simple key/value storage. Listing items reads every item, which is fine for a campus-sized project. For heavy use, move users and items to a real database.
- Data on Netlify starts empty. Local `data/*.json` files are not uploaded.

## Running locally

`npm install` then `npm start` still works exactly as before, using `data/*.json` and `uploads/` on your computer.
