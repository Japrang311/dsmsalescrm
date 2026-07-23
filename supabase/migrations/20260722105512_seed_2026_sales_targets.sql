-- Seed the owner-approved 2026 dynamic monthly sales targets.
-- Source: /Users/macbook/Downloads/Target_Penjualan_Tim_Sales_2026.md
--
-- The app already models targets as one row per sales_id/year/month. This
-- migration upserts the exact month-by-month 2026 values by profile name so
-- local and remote databases can converge without manual Settings clicks.

do $$
declare
  matched_profiles int;
begin
  with target_values(name, month, target) as (
    values
      ('Adhitya Wirambara', 1, 750000000::bigint),
      ('Adhitya Wirambara', 2, 900000000::bigint),
      ('Adhitya Wirambara', 3, 1050000000::bigint),
      ('Adhitya Wirambara', 4, 1200000000::bigint),
      ('Adhitya Wirambara', 5, 1350000000::bigint),
      ('Adhitya Wirambara', 6, 1500000000::bigint),
      ('Adhitya Wirambara', 7, 1350000000::bigint),
      ('Adhitya Wirambara', 8, 1350000000::bigint),
      ('Adhitya Wirambara', 9, 1500000000::bigint),
      ('Adhitya Wirambara', 10, 1200000000::bigint),
      ('Adhitya Wirambara', 11, 1050000000::bigint),
      ('Adhitya Wirambara', 12, 1200000000::bigint),

      ('Leli Al', 1, 625000000::bigint),
      ('Leli Al', 2, 750000000::bigint),
      ('Leli Al', 3, 875000000::bigint),
      ('Leli Al', 4, 1000000000::bigint),
      ('Leli Al', 5, 1125000000::bigint),
      ('Leli Al', 6, 1250000000::bigint),
      ('Leli Al', 7, 1125000000::bigint),
      ('Leli Al', 8, 1125000000::bigint),
      ('Leli Al', 9, 1250000000::bigint),
      ('Leli Al', 10, 1000000000::bigint),
      ('Leli Al', 11, 875000000::bigint),
      ('Leli Al', 12, 1000000000::bigint),

      ('Nur Iman', 1, 500000000::bigint),
      ('Nur Iman', 2, 600000000::bigint),
      ('Nur Iman', 3, 700000000::bigint),
      ('Nur Iman', 4, 800000000::bigint),
      ('Nur Iman', 5, 900000000::bigint),
      ('Nur Iman', 6, 1000000000::bigint),
      ('Nur Iman', 7, 900000000::bigint),
      ('Nur Iman', 8, 900000000::bigint),
      ('Nur Iman', 9, 1000000000::bigint),
      ('Nur Iman', 10, 800000000::bigint),
      ('Nur Iman', 11, 700000000::bigint),
      ('Nur Iman', 12, 800000000::bigint),

      ('Siti Zulaika (Ika)', 1, 312500000::bigint),
      ('Siti Zulaika (Ika)', 2, 375000000::bigint),
      ('Siti Zulaika (Ika)', 3, 437500000::bigint),
      ('Siti Zulaika (Ika)', 4, 500000000::bigint),
      ('Siti Zulaika (Ika)', 5, 562500000::bigint),
      ('Siti Zulaika (Ika)', 6, 625000000::bigint),
      ('Siti Zulaika (Ika)', 7, 562500000::bigint),
      ('Siti Zulaika (Ika)', 8, 562500000::bigint),
      ('Siti Zulaika (Ika)', 9, 625000000::bigint),
      ('Siti Zulaika (Ika)', 10, 500000000::bigint),
      ('Siti Zulaika (Ika)', 11, 437500000::bigint),
      ('Siti Zulaika (Ika)', 12, 500000000::bigint),

      ('Feni Cahyaningtias', 1, 312500000::bigint),
      ('Feni Cahyaningtias', 2, 375000000::bigint),
      ('Feni Cahyaningtias', 3, 437500000::bigint),
      ('Feni Cahyaningtias', 4, 500000000::bigint),
      ('Feni Cahyaningtias', 5, 562500000::bigint),
      ('Feni Cahyaningtias', 6, 625000000::bigint),
      ('Feni Cahyaningtias', 7, 562500000::bigint),
      ('Feni Cahyaningtias', 8, 562500000::bigint),
      ('Feni Cahyaningtias', 9, 625000000::bigint),
      ('Feni Cahyaningtias', 10, 500000000::bigint),
      ('Feni Cahyaningtias', 11, 437500000::bigint),
      ('Feni Cahyaningtias', 12, 500000000::bigint)
  )
  select count(distinct p.name)
  into matched_profiles
  from (select distinct name from target_values) tv
  join public.profiles p on p.name = tv.name;

  -- On a fresh local `db reset`, migrations always run before seed.sql, so
  -- `profiles` is still empty here — that's expected, not an error. Skip
  -- quietly in that case; supabase/seed.sql already inserts this same 2026
  -- target data directly (after the profiles insert), so local databases
  -- still end up correct. Only raise if profiles exist but the names don't
  -- match (a real data problem, e.g. on remote where profiles pre-date
  -- this migration).
  if matched_profiles = 0 then
    raise notice
      'Skipping 2026 sales targets seed: no profiles found yet (expected during a fresh local db reset; see supabase/seed.sql).';
    return;
  elsif matched_profiles <> 5 then
    raise exception
      'Expected 5 target sales profiles, found %. Check profile names before seeding 2026 targets.',
      matched_profiles;
  end if;

  with target_values(name, month, target) as (
    values
      ('Adhitya Wirambara', 1, 750000000::bigint),
      ('Adhitya Wirambara', 2, 900000000::bigint),
      ('Adhitya Wirambara', 3, 1050000000::bigint),
      ('Adhitya Wirambara', 4, 1200000000::bigint),
      ('Adhitya Wirambara', 5, 1350000000::bigint),
      ('Adhitya Wirambara', 6, 1500000000::bigint),
      ('Adhitya Wirambara', 7, 1350000000::bigint),
      ('Adhitya Wirambara', 8, 1350000000::bigint),
      ('Adhitya Wirambara', 9, 1500000000::bigint),
      ('Adhitya Wirambara', 10, 1200000000::bigint),
      ('Adhitya Wirambara', 11, 1050000000::bigint),
      ('Adhitya Wirambara', 12, 1200000000::bigint),

      ('Leli Al', 1, 625000000::bigint),
      ('Leli Al', 2, 750000000::bigint),
      ('Leli Al', 3, 875000000::bigint),
      ('Leli Al', 4, 1000000000::bigint),
      ('Leli Al', 5, 1125000000::bigint),
      ('Leli Al', 6, 1250000000::bigint),
      ('Leli Al', 7, 1125000000::bigint),
      ('Leli Al', 8, 1125000000::bigint),
      ('Leli Al', 9, 1250000000::bigint),
      ('Leli Al', 10, 1000000000::bigint),
      ('Leli Al', 11, 875000000::bigint),
      ('Leli Al', 12, 1000000000::bigint),

      ('Nur Iman', 1, 500000000::bigint),
      ('Nur Iman', 2, 600000000::bigint),
      ('Nur Iman', 3, 700000000::bigint),
      ('Nur Iman', 4, 800000000::bigint),
      ('Nur Iman', 5, 900000000::bigint),
      ('Nur Iman', 6, 1000000000::bigint),
      ('Nur Iman', 7, 900000000::bigint),
      ('Nur Iman', 8, 900000000::bigint),
      ('Nur Iman', 9, 1000000000::bigint),
      ('Nur Iman', 10, 800000000::bigint),
      ('Nur Iman', 11, 700000000::bigint),
      ('Nur Iman', 12, 800000000::bigint),

      ('Siti Zulaika (Ika)', 1, 312500000::bigint),
      ('Siti Zulaika (Ika)', 2, 375000000::bigint),
      ('Siti Zulaika (Ika)', 3, 437500000::bigint),
      ('Siti Zulaika (Ika)', 4, 500000000::bigint),
      ('Siti Zulaika (Ika)', 5, 562500000::bigint),
      ('Siti Zulaika (Ika)', 6, 625000000::bigint),
      ('Siti Zulaika (Ika)', 7, 562500000::bigint),
      ('Siti Zulaika (Ika)', 8, 562500000::bigint),
      ('Siti Zulaika (Ika)', 9, 625000000::bigint),
      ('Siti Zulaika (Ika)', 10, 500000000::bigint),
      ('Siti Zulaika (Ika)', 11, 437500000::bigint),
      ('Siti Zulaika (Ika)', 12, 500000000::bigint),

      ('Feni Cahyaningtias', 1, 312500000::bigint),
      ('Feni Cahyaningtias', 2, 375000000::bigint),
      ('Feni Cahyaningtias', 3, 437500000::bigint),
      ('Feni Cahyaningtias', 4, 500000000::bigint),
      ('Feni Cahyaningtias', 5, 562500000::bigint),
      ('Feni Cahyaningtias', 6, 625000000::bigint),
      ('Feni Cahyaningtias', 7, 562500000::bigint),
      ('Feni Cahyaningtias', 8, 562500000::bigint),
      ('Feni Cahyaningtias', 9, 625000000::bigint),
      ('Feni Cahyaningtias', 10, 500000000::bigint),
      ('Feni Cahyaningtias', 11, 437500000::bigint),
      ('Feni Cahyaningtias', 12, 500000000::bigint)
  )
  insert into public.targets (sales_id, year, month, target)
  select p.id, 2026, tv.month, tv.target
  from target_values tv
  join public.profiles p on p.name = tv.name
  on conflict (sales_id, year, month)
  do update set target = excluded.target;
end $$;
