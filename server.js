// server.js
// Local entry point (`npm start`). On Netlify the same app runs as a Function.
const createApp = require('./app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`\n🎒 Campus Lost & Found running at http://localhost:${PORT}\n`);
});
