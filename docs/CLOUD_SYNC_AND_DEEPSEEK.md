# 云同步和 DeepSeek 设置

本项目仍然是静态 PWA，可以部署在 GitHub Pages。跨手机数据互通通过 Supabase REST API 完成；AI 做法推荐改为 DeepSeek Chat Completions API。

## DeepSeek 设置

在应用的 `设置` 页填写：

- `DeepSeek API Key`
- `DeepSeek 模型`：默认 `deepseek-v4-flash`

说明：

- Key 只保存在当前手机浏览器本地，不写进 GitHub 仓库。
- 只有点击 AI 推荐时，菜名和标签会发送给 DeepSeek。
- DeepSeek 官方 Chat Completions 接口地址是 `https://api.deepseek.com/chat/completions`。

## Supabase 云同步准备

在 Supabase 新建一个项目，然后在 SQL Editor 执行：

```sql
create table if not exists public.menu_sync (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.menu_sync enable row level security;

create policy "menu_sync_select"
on public.menu_sync
for select
to anon
using (true);

create policy "menu_sync_insert"
on public.menu_sync
for insert
to anon
with check (true);

create policy "menu_sync_update"
on public.menu_sync
for update
to anon
using (true)
with check (true);
```

然后在 Supabase Dashboard 找到：

- Project URL
- anon public key

## 手机端设置

在每台手机的应用 `设置` 页填写同一组：

- Supabase URL
- Supabase anon key
- 同步空间，例如 `home-menu`

打开 `保存菜谱后自动同步云端` 后，每次新增、编辑、删除、收藏、AI 更新做法，都会尝试上传到云端。

## 手动同步

设置页也提供：

- `上传到云端`：用当前手机数据覆盖同一同步空间的云端数据。
- `从云端拉取`：把云端数据更新到当前手机。

## 数据和安全

- DeepSeek API Key 和 Supabase anon key 只保存在手机浏览器本地。
- 云端存的是菜谱、做法、标签、收藏和图片 data URL。
- 当前实现是个人使用的轻量方案，同一同步空间采用“最后一次上传覆盖云端”的策略。
- 如果未来要多人权限、账号登录或更严格安全控制，应增加后端或 Supabase Auth。
