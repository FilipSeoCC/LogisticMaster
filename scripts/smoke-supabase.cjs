const { Client } = require('pg');

const database = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com', port: 5432,
  user: 'postgres.lupbogfmojkxbtexqlqo', password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

(async () => {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('Brak SUPABASE_DB_PASSWORD');
  await database.connect();
  const schemaCheck = await database.query("select count(*)::int as count from pg_tables where schemaname = 'public' and tablename in ('organizations','profiles','drivers','vehicles','transports','organization_settings','audit_events','email_integrations','inbound_emails') and rowsecurity = true");
  const policyCheck = await database.query("select count(*)::int as count from pg_policies where schemaname = 'public'");
  const integrationGrants = await database.query("select has_table_privilege('authenticated', 'public.email_integrations', 'select') as can_read_secrets, has_function_privilege('authenticated', 'public.get_email_integration_secret()', 'execute') as can_use_rpc");
  if (schemaCheck.rows[0].count !== 9 || policyCheck.rows[0].count < 11) throw new Error('Niepelna konfiguracja schematu lub RLS');
  if (integrationGrants.rows[0].can_read_secrets || !integrationGrants.rows[0].can_use_rpc) throw new Error('Nieprawidlowe uprawnienia sekretow integracji');
  const account = await database.query('select id from auth.users order by created_at limit 1');
  if (!account.rowCount) {
    console.log('SCHEMA_OK RLS_POLICIES_OK EMAIL_SECURITY_OK');
    await database.end(); return;
  }
  const userId = account.rows[0].id;
  await database.query('begin');
  try {
    await database.query('set local role authenticated');
    await database.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await database.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    const profile = await database.query('select organization_id from public.profiles where user_id = auth.uid()');
    if (profile.rowCount !== 1) throw new Error('RLS nie udostepnil profilu uzytkownika');
    const organizationId = profile.rows[0].organization_id;
    await database.query("insert into public.drivers (organization_id, name, status) values ($1, 'Kierowca Testowy Codex', 'Dostepny') on conflict (organization_id, name) do update set status = excluded.status", [organizationId]);
    if (!(await database.query("select name from public.drivers where name = 'Kierowca Testowy Codex'")).rowCount) throw new Error('CRUD przez RLS nie dziala');
    await database.query("insert into public.inbound_emails (organization_id, message_id, subject, received_at) values ($1, 'codex-smoke-message', 'Test', now()) on conflict (organization_id, message_id) do nothing", [organizationId]);
    if (!(await database.query("select id from public.inbound_emails where message_id = 'codex-smoke-message'")).rowCount) throw new Error('RLS wiadomosci przychodzacych nie dziala');
    console.log('RLS_OK CRUD_OK EMAIL_SECURITY_OK');
  } finally { await database.query('rollback'); await database.end(); }
})().catch(error => { console.error(error.message); process.exit(1); });
