// netlify/functions/api.mjs
// Runs the whole Express app as one Netlify Function (modern Functions API).
// In this mode Netlify configures Blobs automatically, including the
// uncached edge URL that strong-consistency reads need. Requests to /api/*
// and /uploads/* reach this function via `config.path`; everything else is
// served from public/.
process.env.USE_BLOBS = '1';

import serverless from 'serverless-http';
import createApp from '../../app.js';

const app = createApp();
const expressHandler = serverless(app, { binary: ['image/*', 'multipart/form-data'] });

export default async (req) => {
  const url = new URL(req.url);
  const headers = Object.fromEntries(req.headers);
  const body = ['GET', 'HEAD'].includes(req.method)
    ? undefined
    : Buffer.from(await req.arrayBuffer()).toString('base64');

  // Hand Express a Lambda-style event, which serverless-http understands
  const result = await expressHandler({
    httpMethod: req.method,
    path: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters: {},
    headers,
    multiValueHeaders: {},
    body,
    isBase64Encoded: Boolean(body),
  }, {});

  const out = new Headers();
  for (const [key, value] of Object.entries(result.headers || {})) out.set(key, String(value));
  for (const [key, values] of Object.entries(result.multiValueHeaders || {})) {
    out.delete(key);
    values.forEach(v => out.append(key, String(v)));
  }
  const payload = result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body;
  return new Response(req.method === 'HEAD' ? null : payload, { status: result.statusCode, headers: out });
};

export const config = {
  path: ['/api/*', '/uploads/*'],
};
