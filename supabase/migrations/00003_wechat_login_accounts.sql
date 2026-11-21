create type public.user_role as enum ('user', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  phone text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
insert into public.profiles (id, username, phone, role)
values (
  new.id,
  coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, ''), '@', 1)),
  new.phone,
  'user'::public.user_role
);
return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.get_user_role(uid uuid)
returns public.user_role
language sql
security definer set search_path = public
as $$
  select role from public.profiles where id = uid;
$$;

alter table public.profiles enable row level security;

create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.get_user_role(auth.uid()) = 'admin'::public.user_role)
  with check (public.get_user_role(auth.uid()) = 'admin'::public.user_role);

create policy profiles_self_select on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy profiles_self_update on public.profiles
  for update to authenticated using (auth.uid() = id)
  with check (role is not distinct from public.get_user_role(auth.uid()));

create policy profiles_deny_anon on public.profiles
  for all to anon using (false) with check (false);

create view public.public_profiles as
  select id, username, role from public.profiles;

create table public.wechat_accounts (
  openid text primary key,
  unionid text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create index wechat_accounts_user_idx on public.wechat_accounts (user_id);

alter table public.wechat_accounts enable row level security;

create policy wechat_accounts_deny_anon on public.wechat_accounts
  for all to anon using (false) with check (false);

create policy wechat_accounts_deny_authenticated on public.wechat_accounts
  for all to authenticated using (false) with check (false);

alter table public.players add column user_id uuid references public.profiles(id) on delete set null;

create index players_user_idx on public.players (user_id);