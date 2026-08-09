# Stage 3 Performance Budgets — Disetujui, di-enforce via CI

**Tanggal:** 2026-08-07
**Status:** **Disetujui owner 2026-08-07.** Budget di bawah + opsi CI-enforced. Aktif di CI job `performance_budget` (`.github/workflows/ci.yml`), dijalanin lewat `bun run stage3:check-budgets` (`scripts/stage3-check-budgets.ts`) setelah fixture sintetis (`bun run stage3:fixture`) di-load ke local Supabase job itu. Job gagal (exit 1) kalau ada kontrak yang lewat budget median/max/payload-nya.

## Kenapa ini dibuat

Stage 3 udah ganti semua fetch full-table unbounded jadi paginated query atau aggregate RPC (lihat before/after report, `2026-08-07-stage-3-before-after.md`). Scale benchmark (`2026-08-07-stage-3-scale-benchmark.md`) udah buktiin kontrak bounded itu tetap cepat di skala ~10x data production. Proposal ini ubah hasil pengukuran itu jadi budget konkret yang bisa dicek, biar perubahan di masa depan gak diam-diam balik ke unbounded fetch tanpa ketauan.

## Usulan budget

Berdasarkan angka scale-benchmark (2.000 klien / ~4.000 quotation / ~1.000 sales order / 4.000 task, lokal):

| Tipe kontrak | Budget (median) | Budget (max) | Dasar |
| --- | ---: | ---: | --- |
| Paginated first-page read (route mana pun) | 50 ms | 150 ms | Terukur 2,7–29 ms di halaman Clients/Commercial Documents/Sales Orders pada skala 10x |
| Aggregate RPC (`GROUP BY`/`SUM` sederhana) | 30 ms | 100 ms | Terukur 2–14 ms untuk `sales_orders_metrics`, `pipeline_metrics`, `sales_orders_monthly_trend`, `sales_orders_owner_ytd`, `sales_orders_top_customers` |
| Aggregate RPC dengan function call per-baris (mis. `sales_task_client_metrics` yang pakai lateral join `compute_task_due_state`) | 220 ms | 400 ms | Terukur 92–105 ms lokal di 4.000 task; **direvisi 2026-08-07** dari 150/300ms setelah CI run pertama di GitHub Actions (runner shared, lebih lambat/noisy dari mesin lokal) ngukur 159,96ms median — lewat budget awal padahal semua kontrak lain lolos jauh di bawah budget-nya di run yang sama |
| Payload response, per query | 200 KB | 1 MB | Payload paginated/RPC terukur 200 B–65 KB; budget kasih ruang tanpa izinin balik ke payload full-table (yang terukur 500 KB–1,2 MB di skala ini) |
| Jumlah baris yang dikembalikan per query | 200 baris | — | Cocok sama page size terbesar yang udah dipakai (Commercial Documents, 50/stage) plus margin aman; kalau butuh lebih dari ini harus pakai pagination atau aggregate, bukan fetch tunggal yang lebih besar |

**Sengaja gak dikasih budget (memang harus tetap unbounded):**
- Endpoint export (`listAllActivityFeedEvents`, fetch export Sales Orders/Reports) — ini WAJIB kembaliin seluruh hasil filter yang lengkap buat file export yang benar, bukan halaman terbatas. Risikonya soal waktu/memori pas export makin gede seiring data, bukan soal halaman yang salah — udah didokumentasikan sebagai tradeoff yang disengaja di todo Stage 3 ("Keep export complete and independent of current UI page").
- Fetch penuh di balik `useDashboardData()` yang masih dipakai export (`orders`/`tasks`/`items`/`clients`) — alasan sama.

## Cara enforce

Dua opsi, gak saling eksklusif:

1. ~~Manual, disiplin per-PR~~ — gak dipilih.
2. **Di-enforce via CI — DIPILIH.** Job baru `performance_budget` di `.github/workflows/ci.yml`: start Supabase lokal, reset DB, load fixture sintetis (`bun run stage3:fixture`, skala default 2.000 klien), jalanin `bun run stage3:check-budgets` yang ngukur 9 kontrak bounded dan gagalin job (exit 1) kalau ada yang lewat budget median/max/payload di tabel atas. Jalan di tiap PR dan tiap push ke `main`, sama kayak job CI lain di repo ini — bukan nightly/on-demand.

## Verifikasi lokal sebelum di-push

Dijalanin lokal 2026-08-07 setelah fixture di-load (2.000 klien / ~3.900 quotation / ~1.010 SO / 4.000 task): semua 9 kontrak PASS, termasuk `sales_task_client_metrics` yang paling lambat (96-102ms, di bawah budget 150/300ms-nya).

## Status keputusan

- [x] Setuju angka budget di atas — **2026-08-07**.
- [x] Setuju cara enforce: **CI-enforced** — **2026-08-07**.
- [x] Job CI baru ditambahin (`performance_budget`) — nambah waktu CI (start Supabase + reset + fixture + benchmark, kira-kira sama kayak job `database`/`tests` yang udah ada).
