# Fase 2 — Security

Audit ini menelusuri alur autentikasi, otorisasi/RLS, mutasi privileged, input ke sink, secret/config, export data, upload/import, dan Edge Function. Temuan diurutkan berdasarkan severity.

## Temuan

### [SEV-01] Perubahan owner dapat berhasil tanpa audit trail
- **Severity:** High
- **Kategori:** Security
- **Bukti:** `src/routes/_app.clients.$clientId.tsx:302-311` [READ]
```tsx
title: `${client.name} direassign ke ${newOwnerName}`,
detail: note
  ? `${oldOwnerName} → ${newOwnerName}\n${note}`
  : `${oldOwnerName} → ${newOwnerName}`,
});
if (logErr) console.error("Activity log failed:", logErr);
}
} catch {
// Non-blocking — activity log failure shouldn't block the reassign
}
```
- **Dampak:** RPC `reassign_client_owner` sudah commit pada baris 280-287 sebelum request kedua menulis log. Jika actor lookup, jaringan, RLS, atau insert log gagal, error sengaja ditelan pada baris 307-310; manager/super-admin tetap berhasil memindahkan client tetapi tidak ada rekam siapa, dari owner mana, ke owner mana, dan alasan perubahan. Ini merusak non-repudiation pada operasi ownership yang memengaruhi visibilitas dan tanggung jawab data penjualan.
- **Perbaikan:** Pindahkan insert `activity_log` ke dalam transaksi PostgreSQL yang sama dengan update owner di `reassign_client_owner`; ambil actor dari `auth.uid()`, simpan old/new owner dan note sebagai data terstruktur, lalu jadikan kegagalan audit membatalkan seluruh RPC. Tambahkan test yang memaksa insert log gagal dan memastikan owner tidak berubah.
- **Effort:** M (<1 hari)

### [SEV-02] Dependency audit gagal dengan advisory high yang belum ditutup
- **Severity:** Medium
- **Kategori:** Security
- **Bukti:** `package.json:75-84` [VERIFIED]
```json
"jspdf": "^4.2.1",
"jspdf-autotable": "^5.0.8",
"lucide-react": "^0.575.0",
"react": "^19.2.0",
"react-day-picker": "^9.14.0",
"react-dom": "^19.2.0",
"react-hook-form": "^7.71.2",
"react-resizable-panels": "^4.6.5",
"recharts": "^2.15.4",
"sonner": "^2.0.7",
```
- **Dampak:** `bun audit --json` exit 1 dengan 17 advisory pada tujuh paket bernama unik, termasuk advisory high pada dependency transitif `brace-expansion`, `js-yaml`, `nanoid`, dan `postcss`, serta DOMPurify moderate yang ikut masuk bundle PDF production. Audit belum membuktikan jalur eksploit aplikasi untuk advisory tersebut, tetapi CI/build dan fungsi export membawa komponen rentan tanpa acceptance/mitigation yang terdokumentasi; perubahan fitur berikutnya dapat mengaktifkan jalur yang kini belum reachable.
- **Perbaikan:** Triage setiap advisory terhadap dependency graph dan jalur runtime; upgrade dependency induk yang menarik versi rentan, pin resolusi aman bila upgrade induk belum tersedia, lalu jadikan `bun audit` gate CI dengan allowlist beralasan dan tanggal kedaluwarsa untuk advisory yang benar-benar tidak reachable.
- **Effort:** M (<1 hari)

### [SEV-03] Job dependency CI selalu menjadi laporan, bukan gate
- **Severity:** Medium
- **Kategori:** Security
- **Bukti:** `scripts/dependency-risk-report.ts:18-26` [READ]
```ts
const proc = Bun.spawn({
  cmd: ["bun", "audit", "--json"],
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
await proc.exited;
```
- **Dampak:** script menunggu exit code `bun audit` tetapi tidak pernah membacanya atau menerapkan threshold severity. Job CI `dependency_risk` tetap exit 0 selama JSON dapat diparse, termasuk pada baseline saat terdapat advisory high; pull request baru dapat menambah critical/high vulnerability tanpa memblokir merge.
- **Perbaikan:** Baca `proc.exited`, hitung advisory setelah allowlist bertanggal diterapkan, dan keluar non-zero bila ada critical atau high yang tidak dikecualikan. Pertahankan upload report dengan `if: always()` agar bukti tetap tersedia saat gate gagal.
- **Effort:** S (<1 jam)

## Hasil penelusuran tanpa temuan

- **Authentication/session [READ]:** aplikasi memakai Supabase `signInWithPassword`, session listener, dan lookup profil aktif; akses role gagal tertutup jika profil hilang/inaktif/error. Tidak ditemukan token yang dicetak ke log atau secret service-role di bundle client.
- **Authorization/IDOR [VERIFIED]:** seluruh 12 tabel `public` pada database lokal memiliki RLS aktif; tidak ada grant `anon` pada view atau privileged function yang diperiksa. Delapan flow Chromium, termasuk denial write Executive oleh RLS/RPC, lolos. Database advisor tidak memberi security advisory.
- **View/function boundary [VERIFIED]:** view feed/revenue memakai `security_invoker`; `client_search_index` adalah pengecualian `security_definer`, tetapi hanya mengekspos id/nama/owner dan memiliki gate role authenticated. Semua privileged definer function yang diperiksa mencabut execute dari `anon`.
- **Injection/XSS [READ]:** satu penggunaan `dangerouslySetInnerHTML` membentuk CSS dari konfigurasi chart statis; tidak ditemukan alur input pengguna ke sink tersebut, `eval`, command shell, query SQL string mentah, atau URL fetch server-side.
- **Export [READ]:** kedua pembuat CSV menetralkan awalan formula `=`, `+`, `-`, dan `@` sebelum quoting. PDF memakai API text/table, bukan renderer HTML DOMPurify.
- **Import/upload [READ]:** import spreadsheet adalah CLI operator, membatasi remote write dengan flag eksplisit, dan review log mentah dikecualikan oleh `.gitignore`. Tidak ada endpoint upload aplikasi yang ditemukan.
- **Edge Function [READ]:** `manage-team-member` membatasi body, memvalidasi bearer JWT dengan Auth server, memverifikasi role/status profil, memvalidasi UUID/email/password, dan menjaga service-role key hanya di server. CORS wildcard tidak membawa cookie dan endpoint tetap memerlukan bearer token.
- **Headers/config [READ]:** CSP, HSTS, nosniff, frame denial, referrer policy, dan permissions policy dipasang pada response production. `unsafe-inline` masih ada untuk bootstrap/hydration, tetapi tidak ditemukan sink XSS yang membuatnya exploitable pada audit ini.

## Batas verifikasi security

- Production Supabase, konfigurasi Auth hosted (rate limit, signup, password policy), secret Vercel, dan header deployment aktual tidak disentuh karena audit ini read-only dan tidak memiliki persetujuan exact-target untuk remote.
- `gitleaks`, `trufflehog`, `semgrep`, dan `osv-scanner` tidak tersedia; fallback regex dan pembacaan alur bukan pengganti entropy scan atau taint analysis.
- Tidak dilakukan penetration test, fuzzing request, atau simulasi abuse/rate-limit terhadap production.
