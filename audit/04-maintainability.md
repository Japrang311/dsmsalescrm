# Fase 3 — Maintainability

Analisis mencakup graph import internal, ukuran/kompleksitas fungsi TypeScript, batas UI/data, duplikasi, error handling, dead cache operation, database lint, dan isolasi test. Tidak ditemukan circular dependency pada graph import `src` yang dapat di-resolve statis.

## Temuan

### [SEV-04] Predicate lifecycle commercial document sudah menyimpang antar fungsi
- **Severity:** High
- **Kategori:** Maintainability
- **Bukti:** `supabase/migrations/20260806000000_add_admin_team_summary_rpc.sql:19-26` [READ]
```sql
-- filters Pipeline/Sales Orders use. The enforcement-side functions that
-- also embed this predicate (private.transfer_active_ownership,
-- private.account_reference_counts / account_ownership_counts,
-- private.delete_eligible_account in
-- 20260718180929_add_account_lifecycle_functions.sql, last touched
-- 20260719024024) are NOT changed here — same staleness, but changing
-- what gates actual deactivate/delete/transfer actions is a bigger,
-- separate decision than fixing a read-only summary display.
```
- **Dampak:** ringkasan Team mengecualikan commercial document yang soft-deleted dan revisi Quotation yang superseded, tetapi fungsi enforcement masih menghitung atau memindahkannya. Super-admin dapat melihat jumlah ownership yang berbeda dari blocker deactivate/delete, dan transfer ownership juga menulis ulang owner pada record historis yang seharusnya tidak aktif. Satu aturan bisnis kini memiliki beberapa implementasi yang sudah diketahui tidak setara.
- **Perbaikan:** Definisikan satu predicate database untuk “active commercial ownership” dan gunakan oleh summary, reference counts, ownership counts, delete eligibility, serta transfer. Sebelum mengganti gate, tambahkan characterization test untuk soft-delete, revisi superseded, dan stage terminal agar keputusan bisnis eksplisit dan rollback aman.
- **Effort:** L (>1 hari)

### [SEV-05] Halaman Task adalah satu fungsi 1.171 baris dengan kompleksitas sangat tinggi
- **Severity:** Medium
- **Kategori:** Maintainability
- **Bukti:** `src/routes/_app.tasks.tsx:227-235` [VERIFIED]
```tsx
function TasksInboxPage() {
  const { role, authReady } = useRole();
  const queryClient = useQueryClient();

  const { data: activeTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", "active"],
    queryFn: listActiveTasks,
    enabled: authReady,
  });
```
- **Dampak:** pengukuran AST menemukan fungsi `TasksInboxPage` sepanjang 1.171 baris dengan 147 decision point perkiraan; komponen yang sama mengatur query, mutation, filter, dialog, kanban/table/calendar, dan rendering row. Perubahan workflow Task memiliki blast radius besar, review diff sulit dibatasi, dan regression pada salah satu mode tampilan mudah terlewat meski typecheck lolos.
- **Perbaikan:** Ekstrak bertahap berdasarkan boundary yang sudah tampak: hook query/mutation Task, state/filter controller, dialog actions, lalu masing-masing view Table/Kanban/Calendar. Bekukan perilaku dahulu dengan test selector/controller dan satu E2E per view; jangan rewrite serentak.
- **Effort:** L (>1 hari)

### [SEV-06] Test penomoran dokumen tidak re-entrant terhadap database lokal
- **Severity:** Medium
- **Kategori:** Maintainability
- **Bukti:** `supabase/tests/document-numbering.test.ts:159-168` [VERIFIED]
```ts
test("failed quotation items roll back both header and counter", async () => {
  const salesClient = await signInAs(users().sales);
  await db`
    delete from private.document_number_counters
    where series = 'QUO' and year_code = 94
  `;

  const { error } = await salesClient.rpc("create_quotation", {
```
- **Dampak:** run ulang suite menghasilkan 3 failure: nomor tetap `DSM-94QUO-0001` bertabrakan dengan document sisa run sebelumnya, lalu teardown Auth gagal 500. Akibatnya `bun run test` dan agregat `verify:app` tidak hijau pada database yang pernah dipakai; engineer tidak dapat membedakan regression baru dari fixture residue dan CI/local confidence turun.
- **Perbaikan:** Beri namespace unik per run atau bersihkan semua document/task/activity rows yang memakai tahun fixture sebelum mereset counter. Buat teardown idempotent dan tetap menjalankan cleanup lain ketika satu delete gagal; validasi dengan dua run suite berturut-turut pada database yang sama.
- **Effort:** M (<1 hari)

