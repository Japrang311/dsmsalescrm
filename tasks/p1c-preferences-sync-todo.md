# Task List: User Preferences Sync ke DB (P1C)

Spec: `specs/p1c-preferences-sync.md` (direvisi 2026-08-05).
Plan: `tasks/priority-1-plan.md`.

> **Status:** Belum diimplementasi. Task 1C-6 menyentuh **production**
> (`qhtfixgbcpcitokeryxb`) dan butuh approval eksplisit terpisah.

> **Peringatan security.** Ini menambahkan UPDATE policy self-service
> **pertama** yang pernah ada di tabel `profiles`. Tabel itu sengaja dikunci
> sejak migration awal (`20260717172233_profiles.sql`): user biasa hanya
> punya `grant select`, dan perubahan `role` hanya boleh lewat service_role.
> Kalau grant-nya kelebaran, user bisa menaikkan role dirinya sendiri jadi
> `super_admin`. Karena itu Task 1C-2 mensyaratkan test NEGATIF — bukan
> opsional, bukan "nanti kalau sempat".

## Dependency order

```
Task 1C-1 (migration: kolom + policy + grant)
   │
   ▼
Task 1C-2 (RLS test, termasuk test negatif eskalasi role)
   │
   ▼
Task 1C-3 (preferences-store.ts: hydrate/persist)
   │
   ▼
Task 1C-4 (data module test)
   │
   ▼
Task 1C-5 (verifikasi integrasi Settings)
   │
   ▼
Task 1C-6 (apply migration ke remote) ← GATED
```

## Tasks

- [ ] **Task 1C-1: Migration — kolom `preferences` + policy + column-scoped grant**
  - Acceptance:
    - `alter table public.profiles add column preferences jsonb not null
      default '{}'::jsonb;`
    - Policy baru:
      ```sql
      create policy "profiles_update_own_preferences"
      on public.profiles
      for update
      to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
      ```
    - Grant **per kolom**, bukan blanket:
      `grant update (preferences) on public.profiles to authenticated;`
      Jangan pernah menulis `grant update on public.profiles to authenticated`
      — itu membuka `role`, `name`, `email` sekaligus.
    - File migration diberi komentar penjelas (ikut gaya migration existing
      di repo ini yang selalu punya "plain-language summary") yang menyebut
      kenapa `profiles` sebelumnya tidak punya UPDATE policy dan kenapa
      yang ini aman.
  - Verify:
    - `bunx supabase db reset` sukses tanpa error.
    - Cek manual via psql: kolom ada, policy ada, dan
      `information_schema.column_privileges` hanya menampilkan `preferences`
      untuk privilege UPDATE milik `authenticated`.
  - Dependencies: None.
  - Files: 1 migration baru di `supabase/migrations/`.
  - Size: S.

- [ ] **Task 1C-2: RLS test — termasuk test negatif eskalasi role**
  - Acceptance:
    - Test positif:
      - Sales A update `preferences` miliknya sendiri → sukses.
      - Manager update `preferences` miliknya sendiri → sukses.
      - Executive update `preferences` miliknya sendiri → sukses.
    - Test negatif (WAJIB — ini inti keamanan task ini):
      - Sales A update `preferences` milik Sales B → ditolak.
      - Manager update `preferences` milik Sales A → ditolak.
      - **Sales A mencoba update `role` dirinya sendiri jadi `super_admin`
        → ditolak.**
      - **Sales A mencoba update `name`/`email` dirinya sendiri → ditolak.**
      - Sales A mencoba update `preferences` DAN `role` dalam satu statement
        → seluruh statement ditolak (bukan sebagian berhasil).
    - Pakai helper existing: `createRoleFixtureUsers`, `signInAs`,
      `adminClient` dari `supabase/tests/helpers.ts`.
    - Cleanup fixture di `afterAll` (pola sama seperti test lain di repo).
  - Verify:
    - `bun run test` pass.
    - Test negatif benar-benar GAGAL kalau grant-nya sengaja dilebarkan —
      buktikan sekali dengan mengubah grant jadi blanket sementara, pastikan
      test merah, lalu kembalikan. Test yang tidak pernah bisa merah tidak
      membuktikan apa pun.
  - Dependencies: 1C-1.
  - Files: `supabase/tests/preferences-rls.test.ts` (baru).
  - Size: S.

