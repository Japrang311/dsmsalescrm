alter table public.commercial_documents
  drop constraint if exists commercial_documents_quotation_lost_reason_valid;

update public.commercial_documents
set lost_reason = 'Belum diklasifikasi'
where type in ('RFQ', 'Quotation')
  and stage = 'Closed Lost'
  and lost_reason is null;

alter table public.commercial_documents
  add constraint commercial_documents_quotation_lost_reason_valid
  check (coalesce((
    (
      type in ('RFQ', 'Quotation')
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
      not (type in ('RFQ', 'Quotation') and stage = 'Closed Lost')
      and lost_reason is null
      and lost_reason_detail is null
    )
  ), false));
