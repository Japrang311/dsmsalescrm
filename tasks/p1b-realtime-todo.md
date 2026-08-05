# Task List: Supabase Realtime di Pipeline + Dashboard (P1B)

Spec: `specs/p1b-realtime-updates.md` (direvisi 2026-08-05).
Plan: `tasks/priority-1-plan.md`.

> **Status:** Belum diimplementasi. Task 1B-5 menyentuh **production**
> (`qhtfixgbcpcitokeryxb`) dan butuh approval eksplisit terpisah.

> **Koreksi penting dari spec:** subscription menarget `commercial_documents`,
> BUKAN `commercial_items`. `commercial_items` adalah tabel legacy pra-Phase-11
> yang sudah tidak ditulis aplikasi — `src/lib/data/commercial-items.ts` cuma
> read facade di atas `commercial_documents`. Subscribe ke tabel legacy tidak
> akan pernah fire.

## Dependency order

```
Task 1B-1 (src/lib/realtime.ts)
   │
   ├──▶ Task 1B-2 (pipeline route)   ─┐
   │                                   │
   └──▶ Task 1B-3 (dashboard hook)   ─┤
                                       ▼
                              Task 1B-4 (verifikasi lokal)
                                       │
                                       ▼
                       Task 1B-5 (remote publication) ← GATED
```

## Tasks

- [ ] **Task 1B-1: `src/lib/realtime.ts` — subscribe helper**
  - Acceptance:
    - Export `subscribeToTable(table, onChange)` yang membungkus
      `supabase.channel(...).on("postgres_changes", { event: "*", schema:
      "public", table }, onChange).subscribe()`.
    - Return fungsi unsubscribe yang benar-benar memanggil
      `supabase.removeChannel(...)` — bukan hanya `channel.unsubscribe()`,
      supaya channel tidak menumpuk di client.
    - Nama channel unik per tabel supaya dua subscriber tabel berbeda tidak
      saling menimpa.
    - Ada debounce ~500ms sebelum memanggil `onChange`, supaya perubahan
      beruntun (mis. import/batch update) tidak memicu badai
      `invalidateQueries`.
  - Verify:
    - `bun run lint` pass.
    - `bun run build` sukses (modul ini di-import route, harus aman SSR —
      pastikan tidak ada akses `window` di module scope).
  - Dependencies: None.
  - Files: `src/lib/realtime.ts` (baru).
  - Size: S.

- [ ] **Task 1B-2: Wire `_app.pipeline.tsx` ke `commercial_documents`**
  - Acceptance:
    - `useEffect` subscribe ke tabel `commercial_documents`.
    - Saat event masuk: `queryClient.invalidateQueries({ queryKey:
      ["commercial-items"] })` — query key ini yang dipakai route
      (`_app.pipeline.tsx:105`), jangan invalidate tanpa key.
    - Cleanup: unsubscribe dipanggil di return `useEffect`.
    - Subscription hanya aktif kalau `authReady` — jangan subscribe sebelum
      sesi auth siap, karena RLS filter event berdasarkan sesi.
  - Verify:
    - Buka pipeline, ubah stage sebuah dokumen lewat Supabase Studio →
      board ter-update tanpa refresh.
    - Navigate keluar dari pipeline → channel hilang (cek Network → WS,
      atau log unsubscribe sementara).
  - Dependencies: 1B-1.
  - Files: `src/routes/_app.pipeline.tsx`.
  - Size: S.

- [ ] **Task 1B-3: Wire `use-dashboard-data.ts` ke `tasks` + `sales_orders`**
  - Acceptance:
    - Subscribe ke `tasks` dan `sales_orders` di dalam `useDashboardData()`.
    - `tasks` berubah → invalidate `["tasks"]`; `sales_orders` berubah →
      invalidate `["sales-orders"]`. Pakai query key yang persis sama dengan
      yang sudah dipakai hook itu (`["tasks","all"]`, `["sales-orders","all"]`
      — invalidate dengan prefix `["tasks"]` sudah mencakup keduanya).
    - Cleanup unsubscribe saat unmount.
    - Hanya subscribe kalau `authReady` (hook sudah punya flag ini).
    - Hook ini dipakai dashboard, reports, dan activity — pastikan
      subscription tidak dobel kalau dua komponen memanggil hook yang sama
      di satu halaman.
  - Verify:
    - Buat task baru lewat Studio → daftar follow-up dashboard ter-update.
    - Buat SO baru → dashboard executive ter-update.
    - Buka dashboard + reports bersamaan, pastikan tidak ada channel ganda
      yang menumpuk.
  - Dependencies: 1B-1.
  - Files: `src/hooks/use-dashboard-data.ts`.
  - Size: S.

- [ ] **Task 1B-4: Verifikasi lokal (2 tab + RLS + memory leak)**
  - Acceptance:
    - Dua tab: pindahkan kartu pipeline di tab 1 → tab 2 ter-update ≤ 2 detik.
    - Login sebagai sales A dan sales B di dua browser/profile berbeda:
      perubahan milik B **tidak** memicu update di tab A (RLS ter-enforce
      di level realtime, bukan hanya di query).
    - Tidak ada memory leak: navigasi bolak-balik pipeline ↔ dashboard 10x,
      jumlah channel aktif tetap stabil (tidak bertambah tiap navigasi).
    - `bun run test` pass, `bun run lint` pass.
  - Verify:
    - RLS test di atas dilakukan sungguhan dengan dua user, bukan diasumsikan
      "Supabase kan sudah handle".
    - Jumlah channel dicek konkret (React DevTools / `supabase.getChannels()`
      di console).
  - Dependencies: 1B-2, 1B-3.
  - Files: tidak ada (verifikasi saja).
  - Size: S.

- [ ] **Task 1B-5: Aktifkan publication di remote — GATED**
  - Acceptance:
    - **Tidak dijalankan tanpa approval eksplisit user yang menyebut project
      `qhtfixgbcpcitokeryxb`.** Ini bukan migration file — ini konfigurasi
      replication yang dijalankan sekali via SQL editor.
    - SQL yang dijalankan:
      ```sql
      alter publication supabase_realtime add table public.commercial_documents;
      alter publication supabase_realtime add table public.tasks;
      alter publication supabase_realtime add table public.sales_orders;
      ```
    - Cek dulu apakah tabelnya sudah ada di publication sebelum menambahkan
      (menambah tabel yang sudah ada akan error).
  - Verify:
    - Query konfirmasi: `select tablename from pg_publication_tables where
      pubname = 'supabase_realtime';` → ketiga tabel muncul.
    - Buka app production di 2 device → realtime jalan.
  - Dependencies: 1B-4 + approval user.
  - Files: tidak ada file repo (operasi manual di dashboard Supabase).
  - Size: XS.

## Checkpoint akhir P1B

- [ ] 2 tab: update ≤ 2 detik
- [ ] RLS terbukti: sales tidak menerima event sales lain (diuji dengan 2 user)
- [ ] Channel unsubscribe bersih saat unmount, tidak menumpuk
- [ ] `bun run test` pass, `bun run lint` pass
- [ ] **Konfirmasi user sebelum push ke `main`**
- [ ] **Approval terpisah sebelum menjalankan SQL publication di production**
