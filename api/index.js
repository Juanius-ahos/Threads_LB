// Vercel runs the whole store API as one serverless function; vercel.json sends /api/* here as /api?_p=<rest>.
// Express routes on the original path, so put it back if the platform hands us the rewritten one.
const app = require('../server.js');

module.exports = (req, res) => {
  const u = new URL(req.url, 'http://local');
  const p = u.searchParams.get('_p');
  if (p != null) {
    u.searchParams.delete('_p');
    if (!u.pathname.startsWith('/api/')) u.pathname = '/api/' + p.replace(/^\/+/, '');
    req.url = u.pathname + u.search;
  }
  return app(req, res);
};
