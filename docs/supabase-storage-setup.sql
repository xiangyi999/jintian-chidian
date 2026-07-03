-- 今日吃点：Supabase Storage 图片库配置
-- 在 Supabase Dashboard -> SQL Editor 中执行一次即可。

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'dish-images',
  'dish-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Dish images public read'
  ) then
    create policy "Dish images public read"
    on storage.objects
    for select
    to public
    using (bucket_id = 'dish-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Dish images anon upload'
  ) then
    create policy "Dish images anon upload"
    on storage.objects
    for insert
    to anon
    with check (
      bucket_id = 'dish-images'
      and (storage.foldername(name))[1] = 'home-menu-2026'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Dish images anon update'
  ) then
    create policy "Dish images anon update"
    on storage.objects
    for update
    to anon
    using (
      bucket_id = 'dish-images'
      and (storage.foldername(name))[1] = 'home-menu-2026'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
    with check (
      bucket_id = 'dish-images'
      and (storage.foldername(name))[1] = 'home-menu-2026'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    );
  end if;
end $$;
