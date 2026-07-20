-- Disposable development seed data for local `bunx supabase db reset` use.
-- Supabase can include seed files in a remote push, so never use
-- `db push --include-seed` with this file. The privileged local Super Admin is
-- deliberately excluded and can only be created through the fail-closed
-- `supabase/scripts/bootstrap-local-super-admin.ts` loopback bootstrap.
--
-- Fixed (hand-picked, not random) UUIDs are used throughout so that later
-- migrations/seeds can reference these exact same client/user rows without
-- guessing IDs. Names and roles follow the approved local owner mapping; the
-- email addresses remain local-only credentials, not production accounts.

-- -----------------------------------------------------------------------
-- Team members (mirrors src/lib/mock/team.ts's TEAM array). These are fake
-- local logins for dev purposes only — not usable against a real project,
-- and not the same thing as the real Auth Bootstrap procedure (Task 17),
-- which creates the actual first Manager account by hand.
-- -----------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'hendra@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'adhitya@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'nur@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'feni@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'leli@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'andri@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'siti@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  -- Not part of src/lib/mock/team.ts's TEAM (that only lists Manager + 4
  -- Sales) — added so the local role switcher (see role-context.tsx) has
  -- something to sign in as for the "executive" role too.
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'executive@local.dsm.test', extensions.crypt('seed-local-only', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, role, account_status, name, initials, email) values
  ('11111111-1111-1111-1111-111111111111', 'manager',     'active', 'Hendra Wijaya',      'HW', 'hendra@local.dsm.test'),
  ('22222222-2222-2222-2222-222222222222', 'manager',     'active', 'Adhitya Wirambara',  'AW', 'adhitya@local.dsm.test'),
  ('33333333-3333-3333-3333-333333333333', 'sales',       'active', 'Nur Iman',           'NI', 'nur@local.dsm.test'),
  ('44444444-4444-4444-4444-444444444444', 'sales',       'active', 'Feni Cahyaningtias', 'FC', 'feni@local.dsm.test'),
  ('55555555-5555-5555-5555-555555555555', 'manager',     'active', 'Leli Al',            'LA', 'leli@local.dsm.test'),
  ('77777777-7777-7777-7777-777777777777', 'sales',       'active', 'Andri Sutomo',       'AS', 'andri@local.dsm.test'),
  ('88888888-8888-8888-8888-888888888888', 'sales',       'active', 'Siti Zulaika (Ika)', 'SZ', 'siti@local.dsm.test'),
  ('66666666-6666-6666-6666-666666666666', 'executive',   'active', 'Executive Viewer',  'EV', 'executive@dsm.co.id');

-- -----------------------------------------------------------------------
-- Clients. Only real master data lives here now — the twelve mockup demo
-- clients (mirrors of src/lib/mock/data.ts's old CLIENTS array, ids
-- ...0001-...000c) and their mock tasks/commercial_items/sales_orders were
-- removed on 2026-07-19 at the owner's request, since Phase 10 already
-- deleted src/lib/mock/ and these rows were fake placeholder data with zero
-- real Sheet-imported documents attached. PT. HARIFF DAYA TUNGGAL
-- ENGINEERING (...000d) is kept — it is the real customer the HARIFF Sheet
-- import (25 headers / 43 items / Rp3.259.394.500) actually resolves to.
-- -----------------------------------------------------------------------

insert into public.clients (id, name, status, source, owner_id, spending_ytd, last_fu, next_fu) values
  ('a0000000-0000-4000-8000-00000000000d', 'PT. HARIFF DAYA TUNGGAL ENGINEERING', 'Active Customer', 'Business Relationship',  '55555555-5555-5555-5555-555555555555',          0, null,         null);

-- -----------------------------------------------------------------------
-- Sheet-import client masters: real historical customers matched/created
-- during the Phase 11 spreadsheet reconciliation (moved here from a
-- migration file — this is business seed data, not schema, and must load
-- after the profiles insert above so the active-owner trigger can resolve
-- owner_id).
-- -----------------------------------------------------------------------

INSERT INTO public.clients (id, name, status, source, owner_id, spending_ytd, created_at)
VALUES
  ('a0000000-0000-4000-8000-000000000014', 'CV. ABADI TECHNIC', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000015', 'CV. ABENG JAYA MANDIRI', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000016', 'CV. LEUWI ANYAR TEKNIK', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000017', 'CV. RDD TECHNOLOGIES', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000018', 'PT ZAITECH ENJINIRING INDONESIA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000019', 'PT. ABHIMATA CITRA ABADI', 'Active Customer', 'Referral', '22222222-2222-2222-2222-222222222222', 0, now()),
  ('a0000000-0000-4000-8000-000000000020', 'PT. AEMCO PERSADA NUSANTARA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000021', 'PT. ANTARTEL MEDIA PRIMA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000022', 'PT. BAMBANG DJAJA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000023', 'PT. CAHAYA SOLUSI METAL', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000024', 'PT. CATUR ADI PERKASA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000025', 'PT. CIKARANG LISTRINDO INDONESIA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000026', 'PT. CONTROL SYSTEMS ARENA PARA NUSA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000027', 'PT. ELEKTRINDO SARANA ABADI', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000028', 'PT. ENGINEERING VISIT ANTAR NUSA', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000029', 'PT. GLOBAL NINE INDONESIA', 'Active Customer', 'Referral', '22222222-2222-2222-2222-222222222222', 0, now()),
  ('a0000000-0000-4000-8000-000000000030', 'PT. IDEAS EDVOLUTION TECHNOLOGGY', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000031', 'PT. INTI CIPTA MAKMUR', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000032', 'KOPERASI KARYAWAN BERSATU SEJAHTERA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000033', 'PT. MAXINDO ENERGITAMA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000034', 'PT. MEDIA TAMA ELEKTRONIK', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000035', 'PT. MEGATRON EMPAT SEKAWAN', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000036', 'PT. MEKANIKA ELEKTRIKA INDOCIPTA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000037', 'PT. NEUTRAL ERA TRITAMA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000038', 'PT. PAKARTEL', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000039', 'PT. POWER KARYA ELEKTRINDO', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000040', 'PT. PUTRA ARGA BINANGUN', 'Active Customer', 'Referral', '22222222-2222-2222-2222-222222222222', 0, now()),
  ('a0000000-0000-4000-8000-000000000041', 'PT. QUANTUM TERA NETWORK', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000042', 'PT. REKACIPTA PERKASA ENERGI', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000043', 'PT. RIZQALLAH BOER MAKMUR', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000044', 'PT. SARANA GLOBAL TELECOM', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000045', 'PT. SURYA ANUGRAH ENJINEERING', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000046', 'PT. SURYA UTAMA PUTRA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000047', 'PT. SYMPHOS ELECTRIC', 'Active Customer', 'Referral', '22222222-2222-2222-2222-222222222222', 0, now()),
  ('a0000000-0000-4000-8000-000000000048', 'PT. TOHAAN RENEWABLE ENERGY ENGINEERING', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000049', 'PT. WESTINDO ESA PERKASA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000050', 'PT. WIRAKY NUSA TELEKOMUNIKASI', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000051', 'BPK JAFAR', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000052', 'BPK. YUDIS', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000053', 'CV. CATUR DAYA MEKATAMA', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000054', 'CV. PANCA SAKTI', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000055', 'CV. VALDATA ADIDAYA', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000056', 'IBU ERNIKA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000057', 'PAK SUHEDY', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000058', 'PAK YUDHI - KIRANA PAINT', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000059', 'PT ZELT TECHNOLOGIES SOLUTION', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000060', 'PT. ANTABOGA PANGAN NUSANTARA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000061', 'PT. EVERPRO INDONESIA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000062', 'PT. GLOBAL SEMESTA MANDIRI', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000063', 'PT. GUANGHAO TECHNOLOGY INDONESIA', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000064', 'PT. GUNUNG MADU PLANTATIONS', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000065', 'PT. HARMONI REKA ENGINEERNIG', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000066', 'PT. INFRA KARYA PRATAMA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000067', 'PT. Jetec - ACTEMIUM Systems Indonesia', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000068', 'PT. KUBIK MADANI', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000069', 'PT. MAHARDIKA TEKNOTAMA INTEGRASI', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000070', 'PT. MERDEKA MINING SERVIS', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000071', 'PT. MUNGGARAN JAYA UTAMA', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000072', 'PT. NDL BAKTI SOLUSINDO', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000073', 'PT. PRASTIWAHYU TUNAS ENGINEERING', 'Active Customer', 'Referral', '44444444-4444-4444-4444-444444444444', 0, now()),
  ('a0000000-0000-4000-8000-000000000074', 'PT. PRIMA PERKASA TEKNIK INDONESIA', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000075', 'PT. SARANA TEKNOLOGI UTAMA', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000076', 'PT. SIEMENS INDONESIA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000077', 'PT. SINAR BUDI', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000078', 'PT. SOLARENS LEDINDO', 'Active Customer', 'Referral', '55555555-5555-5555-5555-555555555555', 0, now()),
  ('a0000000-0000-4000-8000-000000000079', 'PT. SOLUSI KONEKTIVITAS DIGITAL', 'Active Customer', 'Referral', '88888888-8888-8888-8888-888888888888', 0, now()),
  ('a0000000-0000-4000-8000-000000000080', 'PT. TIRTA JAYA PRIMAKARSA', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now()),
  ('a0000000-0000-4000-8000-000000000081', 'PT.NAWASENA JAYA KREASI', 'Active Customer', 'Referral', '33333333-3333-3333-3333-333333333333', 0, now());

-- -----------------------------------------------------------------------
-- Tasks, legacy commercial items, and legacy sales orders that used to
-- mirror src/lib/mock/data.ts's TASKS/COMMERCIAL_ITEMS/SALES_ORDERS arrays
-- were removed on 2026-07-19 at the owner's request, together with the
-- twelve mockup clients above. They were fake placeholder data (mirrors of
-- an already-deleted mock module, Phase 10) with zero real Sheet-imported
-- documents attached — see the clients block above for the full removal
-- note. `private.migrate_commercial_document_data()` below now has nothing
-- to convert and is a safe no-op.
-- -----------------------------------------------------------------------

-- -----------------------------------------------------------------------
-- Targets (mirrors src/lib/mock/data.ts's MONTHLY_TARGETS_PER_SALES — same
-- flat monthly value per sales rep, applied across all 12 months of 2026).
-- -----------------------------------------------------------------------

insert into public.targets (sales_id, year, month, target)
select sales_id, 2026, month, target
from (values
  ('22222222-2222-2222-2222-222222222222'::uuid, 700000000::bigint),
  ('33333333-3333-3333-3333-333333333333'::uuid, 680000000::bigint),
  ('44444444-4444-4444-4444-444444444444'::uuid, 500000000::bigint),
  ('55555555-5555-5555-5555-555555555555'::uuid, 620000000::bigint)
) as t(sales_id, target)
cross join generate_series(1, 12) as month;

-- -----------------------------------------------------------------------
-- Phase 11 Task 2: convert the legacy commercial_items/sales_orders rows
-- seeded above into the normalized commercial_documents/sales_orders
-- schema, and backfill tasks/follow_up_logs/activity_log's
-- commercial_document_id FKs. Migrations always run before this file
-- during `bunx supabase db reset`, so this is the first point at which the
-- legacy tables actually have rows to convert locally.
-- -----------------------------------------------------------------------

select private.migrate_commercial_document_data();
