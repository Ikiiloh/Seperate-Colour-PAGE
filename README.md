# NoPDF — Toolkit PDF Gratis, 100% di Browser

> **Semua proses terjadi langsung di browsermu — file tidak pernah meninggalkan perangkatmu. U can test it in offline!**

Kumpulan alat PDF lengkap yang **gratis, tanpa login, tanpa server**. Dibangun dengan HTML + CSS + Vanilla JS murni menggunakan **pdf.js**, **pdf-lib**, dan **JSZip** — semuanya berjalan sepenuhnya di sisi klien (*client-side*).

Berawal dari satu fitur: memisahkan halaman berwarna vs hitam-putih untuk menghemat biaya cetak skripsi. Kini berkembang menjadi hub dengan 15+ alat PDF lengkap.

---

## 🌟 Keunggulan Utama: 100% Client-Side

Mayoritas layanan PDF online (iLovePDF, Smallpdf, dll.) mengunggah file kamu ke server mereka untuk diproses. **NoPDF tidak melakukan itu.**

| Aspek | Layanan PDF Online Biasa | NoPDF |
|---|---|---|
| **Privasi file** | File diunggah ke server pihak ketiga | ✅ File **tidak pernah meninggalkan browser** |
| **Koneksi internet** | Wajib ada & stabil | ✅ Hanya diperlukan saat muat pertama kali |
| **Kecepatan** | Bergantung kecepatan upload/download | ✅ Secepat performa CPU lokal |
| **Batas file harian** | Sering ada batas ukuran & kuota | ✅ Hanya dibatasi RAM browser (default 200 MB) |
| **Login / akun** | Sering diwajibkan | ✅ Tidak perlu sama sekali |
| **Biaya** | Fitur premium berbayar | ✅ 100% Gratis |
| **Watermark hasil** | Sering ditambahkan | ✅ Tidak ada watermark |
| **Bisa offline** | ❌ Tidak | ✅ Setelah dimuat pertama kali |
| **Build step** | — | ✅ Tidak ada, file statis murni |
| **Ketergantungan CDN** | — | ✅ Semua library disertakan lokal di `vendor/` |

### Bagaimana bisa berjalan offline?

Semua library disertakan langsung di folder `frontend/vendor/`:

- **`pdf.min.js` + `pdf.worker.min.js`** — Mozilla pdf.js untuk rendering & parsing PDF (worker berjalan di thread terpisah sehingga UI tidak *freeze*)
- **`pdf-lib.min.js`** — pdf-lib untuk membuat & memodifikasi PDF
- **`jszip.min.js`** — JSZip untuk membungkus banyak file hasil menjadi satu `.zip`
- **`fa/`** — FontAwesome ikon (lokal)

Setelah browser memuat halaman untuk pertama kali, **semua operasi bisa dilakukan tanpa koneksi internet**. Hanya Google Fonts yang opsional (sudah ada *fallback* ke font sistem).

---

## ✨ Daftar Alat (15+ Alat)

| Kelompok | Alat | Keterangan |
|---|---|---|
| **Atur & Susun** | Gabung PDF | Satukan banyak PDF, atur urutan dengan drag & drop / tombol panah |
| | Pisah PDF | Per rentang (`1-3, 5, 8-`), atau setiap *N* halaman; hasil banyak file otomatis di-ZIP |
| | Ekstrak Halaman | Pilih halaman lewat klik thumbnail atau ketik rentang |
| | Hapus Halaman | Sama seperti ekstrak, tetapi membuang halaman terpilih |
| | Atur Halaman | Susun ulang (drag & drop), putar, dan hapus halaman secara visual |
| | Putar PDF | Putar semua/sebagian halaman 90° / 180° / 270° |
| **Optimalkan** | Kompres PDF | Optimasi struktur (teks tetap bisa dipilih) atau 3 tingkat kompresi gambar |
| | PDF ke Hitam-Putih | Ubah seluruh dokumen menjadi grayscale |
| | **Pisah Warna & Hitam-Putih** | ⭐ Fitur andalan: deteksi halaman berwarna otomatis, koreksi manual, kalkulator biaya cetak, ekspor PDF terpisah / ZIP |
| **Ke PDF** | Gambar ke PDF | JPG/PNG/WEBP/GIF/BMP → PDF; ukuran A4/Letter/sesuai gambar, orientasi & margin |
| **Dari PDF** | PDF ke Gambar | JPG/PNG, pilih DPI & halaman, hasil ZIP |
| | PDF ke Teks | Ekstrak teks tertanam, salin atau unduh `.txt` |
| **Edit** | Nomor Halaman | 6 posisi, 5 format, rentang halaman, pratinjau langsung (mendukung halaman yang diputar) |
| | Watermark | Teks diagonal/horizontal/vertikal, tengah atau ubin, transparansi, pratinjau langsung |
| | Edit Metadata | Ubah atau hapus judul, penulis, dll. |

---

## 🏗️ Arsitektur

