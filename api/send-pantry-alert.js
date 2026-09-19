const netlifyHandler = require('../netlify/functions/send-pantry-alert.js').handler;

module.exports = async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'object' && body !== null) {
    body = JSON.stringify(body);
  }

  const event = {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: req.query || {},
    body: body || null,
    path: req.url
  };

  try {
    const result = await netlifyHandler(event, {});
    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => {
        res.setHeader(k, v);
      });
    }
    const statusCode = result.statusCode || 200;
    res.status(statusCode);
    if (result.body) {
      try {
        const json = JSON.parse(result.body);
        return res.json(json);
      } catch (e) {
        return res.send(result.body);
      }
    } else {
      return res.end();
    }
  } catch (err) {
    console.error('[Vercel Bridge] send-pantry-alert error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