### [SEV-07] Add Client menulis cache key yang tidak lagi dikonsumsi aplikasi
- **Severity:** Low
- **Kategori:** Maintainability
- **Bukti:** `src/components/clients/AddClientDialog.tsx:174-183` [READ]
```tsx
cacheListRecord(queryClient, ["clients", "all"], created);
cacheListRecord(queryClient, ["clients", "search"], {
  id: created.id,
  name: created.name,
  ownerId: created.ownerId,
});
queryClient.setQueriesData<ClientListRow[]>(
  { queryKey: ["clients", "rows"], exact: true },
  (rows) =>
```
- **Dampak:** tidak ada query production dengan key exact `["clients", "rows"]`; halaman Client sekarang memakai key pagination dari `listQueryKey("clients", "page", ...)`. Optimistic write ini tidak memperbarui UI mana pun, tetapi mempertahankan tipe dan test sintetis yang memberi kesan cache paginated sudah ditangani. Perubahan cache berikutnya berisiko mengikuti kontrak palsu ini.
- **Perbaikan:** Hapus write key mati dan test sintetisnya, atau implementasikan updater untuk seluruh cache page yang bentuknya benar. Jadikan query-key factory satu-satunya sumber key agar producer dan consumer tidak drift.
- **Effort:** S (<1 jam)

### [SEV-08] PL/pgSQL menyimpan hasil query ke variabel yang tidak pernah dibaca
- **Severity:** Low
- **Kategori:** Maintainability
- **Bukti:** `supabase/migrations/20260728091500_fix_null_role_fail_open_gates.sql:671-675` [VERIFIED]
```sql
as $$
declare
  v_caller_role text;
  v_old_owner_id uuid;
  v_new_owner_name text;
begin
```
- **Dampak:** `supabase db lint --local` menandai `v_old_owner_id`, `v_new_owner_name`, dan `v_so_linked` sebagai unused. Dua variabel pertama hanya dipakai sebagai target `select into` untuk mengecek `found`; nama variabel menyiratkan data audit akan dipakai padahal tidak. Warning tetap membuat DB lint bising dan menurunkan signal ketika warning baru muncul.
- **Perbaikan:** Ganti lookup eksistensi dengan `perform`/`exists`, hapus `v_so_linked` beserta aggregate yang tidak dikonsumsi, lalu naikkan DB lint warning menjadi gate setelah temp-table false positive dikecualikan secara eksplisit.
- **Effort:** S (<1 jam)

## Hasil analisis tanpa temuan

- **Circular dependency [VERIFIED]:** graph import statis untuk `.ts/.tsx` di `src` menghasilkan 0 cycle.
- **Duplikasi ≥3 [READ]:** tidak ditemukan blok bisnis identik tiga kali atau lebih yang cukup kuat untuk dilaporkan. Helper CSV memang terduplikasi dua kali, di bawah ambang fase ini.
- **Layering [READ]:** mayoritas akses Supabase berada di `src/lib/data`; pengecualian route Client Detail sudah dilaporkan sebagai masalah transaksi/audit pada Security, sehingga tidak diduplikasi di sini.
- **Error handling [READ]:** catch kosong lain yang diperiksa menangani parse optional/fallback dan tidak menelan mutasi kritis. Catch reassign ownership yang berbahaya sudah menjadi SEV-01.
- **Test coverage [VERIFIED]:** 79 file test dan delapan E2E mencakup banyak alur kritis/RLS; coverage numerik tidak tersedia, sehingga audit tidak mengklaim persentase.

## Batas analisis maintainability

- Cyclomatic complexity berasal dari traversal AST lokal yang menghitung branch/conditional/logical operators; ini metrik perkiraan, bukan output tool standar seperti Sonar atau ESLint complexity.
- Dead-export analysis penuh tidak dijalankan karena `knip` tidak terkonfigurasi/tersedia dalam dependency repo.
- Dynamic import dan resolution plugin dapat lolos dari graph import statis; hasil 0 cycle bukan bukti formal untuk runtime graph.
