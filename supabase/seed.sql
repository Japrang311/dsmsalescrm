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
-- Clients (mirrors src/lib/mock/data.ts's CLIENTS array)
-- -----------------------------------------------------------------------

insert into public.clients (id, name, status, source, owner_id, spending_ytd, last_fu, next_fu) values
  ('a0000000-0000-4000-8000-000000000001', 'PT Astra Komponen Nusantara',         'Active Customer', 'Business Relationship', '22222222-2222-2222-2222-222222222222', 1450000000, '2026-07-10', '2026-07-18'),
  ('a0000000-0000-4000-8000-000000000002', 'PT Sinar Baja Elektrik',              'Repeat Order',     'Repeat',                 '22222222-2222-2222-2222-222222222222',  890000000, '2026-07-12', '2026-07-17'),
  ('a0000000-0000-4000-8000-000000000003', 'CV Mitra Presisi',                    'Active Customer', 'Referral',               '33333333-3333-3333-3333-333333333333',  620000000, '2026-07-08', '2026-07-16'),
  ('a0000000-0000-4000-8000-000000000004', 'PT Chandra Sakti Utama',              'Prospect',        'Website Inquiry',        '44444444-4444-4444-4444-444444444444',          0, '2026-07-05', '2026-07-17'),
  ('a0000000-0000-4000-8000-000000000005', 'PT Panasonic Manufacturing Indonesia','Active Customer', 'Business Relationship', '55555555-5555-5555-5555-555555555555', 1120000000, '2026-07-11', '2026-07-19'),
  ('a0000000-0000-4000-8000-000000000006', 'PT Yamaha Indonesia Motor',           'Repeat Order',     'Repeat',                 '33333333-3333-3333-3333-333333333333', 2050000000, '2026-07-14', '2026-07-21'),
  ('a0000000-0000-4000-8000-000000000007', 'PT Denso Indonesia',                  'Active Customer', 'Business Relationship', '22222222-2222-2222-2222-222222222222',  780000000, '2026-07-09', '2026-07-15'),
  ('a0000000-0000-4000-8000-000000000008', 'PT Krakatau Engineering',             'Dormant',         'Referral',               '44444444-4444-4444-4444-444444444444',  120000000, null,         null),
  ('a0000000-0000-4000-8000-000000000009', 'PT Indofood Sukses Makmur',           'Prospect',        'Referral',               '55555555-5555-5555-5555-555555555555',          0, null,         '2026-07-17'),
  ('a0000000-0000-4000-8000-00000000000a', 'PT Mayora Indah Tbk',                 'Active Customer', 'Website Inquiry',        '33333333-3333-3333-3333-333333333333',  540000000, '2026-07-13', '2026-07-20'),
  ('a0000000-0000-4000-8000-00000000000b', 'PT Toyota Motor Manufacturing',       'Repeat Order',     'Repeat',                 '22222222-2222-2222-2222-222222222222', 1780000000, '2026-07-14', '2026-07-18'),
  ('a0000000-0000-4000-8000-00000000000c', 'CV Karya Logam Sejahtera',            'Lost',            'Referral',               '44444444-4444-4444-4444-444444444444',          0, null,         null),
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
-- Tasks (mirrors src/lib/mock/data.ts's TASKS array). commercial_item_id
-- is left null throughout — commercial_items doesn't exist yet (Phase 4),
-- so there's nothing real to point it at.
-- -----------------------------------------------------------------------

insert into public.tasks (client_id, owner_id, title, due_date, method, status, priority) values
  ('a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'Kirim revisi drawing bracket',      '2026-07-17', 'Email',    'Today',    'High'),
  ('a0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Follow up konfirmasi PO',           '2026-07-17', 'Phone',    'Today',    'High'),
  ('a0000000-0000-4000-8000-000000000007', '22222222-2222-2222-2222-222222222222', 'Update progress prototype',         '2026-07-15', 'Phone',    'Overdue',  'Normal'),
  ('a0000000-0000-4000-8000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Konfirmasi jadwal delivery',        '2026-07-17', 'WhatsApp', 'Today',    'Normal'),
  ('a0000000-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333', 'Kirim quotation revisi',            '2026-07-17', 'Email',    'Today',    'High'),
  ('a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Meeting review harga',              '2026-07-16', 'Meeting',  'Overdue',  'High'),
  ('a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'Follow up hasil quotation',         '2026-07-18', 'Phone',    'Upcoming', 'Normal'),
  ('a0000000-0000-4000-8000-000000000004', '44444444-4444-4444-4444-444444444444', 'Perkenalan produk & katalog',       '2026-07-17', 'Visit',    'Today',    'Normal'),
  ('a0000000-0000-4000-8000-000000000008', '44444444-4444-4444-4444-444444444444', 'Re-engagement dormant account',     '2026-07-14', 'Phone',    'Overdue',  'Normal'),
  ('a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Konfirmasi PO batch Juli',          '2026-07-17', 'Email',    'Today',    'High'),
  ('a0000000-0000-4000-8000-000000000009', '55555555-5555-5555-5555-555555555555', 'Diskusi requirement tray',          '2026-07-19', 'Meeting',  'Upcoming', 'Normal');

-- -----------------------------------------------------------------------
-- Commercial items (mirrors src/lib/mock/data.ts's COMMERCIAL_ITEMS array)
-- -----------------------------------------------------------------------

-- Phase 11 Task 2 relocated this table to private.legacy_commercial_items_20260718
-- (see migration 20260719024024_migrate_commercial_document_data.sql) -- seed
-- data still targets the legacy row-per-item shape, and
-- private.migrate_commercial_document_data() (called at the bottom of this
-- file) converts it into the normalized commercial_documents/sales_orders
-- tables, exactly mirroring what happens to real legacy data at migration
-- time on a database that already has some.
-- rfq_number (last column) is backfilled here only for the three RFQ-type
-- rows below: this column was added later by migration
-- 20260718060000_line_items.sql and seed.sql was never updated to set it,
-- leaving these three RFQ rows with no document number at all. Phase 11
-- Task 2's normalized commercial_documents.rfq_number is NOT NULL whenever
-- type = 'RFQ', so a still-null rfq_number here would make these three rows
-- fail that check and land in private.commercial_document_migration_review
-- (MISSING_REQUIRED_DOCUMENT_NUMBER) instead of converting -- which in turn
-- leaves the tasks/follow_up_logs that already point at these rows via
-- commercial_item_id with no commercial_document_id counterpart (an
-- orphaned link). Backfilling a dev-only synthetic number here (this seed
-- file is disposable, not real business data) keeps local reconciliation
-- fully clean; it does not touch real/remote data.
insert into private.legacy_commercial_items_20260718 (id, client_id, owner_id, type, source_flow, stage, description, project_name, estimated_value, updated_at, quotation_number, customer_po_number, so_number, tax_type, prototype_status, next_action_date, rfq_number) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'RFQ',          'RFQ / New Product',        'Quotation in Progress',           'Bracket assembly 2mm SPCC',        'Astra Bracket A17',           320000000, '2026-07-14', null,               null,                  null,           null,   null,    '2026-07-18', 'RFQ/26/VII/0017'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Quotation',    'RFQ / New Product',        'Waiting Client PO',                'Housing cover rev.B',              'Sinar Housing rev.B',         185000000, '2026-07-13', 'QT/26/VII/0042',   null,                  null,           null,   null,    '2026-07-19', null),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333', 'RFQ',          'RFQ / New Product',        'Quotation Sent',                   'Panel enclosure IP54',             'Mitra Panel IP54',            240000000, '2026-07-12', 'QT/26/VII/0038',   null,                  null,           null,   null,    '2026-07-17', 'RFQ/26/VII/0013'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Direct Order', 'Existing / Repeat Order',  'Waiting Client PO',                'Repeat batch fan guard',           'Panasonic Fan Guard',          95000000, '2026-07-14', null,               null,                  null,           null,   null,    '2026-07-18', null),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Quotation',    'RFQ / New Product',        'Waiting Client PO',                'Frame chassis QTY 800',            'Yamaha Frame Chassis',        610000000, '2026-07-14', 'QT/26/VII/0045',   null,                  null,           null,   null,    '2026-07-20', null),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000007', '22222222-2222-2222-2222-222222222222', 'Prototype',    'Prototype',                'Prototype in Progress',            'Sensor mount prototype',           'Denso Sensor Mount',           18000000, '2026-07-11', null,               null,                  null,           null,   'Paid',  '2026-07-19', null),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000009', '55555555-5555-5555-5555-555555555555', 'RFQ',          'RFQ / New Product',        'RFQ Received',                     'Stainless food-grade tray',        'Indofood Tray SS304',         145000000, '2026-07-15', null,               null,                  null,           null,   null,    '2026-07-22', 'RFQ/26/VII/0022'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Direct Order', 'Existing / Repeat Order',  'PO Received',                      'Repeat order bracket A17',         'Toyota Bracket Batch VII',    420000000, '2026-07-15', null,               'PO-TMMIN-26-0712',   null,           'PPN',  null,    '2026-07-19', null),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'Quotation',    'RFQ / New Product',        'Quotation Sent',                   'Conveyor side plate',              'Mayora Conveyor Plate',       210000000, '2026-07-13', 'QT/26/VII/0041',   null,                  null,           null,   null,    '2026-07-18', null),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Prototype',    'Prototype',                'SO Prototype Released',            'Panel enclosure sample',           'Panasonic Enclosure Sample',          0, '2026-07-10', null,               null,                  'SO-26-0403',   null,   'FOC',   '2026-07-24', null),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Direct Order', 'Existing / Repeat Order',  'Timeplan/Price Update Requested',  'Chassis batch Q3',                 'Yamaha Q3 Repeat',            720000000, '2026-07-16', null,               null,                  null,           null,   null,    '2026-07-21', null),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'Customer PO',  'RFQ / New Product',        'Sales Order Released',             'Bracket assembly production run',  'Astra Bracket A17',           295000000, '2026-06-10', 'QT/26/VI/0033',    'PO-ASTRA-26-0605',   'SO-26-0602',   'PPN',  null,    null, null);

-- Link tasks to their commercial item, mirroring TASKS' commercialItemId in
-- src/lib/mock/data.ts (matched here by title, since these are the only
-- two tables where both sides are already seeded with known rows).
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000001' where title = 'Kirim revisi drawing bracket';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000002' where title = 'Follow up konfirmasi PO';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000006' where title = 'Update progress prototype';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000008' where title = 'Konfirmasi jadwal delivery';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000003' where title = 'Kirim quotation revisi';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000005' where title = 'Meeting review harga';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000009' where title = 'Follow up hasil quotation';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000004' where title = 'Konfirmasi PO batch Juli';
update public.tasks set commercial_item_id = 'b0000000-0000-4000-8000-000000000007' where title = 'Diskusi requirement tray';

-- -----------------------------------------------------------------------
-- Sales orders (mirrors src/lib/mock/data.ts's SALES_ORDERS array). The two
-- Prototype "FOC" rows (so10, so17) intentionally have a null value and
-- source 'Prototype FOC' — the revenue_recognized view excludes them.
-- -----------------------------------------------------------------------

-- Relocated to private.legacy_sales_orders_20260718 by Phase 11 Task 2, same
-- reasoning as commercial_items above.
insert into private.legacy_sales_orders_20260718 (so_number, client_id, owner_id, type, tax_type, prototype_status, source, value, date) values
  ('SO-26-0101', 'a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'RFQ / New Product',       380000000, '2026-01-14'),
  ('SO-26-0102', 'a0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 220000000, '2026-01-22'),
  ('SO-26-0201', 'a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 310000000, '2026-02-10'),
  ('SO-26-0202', 'a0000000-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333', 'Regular',   'Non-PPN', null,    'RFQ / New Product',       160000000, '2026-02-19'),
  ('SO-26-0301', 'a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 450000000, '2026-03-11'),
  ('SO-26-0302', 'a0000000-0000-4000-8000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 520000000, '2026-03-18'),
  ('SO-26-0303', 'a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'Prototype', 'PPN',     'Paid',  'Prototype Paid',          24000000,  '2026-03-25'),
  ('SO-26-0401', 'a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'Regular',   'Non-PPN', null,    'RFQ / New Product',       195000000, '2026-04-08'),
  ('SO-26-0402', 'a0000000-0000-4000-8000-000000000007', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 280000000, '2026-04-16'),
  ('SO-26-0403', 'a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Prototype', null,      'FOC',   'Prototype FOC',           null,      '2026-04-20'),
  ('SO-26-0501', 'a0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 340000000, '2026-05-06'),
  ('SO-26-0502', 'a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 610000000, '2026-05-15'),
  ('SO-26-0503', 'a0000000-0000-4000-8000-000000000003', '33333333-3333-3333-3333-333333333333', 'Regular',   'Non-PPN', null,    'RFQ / New Product',       140000000, '2026-05-22'),
  ('SO-26-0601', 'a0000000-0000-4000-8000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 480000000, '2026-06-04'),
  ('SO-26-0602', 'a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'RFQ / New Product',       295000000, '2026-06-12'),
  ('SO-26-0603', 'a0000000-0000-4000-8000-000000000005', '55555555-5555-5555-5555-555555555555', 'Prototype', 'PPN',     'Paid',  'Prototype Paid',          31000000,  '2026-06-20'),
  ('SO-26-0604', 'a0000000-0000-4000-8000-000000000007', '22222222-2222-2222-2222-222222222222', 'Prototype', null,      'FOC',   'Prototype FOC',           null,      '2026-06-25'),
  ('SO-26-0701', 'a0000000-0000-4000-8000-000000000002', '22222222-2222-2222-2222-222222222222', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 260000000, '2026-07-03'),
  ('SO-26-0702', 'a0000000-0000-4000-8000-000000000006', '33333333-3333-3333-3333-333333333333', 'Regular',   'PPN',     null,    'Existing / Repeat Order', 390000000, '2026-07-09'),
  ('SO-26-0703', 'a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333', 'Regular',   'Non-PPN', null,    'RFQ / New Product',       180000000, '2026-07-11');

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
