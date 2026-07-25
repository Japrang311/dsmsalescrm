alter table public.commercial_documents
  add column lost_reason text,
  add column lost_reason_detail text;

update public.commercial_documents
set lost_reason = 'Belum diklasifikasi'
where type = 'Quotation'
  and stage = 'Closed Lost';

alter table public.commercial_documents
  add constraint commercial_documents_quotation_lost_reason_valid
  check (coalesce((
    (
      type = 'Quotation'
      and stage = 'Closed Lost'
      and lost_reason in (
        'Harga tidak kompetitif',
        'Kalah tender/kompetitor',
        'Spesifikasi tidak sesuai',
        'Project ditunda/dibatalkan',
        'Tidak ada respons',
        'Lead time',
        'Anggaran',
        'Lainnya',
        'Belum diklasifikasi'
      )
      and (
        lost_reason <> 'Lainnya'
        or nullif(btrim(lost_reason_detail), '') is not null
      )
    )
    or (
      not (type = 'Quotation' and stage = 'Closed Lost')
      and lost_reason is null
      and lost_reason_detail is null
    )
  ), false));

comment on column public.commercial_documents.lost_reason is
  'Structured reason required while a Quotation is in Closed Lost.';

comment on column public.commercial_documents.lost_reason_detail is
  'Optional qualitative context; required when lost_reason is Lainnya.';

grant update (lost_reason, lost_reason_detail)
on table public.commercial_documents
to authenticated;
