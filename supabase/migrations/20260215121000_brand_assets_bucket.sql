insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'brand_assets_objects_select_own'
  ) then
    create policy "brand_assets_objects_select_own"
      on storage.objects
      for select
      using (
        bucket_id = 'brand-assets'
        and exists (
          select 1
          from public.business_settings bs
          where bs.user_id = auth.uid()
            and bs.business_id::text = (storage.foldername(name))[2]
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'brand_assets_objects_insert_own'
  ) then
    create policy "brand_assets_objects_insert_own"
      on storage.objects
      for insert
      with check (
        bucket_id = 'brand-assets'
        and exists (
          select 1
          from public.business_settings bs
          where bs.user_id = auth.uid()
            and bs.business_id::text = (storage.foldername(name))[2]
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'brand_assets_objects_update_own'
  ) then
    create policy "brand_assets_objects_update_own"
      on storage.objects
      for update
      using (
        bucket_id = 'brand-assets'
        and exists (
          select 1
          from public.business_settings bs
          where bs.user_id = auth.uid()
            and bs.business_id::text = (storage.foldername(name))[2]
        )
      )
      with check (
        bucket_id = 'brand-assets'
        and exists (
          select 1
          from public.business_settings bs
          where bs.user_id = auth.uid()
            and bs.business_id::text = (storage.foldername(name))[2]
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'brand_assets_objects_delete_own'
  ) then
    create policy "brand_assets_objects_delete_own"
      on storage.objects
      for delete
      using (
        bucket_id = 'brand-assets'
        and exists (
          select 1
          from public.business_settings bs
          where bs.user_id = auth.uid()
            and bs.business_id::text = (storage.foldername(name))[2]
        )
      );
  end if;
end $$;
