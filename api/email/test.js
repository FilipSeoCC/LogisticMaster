const { requireUser } = require('../_lib/auth');
const { send, readBody } = require('../_lib/response');
const { validateConfig, testConnection } = require('../_lib/imap');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    await requireUser(req);
    const config = validateConfig(await readBody(req));
    await testConnection(config);
    return send(res, 200, { ok: true, message: 'Połączenie IMAP działa.' });
  } catch (error) { return send(res, error.statusCode || 502, { error: error.message || 'Nie udało się połączyć ze skrzynką.' }); }
};
