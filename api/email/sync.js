const { requireUser } = require('../_lib/auth');
const { send } = require('../_lib/response');
const { validateConfig, fetchRecent } = require('../_lib/imap');
const { decrypt } = require('../_lib/crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  let context;
  try {
    context = await requireUser(req);
    const { data, error } = await context.supabase.rpc('get_email_integration_secret');
    if (error) throw error;
    const integration = data?.[0];
    if (!integration) throw Object.assign(new Error('Najpierw skonfiguruj skrzynkę w Ustawieniach.'), { statusCode: 409 });
    const config = validateConfig({ email: integration.email_address, password: decrypt(integration.encrypted_password), host: integration.imap_host, port: integration.imap_port, folder: integration.mailbox_folder });
    const messages = await fetchRecent(config, 25);
    const rows = messages.map(message => ({ ...message, organization_id: context.organizationId, integration_id: integration.id }));
    if (rows.length) {
      const { error: insertError } = await context.supabase.from('inbound_emails').upsert(rows, { onConflict: 'organization_id,message_id', ignoreDuplicates: true });
      if (insertError) throw insertError;
    }
    await context.supabase.rpc('set_email_integration_status', { sync_status: 'connected', sync_error: null });
    return send(res, 200, { ok: true, scanned: messages.length });
  } catch (error) {
    if (context) await context.supabase.rpc('set_email_integration_status', { sync_status: 'error', sync_error: String(error.message || '').slice(0, 500) }).catch(() => {});
    return send(res, error.statusCode || 502, { error: error.message || 'Synchronizacja skrzynki nie powiodła się.' });
  }
};
