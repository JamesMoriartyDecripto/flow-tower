-- Leafwise schema (Supabase Postgres, EU). Applied through the Supabase MCP apply_migration tool;
-- this file is the concatenation of migrations 0001-0007 for reading.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en-US',
  premium_until timestamptz,            -- written only by the RevenueCat webhook
  created_at timestamptz not null default now()
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  species text,
  pot_size_cm int check (pot_size_cm between 4 and 120),
  light text not null default 'medium' check (light in ('low', 'medium', 'bright')),
  summer_interval_days int not null default 7 check (summer_interval_days between 1 and 60),
  photo_path text,                      -- Storage key in bucket plant-photos/<owner_id>/...
  created_at timestamptz not null default now()
);

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants (id) on delete cascade,
  kind text not null check (kind in ('water', 'fertilize', 'repot')),
  source text not null check (source in ('app', 'widget', 'notification')),
  done_at timestamptz not null default now()
);
create index care_events_plant_done on public.care_events (plant_id, done_at desc);

-- Row-level security: every table, owner only. The app ships the anon key.
alter table public.profiles enable row level security;
alter table public.plants enable row level security;
alter table public.care_events enable row level security;

create policy "own profile" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "update own profile" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- premium_until is not updatable by users: column privilege revoked below.
revoke update (premium_until) on public.profiles from authenticated;

create policy "own plants" on public.plants
  for all using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "own care events" on public.care_events
  for all using (exists (
    select 1 from public.plants p where p.id = plant_id and p.owner_id = (select auth.uid())
  ));

-- Seasonal interval: winter months stretch the summer interval by pot size.
create or replace function public.next_due_at(p_plant_id uuid)
returns timestamptz language sql stable security invoker as $$
  select coalesce(max(e.done_at), p.created_at)
       + make_interval(days => ceil(p.summer_interval_days *
           case when extract(month from now()) in (11, 12, 1, 2) then 1.5 else 1.0 end *
           case when coalesce(p.pot_size_cm, 15) > 30 then 1.2 else 1.0 end)::int)
  from public.plants p
  left join public.care_events e on e.plant_id = p.id and e.kind = 'water'
  where p.id = p_plant_id
  group by p.id;
$$;
