create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Moja firma',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  role text not null default 'Dyspozytor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  license_number text not null default '',
  license_valid_until date,
  status text not null default 'Dostępny',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  registration_number text not null,
  model text not null default '',
  production_year integer,
  vin text not null default '',
  vehicle_type text not null default 'Ciągnik siodłowy',
  assigned_driver text not null default 'Nie przypisano',
  status text not null default 'Dostępny',
  gps_connected boolean not null default false,
  gps_label text not null default 'Brak synchronizacji',
  daily_km numeric not null default 0,
  speed_kmh numeric not null default 0,
  fuel_level numeric,
  fuel_usage numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, registration_number)
);

create table if not exists public.transports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transport_number text not null,
  client text not null,
  origin text not null,
  destination text not null,
  driver_name text not null default 'Nie przypisano',
  vehicle_registration text not null default 'Nie przypisano',
  trailer text not null default 'Nie przypisano',
  notes text not null default '',
  progress integer not null default 0 check (progress between 0 and 100),
  distance_left text not null default '—',
  eta text not null default '—',
  status text not null default 'Nowy',
  tone text not null default 'blue',
  recipient text not null default '',
  gps_location text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, transport_number)
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  configuration jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_key text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null default 'cyber_folks',
  email_address text not null,
  imap_host text not null,
  imap_port integer not null default 993 check (imap_port between 1 and 65535),
  mailbox_folder text not null default 'INBOX',
  encrypted_password text not null,
  status text not null default 'configured',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid references public.email_integrations(id) on delete set null,
  message_id text not null,
  sender_name text not null default '',
  sender_email text not null default '',
  subject text not null default '(bez tematu)',
  received_at timestamptz not null,
  text_body text not null default '',
  status text not null default 'new',
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, message_id)
);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select organization_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare new_organization_id uuid;
begin
  insert into public.organizations (name, owner_id)
  values (coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'Moja firma'), new.id)
  returning id into new_organization_id;

  insert into public.profiles (user_id, organization_id, email, first_name, last_name, phone, role)
  values (
    new.id,
    new_organization_id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', 'Dyspozytor')
  );
  insert into public.organization_settings (organization_id) values (new_organization_id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

do $$
declare account record; new_organization_id uuid;
begin
  for account in select * from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id)
  loop
    insert into public.organizations (name, owner_id)
    values (coalesce(nullif(account.raw_user_meta_data->>'company_name', ''), 'Moja firma'), account.id)
    returning id into new_organization_id;
    insert into public.profiles (user_id, organization_id, email, first_name, last_name, phone, role)
    values (account.id, new_organization_id, coalesce(account.email, ''), coalesce(account.raw_user_meta_data->>'first_name', ''), coalesce(account.raw_user_meta_data->>'last_name', ''), coalesce(account.raw_user_meta_data->>'phone', ''), coalesce(account.raw_user_meta_data->>'role', 'Dyspozytor'));
    insert into public.organization_settings (organization_id) values (new_organization_id);
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.transports enable row level security;
alter table public.organization_settings enable row level security;
alter table public.audit_events enable row level security;
alter table public.email_integrations enable row level security;
alter table public.inbound_emails enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select using (id = public.current_organization_id());
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update using (id = public.current_organization_id()) with check (id = public.current_organization_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (organization_id = public.current_organization_id());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (user_id = auth.uid()) with check (organization_id = public.current_organization_id());

drop policy if exists drivers_all on public.drivers;
create policy drivers_all on public.drivers for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
drop policy if exists vehicles_all on public.vehicles;
create policy vehicles_all on public.vehicles for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
drop policy if exists transports_all on public.transports;
create policy transports_all on public.transports for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
drop policy if exists settings_all on public.organization_settings;
create policy settings_all on public.organization_settings for all using (organization_id = public.current_organization_id()) with check (organization_id = public.current_organization_id());
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events for select using (organization_id = public.current_organization_id());
drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events for insert with check (organization_id = public.current_organization_id() and user_id = auth.uid());

drop policy if exists inbound_emails_all on public.inbound_emails;
create policy inbound_emails_all on public.inbound_emails for all
using (organization_id = public.current_organization_id())
with check (organization_id = public.current_organization_id());

create or replace function public.upsert_email_integration(
  integration_provider text,
  integration_email text,
  integration_host text,
  integration_port integer,
  integration_folder text,
  integration_secret text
)
returns table (id uuid, provider text, email_address text, imap_host text, imap_port integer, mailbox_folder text, status text, last_synced_at timestamptz, last_error text)
language plpgsql
security definer
set search_path = public
as $$
declare org_id uuid;
begin
  org_id := public.current_organization_id();
  if auth.uid() is null or org_id is null then raise exception 'Not authenticated'; end if;
  return query
  insert into public.email_integrations (organization_id, provider, email_address, imap_host, imap_port, mailbox_folder, encrypted_password, status, last_error, updated_at)
  values (org_id, integration_provider, integration_email, integration_host, integration_port, integration_folder, integration_secret, 'configured', null, now())
  on conflict (organization_id) do update set
    provider = excluded.provider, email_address = excluded.email_address, imap_host = excluded.imap_host,
    imap_port = excluded.imap_port, mailbox_folder = excluded.mailbox_folder,
    encrypted_password = excluded.encrypted_password, status = 'configured', last_error = null, updated_at = now()
  returning email_integrations.id, email_integrations.provider, email_integrations.email_address,
    email_integrations.imap_host, email_integrations.imap_port, email_integrations.mailbox_folder,
    email_integrations.status, email_integrations.last_synced_at, email_integrations.last_error;
end;
$$;

create or replace function public.get_email_integration_secret()
returns table (id uuid, provider text, email_address text, imap_host text, imap_port integer, mailbox_folder text, encrypted_password text, status text, last_synced_at timestamptz, last_error text)
language sql
security definer
set search_path = public
as $$
  select e.id, e.provider, e.email_address, e.imap_host, e.imap_port, e.mailbox_folder,
    e.encrypted_password, e.status, e.last_synced_at, e.last_error
  from public.email_integrations e
  where auth.uid() is not null and e.organization_id = public.current_organization_id()
  limit 1
$$;

create or replace function public.set_email_integration_status(sync_status text, sync_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.email_integrations set status = sync_status, last_error = sync_error,
    last_synced_at = case when sync_status = 'connected' then now() else last_synced_at end,
    updated_at = now()
  where organization_id = public.current_organization_id();
end;
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.organizations, public.profiles, public.drivers, public.vehicles, public.transports, public.organization_settings to authenticated;
grant select, insert on public.audit_events to authenticated;
grant select, insert, update on public.inbound_emails to authenticated;
revoke all on public.email_integrations from anon, authenticated;
grant execute on function public.upsert_email_integration(text,text,text,integer,text,text) to authenticated;
grant execute on function public.get_email_integration_secret() to authenticated;
grant execute on function public.set_email_integration_status(text,text) to authenticated;

do $$
declare realtime_table text;
begin
  foreach realtime_table in array array['drivers', 'vehicles', 'transports', 'organization_settings', 'inbound_emails']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = realtime_table) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
