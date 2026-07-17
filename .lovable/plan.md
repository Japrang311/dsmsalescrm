## Tambah grafik Target YTD vs Achievement YTD

### Konteks
Dashboard (`src/routes/index.tsx`) sudah punya chart bulanan (Monthly Achievement vs Target). Belum ada visual kumulatif YTD yang membandingkan pencapaian terhadap target secara akumulatif.

### Perubahan
Tambahkan satu chart baru **"Target YTD vs Achievement YTD"** di `src/routes/index.tsx`:

- Tipe: composed/area+line kumulatif per bulan (Jan → Jul 2026).
- Data: akumulasi bulanan dari `monthlyTargets`:
  - `Target YTD` = kumulatif `target`
  - `Achievement YTD` = kumulatif `achievement`
  - Scaling role-aware (sales × 0.25) mengikuti pola `trendData` yang sudah ada.
- Nilai ditampilkan dalam Rp Juta, tooltip pakai `formatIDR`.
- Sertakan label ringkas di header: `Achievement YTD {formatIDR(ytdAch)} / Target YTD {formatIDR(ytdTgt)}` + persentase pencapaian.

### Layout
Sisipkan sebagai baris chart baru **di atas** baris "Monthly Achievement vs Target" + "PPN Breakdown":

```text
[ KPI row ]
[ Secondary KPI row ]
[ Target YTD vs Achievement YTD  (full width, lg:col-span-3) ]   ← baru
[ Monthly Bar (2/3)   |  PPN Pie (1/3) ]
[ Tasks/Team | Top Customers | Pipeline ]
```

Card full-width supaya tren kumulatif jelas terbaca.

### Detail teknis
- Pakai `AreaChart` (recharts, sudah dipakai di file lain) atau `ComposedChart`. Rekomendasi: `AreaChart` dengan 2 Area — `Target YTD` warna muted, `Achievement YTD` warna primary, `stackId` tidak dipakai (overlay).
- Tambah import `AreaChart`, `Area` dari `recharts`.
- Data baru:
  ```ts
  let cumT = 0, cumA = 0;
  const ytdData = monthlyTargets.map((m) => {
    const t = role === "sales" ? m.target * 0.25 : m.target;
    const a = role === "sales" ? m.achievement * 0.25 : m.achievement;
    cumT += t; cumA += a;
    return { month: m.month.slice(5),
             "Target YTD": Math.round(cumT / 1_000_000),
             "Achievement YTD": Math.round(cumA / 1_000_000) };
  });
  ```
- Grid & styling ikuti pattern chart existing (CartesianGrid, XAxis/YAxis pakai `var(--color-muted-foreground)`, tooltip pakai `var(--color-card)`).

### File yang disentuh
- `src/routes/index.tsx` — tambah imports recharts, hitung `ytdData`, render Card baru.

Tidak ada perubahan data mock atau file lain.
