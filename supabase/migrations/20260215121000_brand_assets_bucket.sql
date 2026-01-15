insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'brand_assets_objects_select_public'
  ) then
    create policy "brand_assets_objects_select_public"
      on storage.objects
      for select
      using (bucket_id = 'brand-assets');
  end if;
end $$;
