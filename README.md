# Campus Lost & Found Portal

A full-stack web app for a campus lost & found board. Students can report lost or found items, browse/search/filter what others have posted, and mark items as resolved once claimed.

## Tech stack

- **Backend:** Node.js + Express
- **Auth:** Sessions with `express-session`, passwords hashed with `bcryptjs`
- **Storage:** JSON files on disk (`/data`) — no database server to install, no native compilation. Real persistence, just simple.
- **Image uploads:** `multer`, validated for file type (JPG/PNG/WEBP/GIF) and size (max 5MB)
- **Frontend:** Vanilla HTML/CSS/JS single-page app — no build step, no framework needed

## How to run it

1. Make sure [Node.js](https://nodejs.org) is installed (v18 or newer recommended). Check with:
   ```
   node --version
   ```
2. Open a terminal in this folder and install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser to:
   ```
   http://localhost:3000
   ```

That's it — no database setup, no environment variables required.

## Project structure

```
lost-and-found/
├── server.js              # Express app entry point
├── db.js                  # JSON-file data layer (users + items)
├── routes/
│   ├── auth.js             # register / login / logout / me
│   └── items.js            # browse / post / claim / delete items
├── public/                 # frontend (served statically)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── data/                   # users.json + items.json get created here automatically
└── uploads/                # uploaded item photos get stored here
```

## Features

- Register / log in / log out (sessions, hashed passwords)
- Post a lost or found item with title, category, location, date, description, and an optional photo
- Browse all items with live search, type filter (lost/found), category filter, and status filter
- Click any item to see full details and contact the poster by email
- Mark your own items as resolved/claimed, or delete them
- "My Posts" page to manage everything you've posted
- Fully responsive — works on mobile, tablet, and desktop

## Notes for your demo / viva

- Data is stored in `data/users.json` and `data/items.json` — you can open these in a text editor to show your instructor the data is really being persisted.
- If you want to start with a completely clean slate, just delete the contents of `data/` and `uploads/` and restart the server.
- Passwords are never stored in plain text — they're hashed with bcrypt before being saved.
- Every API route is protected appropriately: you can only edit or delete your own posts, and posting requires being logged in.
