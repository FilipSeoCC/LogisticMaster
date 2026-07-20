const { requireUser } = require('../_lib/auth');
const { send, readBody } = require('../_lib/response');
const { validateConfig } = require('../_lib/imap');
const { encrypt } = require('../_lib/crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const { supabase } = await requireUser(req);
    const body = await readBody(req);
    const config = validateConfig(body);
    const { data, error } = await supabase.rpc('upsert_email_integration', {
      integration_provider: String(body.provider || 'cyber_folks'), integration_email: config.email,
      integration_host: config.host, integration_port: config.port, integration_folder: config.folder,
      integration_secret: encrypt(config.password),
    });
    if (error) throw error;
    return send(res, 200, { ok: true, integration: data?.[0] || null });
  } catch (error) { return send(res, error.statusCode || 400, { error: error.message || 'Nie udało się zapisać konfiguracji.' }); }
};
