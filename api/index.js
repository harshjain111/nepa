'use strict';

// Vercel serverless entry point — exports the Express app as the handler.
// vercel.json rewrites all /api/* requests to this function; the static
// site in /public is served directly by Vercel's CDN.
module.exports = require('../server.js');
