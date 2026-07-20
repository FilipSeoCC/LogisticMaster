const { requireUser } = require('../_lib/auth');
const { send } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  try {
    const { supabase } = await requireUser(req);
    const { data, error } = await supabase.from('inbound_emails').select('id,sender_name,sender_email,subject,received_at,text_body,status,extracted_data').order('received_at', { ascending: false }).limit(100);
    if (error) throw error;
    return send(res, 200, { messages: data || [] });
  } catch (error) { return send(res, error.statusCode || 400, { error: error.message || 'Nie udało się pobrać wiadomości.' }); }
};
