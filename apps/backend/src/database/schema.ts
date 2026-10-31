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

create table if not exists loyalty_programs (
  restaurant_id integer primary key references restaurants (id) on delete cascade,
  stamps_required integer not null check (stamps_required between 2 and 20),
  reward_item_id integer references menu_items (id) on delete set null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_cards (
  restaurant_id integer not null references restaurants (id) on delete cascade,
  customer_phone text not null,
  stamps integer not null default 0,
  rewards_available integer not null default 0,
  purchases integer not null default 0,
  primary key (restaurant_id, customer_phone)
);

create table if not exists promotions (
  id integer generated always as identity primary key,
  restaurant_id integer not null references restaurants (id) on delete cascade,
  name text not null,
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  min_purchases integer not null default 0 check (min_purchases >= 0),
  min_total numeric(12, 2) not null default 0 check (min_total >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists promotions_restaurant on promotions (restaurant_id);

alter table orders add column if not exists subtotal numeric(12, 2);
update orders set subtotal = total where subtotal is null;
alter table orders add column if not exists discount numeric(12, 2) not null default 0;
alter table orders add column if not exists promotion_name text;
alter table orders add column if not exists loyalty_counted boolean not null default false;
alter table orders add column if not exists reward_redeemed boolean not null default false;

alter table restaurants add column if not exists insights_enabled boolean not null default false;

create table if not exists restaurant_insights (
  id integer generated always as identity primary key,
  restaurant_id integer not null references restaurants (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_insights_recent
  on restaurant_insights (restaurant_id, created_at desc);
`;
