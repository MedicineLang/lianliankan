create table public.game_config (
  id smallint primary key,
  win_chance integer not null default 1,
  weights integer[] not null default '{24,22,14,14,10,10,6}',
  costs integer[] not null default '{30,70,50,115}',
  updated_at timestamptz not null default now(),
  constraint game_config_singleton check (id = 1)
);

insert into public.game_config (id) values (1);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  beans integer not null default 0,
  chances integer not null default 1,
  shuffle integer not null default 0,
  prizes jsonb not null default '{}'::jsonb,
  ad_count integer not null default 0,
  sign jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{"spins":0,"beans":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_updated_at_idx on public.players (updated_at desc);

create table public.game_events (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index game_events_player_idx on public.game_events (player_id, created_at desc);

create function public.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

alter table public.game_config enable row level security;
alter table public.players enable row level security;
alter table public.game_events enable row level security;

create policy game_config_deny_anon on public.game_config for all to anon using (false) with check (false);
create policy game_config_deny_authenticated on public.game_config for all to authenticated using (false) with check (false);
create policy players_deny_anon on public.players for all to anon using (false) with check (false);
create policy players_deny_authenticated on public.players for all to authenticated using (false) with check (false);
create policy game_events_deny_anon on public.game_events for all to anon using (false) with check (false);
create policy game_events_deny_authenticated on public.game_events for all to authenticated using (false) with check (false);