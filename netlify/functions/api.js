// netlify/functions/api.js
// Runs the whole Express app as one Netlify Function. /api/* and /uploads/*
// are routed here by netlify.toml; everything else is served from public/.
process.env.USE_BLOBS = '1';

const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const createApp = require('../../app');

const app = createApp();

// Requests can arrive with the function's own path in front; strip it so the
// Express routes (/api/..., /uploads/...) match either way.
const PREFIX = '/.netlify/functions/api';
const expressHandler = serverless(
  (req, res) => {
    if (req.url.startsWith(PREFIX)) req.url = req.url.slice(PREFIX.length) || '/';
    return app(req, res);
  },
  { binary: ['image/*', 'multipart/form-data'] }
);

exports.handler = async (event, context) => {
  connectLambda(event); // gives @netlify/blobs its credentials for this request
  return expressHandler(event, context);
};
