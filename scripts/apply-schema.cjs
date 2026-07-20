const fs = require('fs');
const { Client } = require('pg');

const client = new Client({
  host: process.env.SUPABASE_DB_HOST || 'db.lupbogfmojkxbtexqlqo.supabase.co',
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER || 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('Brak SUPABASE_DB_PASSWORD');
  await client.connect();
  await client.query(fs.readFileSync('supabase/schema.sql', 'utf8'));
  const result = await client.query("select table_name from information_schema.tables where table_schema = 'public' order by table_name");
  console.log(result.rows.map(row => row.table_name).join(','));
  await client.end();
})().catch(async error => {
  console.error(error.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
