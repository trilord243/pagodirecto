export const SCHEMA = `
create table if not exists restaurants (
  id integer generated always as identity primary key,
  public_id text not null unique,
  name text not null,
  username text not null unique,
  password_hash text not null,
  currency text not null default 'USD',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists restaurant_sessions (
  token_hash text primary key,
  restaurant_id integer not null references restaurants (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists menu_items (
  id integer generated always as identity primary key,
  restaurant_id integer not null references restaurants (id) on delete cascade,
  name text not null,
  description text,
  category text,
  price numeric(12, 2) not null check (price >= 0),
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists menu_items_restaurant_name
  on menu_items (restaurant_id, lower(name));

create table if not exists orders (
  id integer generated always as identity primary key,
  restaurant_id integer not null references restaurants (id) on delete cascade,
  customer_phone text not null,
  customer_name text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'ready', 'delivered', 'cancelled')),
  total numeric(12, 2) not null,
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_restaurant_created
  on orders (restaurant_id, created_at desc);

create table if not exists order_items (
  id integer generated always as identity primary key,
  order_id integer not null references orders (id) on delete cascade,
  menu_item_id integer references menu_items (id) on delete set null,
  name text not null,
  unit_price numeric(12, 2) not null,
  quantity integer not null check (quantity > 0)
);

alter table restaurants add column if not exists public_id text;
update restaurants
   set public_id = 'PD-' || upper(substr(encode(sha256(convert_to(username, 'UTF8')), 'hex'), 1, 8))
 where public_id is null;
alter table restaurants alter column public_id set not null;
create unique index if not exists restaurants_public_id on restaurants (public_id);
alter table restaurants drop column if exists slug;

alter table orders add column if not exists public_token text not null
  default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists orders_public_token on orders (public_token);
alter table orders add column if not exists payment_status text not null
  default 'pending' check (payment_status in ('pending', 'paid'));
`;
