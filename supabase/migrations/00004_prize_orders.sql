create table public.prize_orders (
  id uuid primary key default gen_random_uuid(),
  prize_key text not null,
  prize_name text not null,
  receiver text not null,
  phone text not null,
  province text not null,
  city text not null,
  district text not null,
  address text not null,
  device_id text,
  user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index prize_orders_created_idx on public.prize_orders (created_at desc);
create index prize_orders_user_idx on public.prize_orders (user_id);

alter table public.prize_orders enable row level security;

create policy prize_orders_deny_anon on public.prize_orders
  for all to anon using (false) with check (false);

create policy prize_orders_deny_authenticated on public.prize_orders
  for all to authenticated using (false) with check (false);