```text
frontend/                        ← Root deploy (tidak ada backend, tidak ada build step)
├── index.html                   # Shell: header, #app (mount point), footer, daftar script
├── css/
│   ├── style.css                # Tema skeuomorphic dasar
│   └── tools.css                # Beranda, grid alat, form, editor halaman, toast, dll.
├── js/
│   ├── core.js                  # Util bersama: dropzone, progress, pdf.js/pdf-lib,
│   │                            #   thumbnail lazy-load, ZIP, parser rentang halaman
│   ├── app.js                   # Hash router (#/merge, #/split, …) + halaman beranda
│   │                            #   (pencarian real-time & filter kategori)
│   └── tools/
│       ├── pages.js             # Atur / Putar / Hapus / Ekstrak (1 editor visual, 4 mode)
│       ├── merge-split.js       # Gabung & Pisah PDF
│       ├── optimize.js          # Kompres & PDF ke Hitam-Putih
│       ├── convert.js           # Gambar↔PDF, PDF→Teks
│       ├── edit.js              # Nomor halaman, watermark, metadata
│       └── colorsplit.js        # Pisah Warna (fitur andalan, ~38 KB)
└── vendor/                      # Semua library pihak ketiga (lokal, tanpa CDN)
    ├── pdf.min.js               # pdf.js (rendering)
    ├── pdf.worker.min.js        # pdf.js worker (~1 MB, jalan di Web Worker)
    ├── pdf-lib.min.js           # pdf-lib (manipulasi PDF)
    ├── jszip.min.js             # JSZip (ekspor ZIP)
    └── fa/                      # FontAwesome (ikon)
```

### Pola arsitektur penting

- **Hash Router** — `app.js` meng-handle `hashchange`. URL `#/merge`, `#/split`, dst. bisa dibookmark, dibagikan, dan dibuka langsung dari `file://` maupun hosting statis mana pun.
- **`SP.register()`** — Setiap alat mendaftarkan diri lewat satu API terpusat. Menambah alat baru tidak memerlukan perubahan pada `app.js` maupun `core.js`.
- **Web Worker** — `pdf.worker.min.js` berjalan di thread terpisah sehingga UI tidak *freeze* saat memproses PDF besar.
- **Lazy thumbnail** — Halaman PDF di-render sebagai thumbnail secara bertahap agar tetap responsif untuk dokumen ratusan halaman.

---

## ➕ Cara Menambah Alat Baru

1. Buat `frontend/js/tools/nama.js`:

```js
SP.register({
  id: 'nama',
  category: 'edit',           // organize | optimize | to-pdf | from-pdf | edit
  icon: 'fa-star',
  hue: 'blue',                // blue | orange | green | violet | cyan | gold
  title: 'Nama Alat',
  desc: 'Deskripsi singkat.',
  keywords: 'kata kunci pencarian',
  mount(root, ctx) {
    SP.singlePdf(root, ctx, {
      start(doc, stage) {     // doc = { file, buffer, pdf (pdf.js), numPages }
        const action = SP.actionBar({ label: 'Proses', onClick: async () => {
          const out = await SP.run('Memproses...', async (progress) => {
            /* manipulasi PDF dengan pdf-lib di sini */
          });
          if (out) {
            stage.innerHTML = '';
            stage.appendChild(SP.resultCard({
              blob: SP.pdfBlob(out),
              filename: 'hasil.pdf',
              onAgain: ctx.reset,
            }));
          }
        }});
        stage.appendChild(action.el);
      },
    });
  },
});
```

2. Tambahkan `<script src="./js/tools/nama.js"></script>` di `index.html` **sebelum** `app.js`.

> Tidak perlu mengubah `app.js` atau `core.js` — alat langsung muncul di beranda dan bisa dicari.

---

## 🚀 Menjalankan Secara Lokal

```bash
cd frontend
python -m http.server 3000      # atau: npx serve .
```

Buka `http://localhost:3000`. Membuka `index.html` langsung lewat `file://` **juga berfungsi** karena semua resource bersifat relatif dan tidak ada server-side logic.

### Deploy ke Hosting Statis

Arahkan root deploy ke folder `frontend/`. **Tidak ada langkah build.**

| Platform | Konfigurasi |
|---|---|
| **Vercel** | `vercel.json` sudah disertakan (rewrite `/*` → `/index.html`) |
| **Netlify** | Tambahkan `_redirects`: `/* /index.html 200` |
| **GitHub Pages** | Push folder `frontend/` ke branch `gh-pages` |
| **Cloudflare Pages** | Build command kosong, output dir: `frontend` |

---

## ⚠️ Batasan yang Perlu Diketahui

- **PDF berpassword** — Tidak bisa diproses (muncul pesan jelas). Fitur proteksi/buka-proteksi belum ada karena `pdf-lib` tidak mendukung enkripsi.
- **Kompres Ringan/Sedang/Maksimal & PDF ke Hitam-Putih** — Mengubah halaman menjadi gambar; teks tidak bisa dipilih lagi. Mode *"Optimasi Struktur"* mempertahankan teks, tapi penghematannya lebih kecil.
- **Watermark & Nomor Halaman** — Menggunakan font standar PDF (Helvetica): hanya mendukung huruf Latin, angka, dan tanda baca umum.
- **Konversi Word/Excel/PPT ↔ PDF & OCR** — Tidak termasuk (terlalu berat untuk berjalan di browser).
- **Ukuran file** — Default maksimum 200 MB per file (`SP.MAX_MB` di `core.js`); dokumen sangat besar dibatasi oleh RAM browser.

---

## 🗺️ Ide Pengembangan Selanjutnya

- [ ] OCR (tesseract.js)
- [ ] Tanda tangan & sisipan gambar di PDF
- [ ] Crop / potong area halaman
- [ ] Proteksi password (qpdf-wasm)
- [ ] PWA / Service Worker agar bisa diinstall & fully offline
- [ ] Mode terang (light theme)
- [ ] Kompres yang mempertahankan teks (rekompres gambar tertanam saja)
