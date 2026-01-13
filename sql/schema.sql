create extension if not exists pgcrypto;

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null default 'Lahore',
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null check (role in ('admin','host')),
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text,
  phone text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  capacity int not null check (capacity > 0),
  area text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, label)
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  table_id uuid references tables(id) on delete set null,
  party_size int not null check (party_size > 0),
  start_time timestamptz not null,
  end_time timestamptz not null,
  source text not null default 'phone' check (source in ('phone','app','walkin','whatsapp')),
  status text not null default 'confirmed'
    check (status in ('confirmed','seated','completed','cancelled','no_show')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_res_restaurant_start
  on reservations(restaurant_id, start_time);

create index if not exists idx_res_restaurant_status
  on reservations(restaurant_id, status);

create index if not exists idx_customers_restaurant_phone
  on customers(restaurant_id, phone);

alter table restaurants enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table tables enable row level security;
alter table reservations enable row level security;

create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;

create policy "profiles read own"
on profiles for select
using (id = auth.uid());

create policy "profiles update own"
on profiles for update
using (id = auth.uid());

create policy "restaurants read own"
on restaurants for select
using (id = public.current_restaurant_id());

create policy "customers read own"
on customers for select
using (restaurant_id = public.current_restaurant_id());

create policy "customers insert own"
on customers for insert
with check (restaurant_id = public.current_restaurant_id());

create policy "customers update own"
on customers for update
using (restaurant_id = public.current_restaurant_id());

create policy "tables read own"
on tables for select
using (restaurant_id = public.current_restaurant_id());

create policy "tables insert own"
on tables for insert
with check (restaurant_id = public.current_restaurant_id());

create policy "tables update own"
on tables for update
using (restaurant_id = public.current_restaurant_id());

create policy "reservations read own"
on reservations for select
using (restaurant_id = public.current_restaurant_id());

create policy "reservations insert own"
on reservations for insert
with check (restaurant_id = public.current_restaurant_id());

create policy "reservations update own"
on reservations for update
using (restaurant_id = public.current_restaurant_id());

