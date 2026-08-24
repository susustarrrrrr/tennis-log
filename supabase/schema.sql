-- ============================================================
-- 网球小本本 · Supabase 数据库结构
-- 全部业务数据（运动类型、打球记录）存放在云端，不依赖浏览器缓存
-- 用户通过 Supabase Auth 登录认证；所有表都开启 RLS 行级安全，
-- 用户只能读写自己的数据。
--
-- 使用方法：
--   1) 登录 https://supabase.com 创建新项目
--   2) 项目控制台 → SQL Editor → New query
--   3) 把本文件内容粘贴进去，点 Run 运行
-- ============================================================

-- 启用 uuid（Supabase 默认已开，这里写出来更清晰）
create extension if not exists "pgcrypto";

-- ============================================================
-- 1) 运动类型（私教 / 练球 / 比赛 + 用户自定义）
-- ============================================================
create table if not exists public.sport_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 10),
  color       text not null default '#FF9EB5',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists sport_types_user_idx on public.sport_types(user_id);

-- ============================================================
-- 2) 打球记录
-- ============================================================
create table if not exists public.play_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type_id       uuid references public.sport_types(id) on delete set null,
  played_on     date not null,
  duration_min  int  not null check (duration_min > 0 and duration_min <= 1440),
  effort        int  not null check (effort between 1 and 5),
  cost          numeric(10,2) not null default 0 check (cost >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists play_records_user_date_idx
  on public.play_records(user_id, played_on desc);

-- ============================================================
-- 3) updated_at 自动维护
-- ============================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists play_records_touch on public.play_records;
create trigger play_records_touch
before update on public.play_records
for each row execute procedure public.touch_updated_at();

-- ============================================================
-- 4) 行级安全策略 (RLS)
-- ============================================================
alter table public.sport_types  enable row level security;
alter table public.play_records  enable row level security;

-- ---- sport_types：用户只能看到 / 修改 / 删除自己的类型 ----
drop policy if exists "sport_types select own" on public.sport_types;
create policy "sport_types select own"
  on public.sport_types for select
  using (auth.uid() = user_id);

drop policy if exists "sport_types insert own" on public.sport_types;
create policy "sport_types insert own"
  on public.sport_types for insert
  with check (auth.uid() = user_id);

drop policy if exists "sport_types update own" on public.sport_types;
create policy "sport_types update own"
  on public.sport_types for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sport_types delete own" on public.sport_types;
create policy "sport_types delete own"
  on public.sport_types for delete
  using (auth.uid() = user_id);

-- ---- play_records：用户只能看到 / 修改 / 删除自己的记录 ----
drop policy if exists "play_records select own" on public.play_records;
create policy "play_records select own"
  on public.play_records for select
  using (auth.uid() = user_id);

drop policy if exists "play_records insert own" on public.play_records;
create policy "play_records insert own"
  on public.play_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "play_records update own" on public.play_records;
create policy "play_records update own"
  on public.play_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "play_records delete own" on public.play_records;
create policy "play_records delete own"
  on public.play_records for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 5) 测试账号（可选用；用来在 SQL 里手动插入数据做检查）
--     替换 'YOUR-USER-UUID' 为 auth.users 里的真实 id
-- ============================================================
-- insert into public.sport_types(user_id, name, color, sort_order)
-- values
--   ('YOUR-USER-UUID', '私教', '#FF9EB5', 0),
--   ('YOUR-USER-UUID', '练球', '#86D9BE', 1),
--   ('YOUR-USER-UUID', '比赛', '#FFD86B', 2);

-- insert into public.play_records(user_id, type_id, played_on, duration_min, effort, cost, note)
-- values ('YOUR-USER-UUID', null, current_date, 90, 3, 200, '正手稳定提升');