-- Run as the project owner in Supabase SQL Editor.
-- Only this dashboard's table is affected; there are no browser write policies.
create table if not exists public.dashboard_sales (
  id integer generated always as identity primary key,
  source_row integer unique,
  date date not null,
  region text not null check (length(trim(region)) > 0),
  store text not null check (length(trim(store)) > 0),
  category text not null check (length(trim(category)) > 0),
  plan text,
  quantity integer check (quantity >= 0),
  revenue bigint not null check (revenue >= 0 and revenue <= 9007199254740991),
  manager text not null check (length(trim(manager)) > 0),
  created_at timestamptz not null default now()
);

alter table public.dashboard_sales enable row level security;
revoke all on public.dashboard_sales from public, anon, authenticated;
revoke all on sequence public.dashboard_sales_id_seq from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.dashboard_sales to anon, authenticated;
drop policy if exists dashboard_sales_public_read on public.dashboard_sales;
create policy dashboard_sales_public_read on public.dashboard_sales
  for select to anon, authenticated using (true);
