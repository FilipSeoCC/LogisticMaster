const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lupbogfmojkxbtexqlqo.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_OzSGIKNPOZmvlftZ7lljJA_VqgcrB97';

async function requireUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Zaloguj się ponownie.'), { statusCode: 401 });
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Sesja wygasła. Zaloguj się ponownie.'), { statusCode: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('organization_id').eq('user_id', data.user.id).single();
  if (profileError || !profile) throw Object.assign(new Error('Brak organizacji dla konta.'), { statusCode: 403 });
  return { supabase, user: data.user, organizationId: profile.organization_id };
}

module.exports = { requireUser };
