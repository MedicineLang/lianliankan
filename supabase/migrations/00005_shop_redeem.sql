create table public.shop_items (
  key text primary key,
  name text not null,
  icon text not null default '🎁',
  tier text not null default 'virtual',
  cost integer not null,
  stock integer not null default -1,
  kind text not null default 'voucher',
  amount integer not null default 1,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.redeem_orders (
  id uuid primary key default gen_random_uuid(),
  voucher text not null unique,
  item_key text not null,
  item_name text not null,
  tier text not null,
  cost integer not null,
  device_id text,
  user_id uuid references public.profiles(id) on delete set null,
  receiver text,
  phone text,
  province text,
  city text,
  district text,
  address text,
  status text not null default 'issued',
  created_at timestamptz not null default now()
);

create index redeem_orders_device_idx on public.redeem_orders (device_id, created_at desc);
create index redeem_orders_user_idx on public.redeem_orders (user_id, created_at desc);

alter table public.shop_items enable row level security;
alter table public.redeem_orders enable row level security;

create policy shop_items_deny_anon on public.shop_items
  for all to anon using (false) with check (false);
create policy shop_items_deny_authenticated on public.shop_items
  for all to authenticated using (false) with check (false);
create policy redeem_orders_deny_anon on public.redeem_orders
  for all to anon using (false) with check (false);
create policy redeem_orders_deny_authenticated on public.redeem_orders
  for all to authenticated using (false) with check (false);

insert into public.shop_items (key, name, icon, tier, cost, stock, kind, amount, sort) values
  ('shuffle1', '重排道具 ×1', '🔄', 'virtual', 30, -1, 'shuffle', 1, 10),
  ('chance1', '抽奖机会 ×1', '🎟️', 'virtual', 50, -1, 'chance', 1, 20),
  ('shuffle3', '重排道具 ×3', '🔄', 'virtual', 70, -1, 'shuffle', 3, 30),
  ('chance3', '抽奖机会 ×3', '🎟️', 'virtual', 115, -1, 'chance', 3, 40),
  ('keyring', '村庄麦穗钥匙扣', '🔑', 'merch', 300, 30, 'voucher', 1, 50),
  ('fridge', '村庄主题冰箱贴', '🧲', 'merch', 450, 25, 'voucher', 1, 60),
  ('tote', '田园帆布袋', '👜', 'merch', 600, 18, 'voucher', 1, 70),
  ('bear', '毛绒小熊挂链', '🐻', 'prize', 1200, 10, 'voucher', 1, 80),
  ('bracelet', '金珠手串', '📿', 'prize', 1800, 5, 'voucher', 1, 90)
on conflict (key) do nothing;