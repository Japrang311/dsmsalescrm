# Fase 4 — Readability

Audit menilai semantic naming, compatibility API, komentar, lint/formatter, dan dead identifiers. Temuan tidak mengulang kompleksitas file yang sudah dicatat pada Maintainability.

## Temuan

### [SEV-09] Event reassign owner dinamai sebagai perubahan status Client
- **Severity:** Medium
- **Kategori:** Readability
- **Bukti:** `src/routes/_app.clients.$clientId.tsx:295-304` [READ]
```tsx
const { error: logErr } = await supabase
  .from("activity_log")
  .insert({
    kind: "client_status_change",
    owner_id: newOwnerId,
    actor_id: actorId,
    client_id: client.id,
    title: `${client.name} direassign ke ${newOwnerName}`,
    detail: note
      ? `${oldOwnerName} → ${newOwnerName}\n${note}`
```
- **Dampak:** `listClientStatusHistory()` memilih semua event `client_status_change` lalu memecah `detail` sebagai `status lama → status baru`; akibatnya nama owner dari event reassign dirender oleh `StatusAuditTrail` sebagai badge status Client. Nama event yang salah bukan kosmetik: filter Activity, label “Perubahan Status Client”, dan audit trail status mencampur dua domain event berbeda.
- **Perbaikan:** Tambahkan kind khusus `client_owner_change` dengan payload terstruktur `old_owner_id/new_owner_id`; filter status history hanya ke event status. Migrasikan atau beri compatibility parser untuk row lama agar history tidak hilang.
- **Effort:** M (<1 hari)

### [SEV-10] Kontrak `CommercialItemPatch` menawarkan field yang selalu ditolak
- **Severity:** Medium
- **Kategori:** Readability
- **Bukti:** `src/lib/data/commercial-items.ts:109-118` [READ]
```ts
export async function updateCommercialItem(
  id: string,
  patch: CommercialItemPatch,
): Promise<CommercialItem> {
  if (
    patch.nextActionDate !== undefined ||
    patch.customerPoNumber !== undefined ||
    patch.taxType !== undefined
  ) {
    throw new Error("UNSUPPORTED_NORMALIZED_DOCUMENT_PATCH");
```
- **Dampak:** type `CommercialItemPatch` mengizinkan tiga field yang public function-nya selalu tolak pada runtime. Di tempat lain komentar Pipeline masih menyebut `CommercialItem.nextActionDate` sebagai data authoritative, padahal adapter normalized document tidak mengisinya. Engineer baru mendapat autocomplete yang valid secara TypeScript tetapi gagal saat dijalankan, sehingga boundary migrasi lama/baru sulit dipercaya.
- **Perbaikan:** Pisahkan tipe patch yang benar-benar didukung dari legacy read model; tandai compatibility facade deprecated dan dokumentasikan sumber authoritative tiap field. Hapus field yang mustahil dari input compile-time, lalu pindahkan caller ke API normalized document/task yang benar.
- **Effort:** M (<1 hari)

### [SEV-11] Aturan lint mematikan deteksi identifier TypeScript yang tidak dipakai
- **Severity:** Low
- **Kategori:** Readability
- **Bukti:** `eslint.config.js:45-50` [VERIFIED]
```js
"react-refresh/only-export-components": [
  "warn",
  { allowConstantExport: true },
],
"@typescript-eslint/no-unused-vars": "off",
```
- **Dampak:** run tambahan `tsc --noUnusedLocals --noUnusedParameters` menemukan delapan identifier mati pada enam file, termasuk import `listCommercialItems`, `describeTaskChanges`, dan `activeCommercialTasks` di route besar. Karena lint normal menonaktifkan rule dan TypeScript normal tidak mengaktifkan flag tersebut, kode mati menumpuk tanpa signal CI dan memperbesar daftar konsep palsu yang harus dipahami reviewer.
- **Perbaikan:** Aktifkan `@typescript-eslint/no-unused-vars` sebagai warning lalu error setelah delapan temuan dibersihkan; beri pola ignore eksplisit untuk parameter sengaja tidak dipakai, bukan mematikan rule global.
- **Effort:** S (<1 jam)

### [SEV-12] Branch saat ini tidak memenuhi formatter yang diwajibkan lint
- **Severity:** Low
- **Kategori:** Readability
- **Bukti:** `src/components/dashboard/DateRangePicker.tsx:83-89` [VERIFIED]
```tsx
<span className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
  Preset
</span>
<span className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">
  Mengatur rentang untuk Export saja, KPI di layar tetap YTD /
  bulan berjalan.
</span>
```
- **Dampak:** `bun run lint` exit 1 dengan dua error Prettier pada baris 87-88, sehingga branch bersih secara Git tetapi quality gate CI akan gagal sebelum test/build. Perbedaan formatting kecil ini membuat status release tidak hijau dan memaksa contributor berikutnya mencampur cleanup mekanis ke perubahan fungsionalnya.
- **Perbaikan:** Format file yang ditunjuk Prettier, lalu tambahkan check format yang cepat pada pre-commit atau jalankan formatter pada file staged agar error mekanis tertangkap sebelum CI.
- **Effort:** S (<1 jam)

## Hasil analisis tanpa temuan

- **Dokumentasi non-obvious [READ]:** fungsi RPC kompleks dan adapter migrasi umumnya memiliki komentar yang menjelaskan invariant/transisi; beberapa comment bahkan mengakui debt secara eksplisit.
- **Terminologi workflow [READ]:** `workflowStatus` dan derived `dueState` dipisahkan dengan komentar/type yang jelas; legacy `status` tidak lagi dipakai sebagai sumber kebenaran pada alur Task yang diperiksa.
- **Formatter/linter availability [VERIFIED]:** ESLint, eslint-plugin-prettier, React Hooks rules, dan TypeScript tersedia serta dijalankan CI. Masalahnya adalah branch belum hijau dan satu rule penting dimatikan, bukan ketiadaan tooling.
- **Penamaan file/module [READ]:** pola route TanStack dan folder domain secara umum konsisten; nama compatibility `commercial-items` sengaja dipertahankan selama migrasi dan hanya diangkat ketika kontraknya benar-benar menyesatkan.

## Batas analisis readability

- Copy UI bahasa Indonesia/Inggris tidak dinilai sebagai defect tanpa glossary produk authoritative.
- Generated route tree, migration auto-generated, lockfile, dan aset tidak dinilai untuk readability sesuai scope Fase 0.
- Tidak setiap dari 388 file dibaca baris demi baris; pemeriksaan mendalam diprioritaskan oleh LOC, churn, sink security, warning tool, dan jalur bisnis kritis.
