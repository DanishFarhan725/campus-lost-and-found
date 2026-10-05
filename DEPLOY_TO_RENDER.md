# Deploy Campus Lost & Found to Render

## 1. Test locally
Run:
```bash
npm install
npm start
```
Open http://localhost:3000

## 2. Put the project on GitHub
Create an empty GitHub repository named `campus-lost-and-found`, then from this folder run:
```bash
git init
git add .
git commit -m "Initial project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/campus-lost-and-found.git
git push -u origin main
```

## 3. Create the Render service
On Render, choose New > Web Service and connect the GitHub repository.

Use:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: Free

## 4. Environment variables
Add:
- `NODE_ENV` = `production`
- `SESSION_SECRET` = a long random secret (do not commit it to GitHub)

## 5. Important limitation
This project stores users, items, and uploaded images on the local filesystem. Render Free web services have an ephemeral filesystem, so runtime data/uploads can be lost after restarts/redeploys. For a persistent production version, migrate the JSON database to PostgreSQL and uploaded files to object storage (for example Supabase).
