create or replace function public.set_commercial_document_deleted(
  p_document_id uuid,
  p_deleted boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role := public.current_user_role();
  v_document public.commercial_documents%rowtype;
  v_action text;
begin
  if v_actor_id is null
    or v_role not in ('sales', 'manager', 'super_admin')
  then
    raise exception using
      errcode = '42501',
      message = 'Anda tidak memiliki izin untuk mengubah status penghapusan dokumen ini.';
  end if;

  select *
  into v_document
  from public.commercial_documents
  where id = p_document_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Dokumen komersial tidak ditemukan.';
  end if;

  if v_document.type not in ('RFQ', 'Quotation') then
    raise exception using
      errcode = '23514',
      message = 'Hanya RFQ dan Quotation yang dapat dihapus atau dipulihkan.';
  end if;

  if p_deleted then
    if v_document.deleted_at is not null then
      raise exception using
        errcode = '23514',
        message = 'Dokumen komersial ini sudah dihapus.';
    end if;

    if exists (
      select 1
      from public.commercial_documents
      where supersedes_document_id = p_document_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru.';
    end if;

    update public.commercial_documents
    set deleted_at = now(),
        deleted_by = v_actor_id
    where id = p_document_id
      and deleted_at is null;

    v_action := 'dihapus';
  else
    if v_document.deleted_at is null then
      raise exception using
        errcode = '23514',
        message = 'Dokumen komersial ini tidak sedang dihapus.';
    end if;

    update public.commercial_documents
    set deleted_at = null,
        deleted_by = null
    where id = p_document_id
      and deleted_at is not null;

    v_action := 'dipulihkan';
  end if;

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    client_id,
    commercial_document_id,
    title,
    detail
  )
  values (
    case
      when p_deleted then 'commercial_document_deleted'
      else 'commercial_document_restored'
    end::public.activity_kind,
    v_document.owner_id,
    v_actor_id,
    v_document.client_id,
    v_document.id,
    v_document.type::text || ' ' || v_action,
    coalesce(
      v_document.quotation_number,
      v_document.rfq_number,
      v_document.id::text
    )
  );
end;
$$;

revoke execute
  on function public.set_commercial_document_deleted(uuid, boolean)
  from public, anon;

grant execute
  on function public.set_commercial_document_deleted(uuid, boolean)
  to authenticated;
