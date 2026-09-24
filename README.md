# 作業日報 Ninku (Public Shared Data Version)

この版は、ブラウザの LocalStorage ではなく Supabase にデータを保存する構成です。 これにより、URL を共有している人が同じデータを見たり入力したりできます。

## 必須設定

1. Supabase で新しいプロジェクトを作成します。
2. SQL Editor で次のテーブルを作成します。

```sql
create table public.targets (
  id uuid default gen_random_uuid() primary key,
  site text not null,
  process text not null,
  ninku numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.entries (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  site text not null,
  worker text not null,
  process text not null,
  people integer not null default 1,
  hours numeric not null default 0,
  ninku numeric not null default 0,
  note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

3. `config.js` を開いて、Supabase の URL と anon key を入れます。

```js
window.SUPABASE_URL = 'https://xxxxxxxxxxxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
```

4. Supabase の Authentication や Row Level Security を公開モードとして許可します。
   - もし公開入力を許可したいなら、RLS を OFF にするか、簡単な public policy を追加してください。

## 例: public policy

```sql
alter table public.targets enable row level security;
alter table public.entries enable row level security;

create policy "allow all read and write"
on public.targets
for all
using (true)
with check (true);

create policy "allow all read and write"
on public.entries
for all
using (true)
with check (true);
```

## GitHub Pages デプロイ

1. 変更を GitHub に push
2. GitHub → Settings → Pages → Source = GitHub Actions
3. Actions workflow が完了後、URL が発行されます。

## 注意

- この版は「共通データ」を使うので、ブラウザごとにデータが分かれていません。
- 公開データなので、入力権限を制限したい場合は後で認証を追加する必要があります。