- [ ] **Task 1C-3: `preferences-store.ts` — hydrate dari DB, persist ke DB**
  - Acceptance:
    - API publik store **tidak berubah**: `useSettings()`,
      `settingsActions.updatePreferences(userId, prefs)`,
      `defaultUserPreferences()` tetap dengan signature yang sama, tetap
      sinkron. `_app.settings.tsx` tidak perlu diubah.
    - localStorage tetap jadi sumber paint pertama (sinkron) — supaya form
      tidak flicker dari default lalu loncat ke nilai DB.
    - Tambah `hydrateFromDatabase(userId)` async yang dipanggil setelah auth
      siap: fetch `profiles.preferences`, dan hanya menimpa state lokal
      kalau row DB memang berisi (bukan `{}` kosong).
    - `updatePreferences` tetap update state + localStorage secara sinkron
      (optimistic), lalu menulis ke Supabase sebagai efek samping async.
    - Kalau tulis ke Supabase gagal: **jangan** rollback UI dan jangan
      lempar error ke user — nilai tetap tersimpan di localStorage, dan
      di-retry saat hydrate berikutnya. Preferences tampilan tidak layak
      bikin app rusak.
    - Fetch preferences yang gagal **tidak boleh memblokir app load**.
  - Verify:
    - `bun run lint` pass, `bun run build` sukses.
    - Manual: ubah preferences → cek row `profiles.preferences` di Studio.
    - Manual: matikan Supabase lokal (`bunx supabase stop`), ubah
      preferences → tidak ada crash, nilai tetap berubah di UI.
  - Dependencies: 1C-2 (policy sudah terbukti aman sebelum dipakai kode).
  - Files: `src/lib/preferences-store.ts`, plus tempat pemanggilan hydrate
    (kemungkinan `src/context/role-context.tsx` karena di situ `authReady`
    diketahui — konfirmasi saat implementasi).
  - Size: M.

- [ ] **Task 1C-4: Data module test**
  - Acceptance:
    - `hydrateFromDatabase()` mengembalikan nilai dari DB kalau ada.
    - `hydrateFromDatabase()` untuk user tanpa preferences (`{}`) tidak
      menimpa nilai localStorage yang sudah ada.
    - `updatePreferences()` menulis ke DB.
    - Supabase error saat persist → state lokal tetap ter-update, tidak
      melempar.
  - Verify:
    - `bun run test` pass.
  - Dependencies: 1C-3.
  - Files: `src/lib/preferences-store.test.ts` (baru).
  - Size: S.

- [ ] **Task 1C-5: Verifikasi integrasi Settings**
  - Acceptance:
    - Ubah language/timezone/dateFormat/currencyFormat di Settings →
      tersimpan di `profiles.preferences`.
    - Logout, login di browser lain (atau clear localStorage) → preferences
      ikut, tidak balik ke default.
    - `displayName`/`email` di preferences tetap terpisah dari
      `profiles.name`/`profiles.email` (keputusan: sengaja duplikat —
      yang di `profiles` admin-managed, yang di preferences user-managed).
      Pastikan mengubah salah satu tidak diam-diam menimpa yang lain.
  - Verify:
    - Diuji manual di `bun run dev` dengan clear localStorage, bukan hanya
      diasumsikan dari kode.
  - Dependencies: 1C-4.
  - Files: tidak ada (verifikasi saja; kalau ternyata `_app.settings.tsx`
    perlu diubah, berarti asumsi "API tidak berubah" salah — hentikan dan
    lapor).
  - Size: S.

- [ ] **Task 1C-6: Apply migration ke remote — GATED**
  - Acceptance:
    - **Tidak dijalankan tanpa approval eksplisit user yang menyebut project
      `qhtfixgbcpcitokeryxb`.**
    - Migration di-apply lewat jalur yang biasa dipakai project ini, bukan
      SQL tempel manual, supaya `list_migrations` remote tetap sinkron
      dengan `supabase/migrations/` lokal.
  - Verify:
    - Migration muncul di daftar migration remote.
    - Smoke test di production: ubah satu preference, cek tersimpan.
    - Spot-check keamanan di production: coba update `role` sendiri lewat
      client → ditolak.
  - Dependencies: 1C-5 + approval user.
  - Files: tidak ada file baru.
  - Size: XS.

## Checkpoint akhir P1C

- [ ] `bunx supabase db reset` sukses
- [ ] RLS test pass — **termasuk semua test negatif eskalasi role**
- [ ] `bun run test` pass, `bun run lint` pass
- [ ] Preferences ikut pindah device
- [ ] Supabase mati → app tidak rusak, preferences tetap bisa diubah
- [ ] **Konfirmasi user sebelum push ke `main`**
- [ ] **Approval terpisah sebelum apply migration ke production**
