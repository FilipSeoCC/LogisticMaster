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

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.organizations, public.profiles, public.drivers, public.vehicles, public.transports, public.organization_settings to authenticated;

do $$
declare realtime_table text;
begin
  foreach realtime_table in array array['drivers', 'vehicles', 'transports', 'organization_settings']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = realtime_table) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
