const { Client } = require('pg');

const database = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.lupbogfmojkxbtexqlqo',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('Brak SUPABASE_DB_PASSWORD');
  await database.connect();
  const schemaCheck = await database.query("select count(*)::int as count from pg_tables where schemaname = 'public' and tablename in ('organizations','profiles','drivers','vehicles','transports','organization_settings','audit_events') and rowsecurity = true");
  const policyCheck = await database.query("select count(*)::int as count from pg_policies where schemaname = 'public'");
  if (schemaCheck.rows[0].count !== 7 || policyCheck.rows[0].count < 10) throw new Error('Niepełna konfiguracja schematu lub RLS');
  const account = await database.query('select id from auth.users order by created_at limit 1');
  if (!account.rowCount) {
    console.log('SCHEMA_OK RLS_POLICIES_OK (CRUD po utworzeniu pierwszego konta)');
    await database.end();
    return;
  }
  const userId = account.rows[0].id;
  await database.query('begin');
  try {
    await database.query('set local role authenticated');
    await database.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await database.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    const profile = await database.query('select organization_id from public.profiles where user_id = auth.uid()');
    if (profile.rowCount !== 1) throw new Error('RLS nie udostępnił profilu użytkownika');
    const organizationId = profile.rows[0].organization_id;
    await database.query("insert into public.drivers (organization_id, name, status) values ($1, 'Kierowca Testowy Codex', 'Dostępny') on conflict (organization_id, name) do update set status = excluded.status", [organizationId]);
    const driver = await database.query("select name from public.drivers where name = 'Kierowca Testowy Codex'");
    if (driver.rowCount !== 1) throw new Error('CRUD przez RLS nie działa');
    console.log('RLS_OK CRUD_OK');
  } finally {
    await database.query('rollback');
    await database.end();
  }
})().catch(error => { console.error(error.message); process.exit(1); });
