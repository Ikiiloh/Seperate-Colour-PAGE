# NoPDF — Toolkit PDF & Dokumen, 100% di Browser

> **Semua proses berjalan di browsermu — file tidak pernah diunggah ke server mana pun.**

NoPDF adalah kumpulan 21 alat PDF dan dokumen yang seluruhnya berjalan di sisi klien
(*client-side*). Dibangun tanpa backend, tanpa database, tanpa login, dan tanpa proses
build: hanya HTML, CSS, dan JavaScript murni dengan beberapa library lokal di
`frontend/vendor/`.

Setelah halaman dimuat sekali, semua alat dapat dipakai **offline** berkat Service
Worker. Hasil konversi tidak diberi watermark dan tidak ada batas pemakaian harian —
satu-satunya batas adalah ukuran file (default 200 MB) dan RAM browser.

---

## 1. Prinsip Sistem

| Aspek | Cara kerja NoPDF |
|---|---|
| **Privasi** | File dibaca langsung dari disk oleh browser (File API) dan diproses di memori. Tidak ada upload |
| **Server** | Tidak ada. Deploy cukup hosting statis |
| **Login / kuota** | Tidak ada akun, tidak ada batas harian |
| **Offline** | Service Worker menyimpan seluruh aset; alat tetap jalan tanpa internet |
| **Build step** | Tidak ada — folder `frontend/` siap deploy apa adanya |
| **Dependensi CDN** | Tidak ada — semua library disertakan lokal di `vendor/` |
| **Watermark** | Tidak ada |

Semua manipulasi PDF dilakukan dengan **pdf-lib**, pembacaan/rendering dengan
**pdf.js**, dan pengemasan hasil banyak file dengan **JSZip**.

---

## 2. Daftar Alat (21 Alat)

| Kelompok | Alat | Fungsi |
|---|---|---|
| **Atur & Susun** | Gabung PDF | Satukan banyak PDF dengan urutan drag & drop |
| | Pisah PDF | Pisah per rentang (`1-3, 5, 8-`) atau setiap *N* halaman; hasil di-ZIP |
| | Ekstrak Halaman | Ambil halaman tertentu menjadi PDF baru |
| | Hapus Halaman | Buang halaman terpilih |
| | Atur Halaman | Susun ulang, putar, dan hapus halaman secara visual |
| | Putar PDF | Putar semua/sebagian halaman 90°, 180°, atau 270° |
| **Optimalkan** | Kompres PDF | Optimasi struktur (teks tetap bisa dipilih) atau kompresi gambar bertingkat |
| | PDF ke Hitam-Putih | Ubah dokumen menjadi grayscale |
| | Pisah Warna & Hitam-Putih | Deteksi halaman berwarna otomatis, koreksi manual, kalkulator biaya cetak, ekspor PDF terpisah/ZIP |
| **Ke PDF** | Gambar ke PDF | JPG/PNG/WEBP/GIF/BMP → PDF; ukuran A4/Letter/otomatis, orientasi & margin |
| | Word ke PDF | `.docx` dirender dengan tata letak asli (tabel, gambar, header/footer) lalu dijadikan PDF |
| | Excel ke PDF | `.xlsx/.xls/.csv` dirender per sheet menjadi PDF tabel |
| | PowerPoint ke PDF | `.pptx` dirender slide-per-slide (teks, gambar, tabel, shape) menjadi PDF |
| **Dari PDF** | PDF ke Word | PDF → `.docx` yang dapat diedit dengan rekonstruksi paragraf, tabel, header/footer |
| | PDF ke Gambar | Setiap halaman → JPG/PNG, pilih DPI & rentang halaman |
| | PDF ke Teks | Ekstrak teks tertanam, salin atau unduh `.txt` |
| **Edit** | Edit Teks PDF | Klik teks mana pun untuk mengubah isi, ukuran, warna, atau menghapusnya |
| | Tanda Tangani PDF | Gambar/ketik/unggah tanda tangan, atur posisi & ukuran, ekspor PDF |
| | Nomor Halaman | 6 posisi, 5 format, rentang halaman, pratinjau langsung |
| | Watermark | Teks diagonal/horizontal/vertikal, tengah atau ubin, transparansi |
| | Edit Metadata | Ubah atau hapus judul, penulis, subject, keywords, dll. |

---

## 3. Arsitektur

### 3.1 Hash router dan registrasi alat

- `js/app.js` menangani `hashchange`. Setiap alat punya URL sendiri
  (`#/merge`, `#/sign`, `#/editteks`, …) sehingga bisa di-bookmark dan dibuka
  langsung, termasuk dari `file://`.
- Setiap file alat memanggil **`SP.register()`** satu kali. Beranda, pencarian, dan
  halaman detail dibangun otomatis dari daftar tersebut — menambah alat baru tidak
  memerlukan perubahan pada `app.js`.
- `core.js` menyediakan komponen bersama: `SP.singlePdf` / `SP.multiPdf`,
  `SP.dropzone`, `SP.actionBar`, `SP.resultCard`, `SP.run` (progress + error),
  `SP.download`, `SP.parseRanges`, `SP.pageGeometry`, dan helper kanvas/PDF lainnya.

### 3.2 Rendering dan performa

- `pdf.worker.min.js` berjalan di Web Worker terpisah, sehingga UI tidak macet saat
  merender dokumen besar.
- Thumbnail dan pratinjau halaman dirender **lazy** dengan `IntersectionObserver`.
- Canvas memakai DPR yang dibatasi (maks. 2) agar tajam tanpa memakan memori
  berlebihan.
- File masukan divalidasi di awal (tipe, ukuran, dan PDF yang terenkripsi) dengan
  pesan error yang jelas.

### 3.3 Offline dan Service Worker

`sw.js` memakai strategi **network-first**: selalu mengambil versi terbaru saat
online, lalu menyimpan salinannya ke cache dan memakainya saat offline.

Saat mengubah aset, lakukan dua hal agar pengguna tidak menerima file lama:

1. Naikkan `CACHE_NAME` di `sw.js` (saat ini `nopdf-cache-v23`).
2. Naikkan query cache-busting stylesheet di `index.html` dan `sw.js`
   (saat ini `tools.css?v=23`), lalu reload dengan `Ctrl+F5`.

### 3.4 Alur pemrosesan per jenis fitur

**Manipulasi dokumen (pdf-lib).**
Gabung, pisah, ekstrak, hapus, putar, atur halaman, nomor halaman, watermark, dan
metadata dilakukan langsung pada struktur PDF, sehingga teks asli tetap utuh dan
bisa dipilih.

**Konversi dari PDF (pdf.js).**
PDF ke Gambar merender halaman ke canvas pada DPI pilihan. PDF ke Teks memakai
lapisan teks pdf.js tanpa mengubah dokumen sumber.

**Editor teks PDF (`js/tools/pdfedit/`).**
`textlayer.js` membangun lapisan teks interaktif dari pdf.js dan memuat **font
tertanam asli** dokumen. Saat teks diubah, baris lama ditutup dengan warna latar
aslinya dan baris baru dirender beresolusi tinggi memakai font yang sama, lalu
ditempel dengan pdf-lib. Posisi bersifat bebas (geser + perataan), ukuran tidak
mengecil otomatis, perubahan otomatis diterapkan saat pindah teks, dan tersedia
undo/redo.

**PDF ke Word (`js/tools/pdf2docx/`).**
Dipisah menjadi empat modul: ekstraksi (teks, warna, path vektor, deteksi tabel
berbasis garis border), layout (paragraf, alignment, kolom, header/footer
berulang), penulis OOXML, dan UI alat. Halaman yang tidak memiliki teks tertanam
(scanned) tetap disertakan sebagai gambar di dalam dokumen Word.

**Dokumen Office ke PDF (`office.js`, `pptx2pdf.js`).**
Word dan Excel dirender ke DOM beresolusi tinggi (docx-preview + SheetJS) lalu
dipetakan ke halaman A4 memakai html2canvas. PowerPoint memakai parser OOXML
sendiri untuk menggambar slide di canvas, termasuk teks, gambar, tabel, dan shape.
File `.pptx` yang rusak atau terkunci password menghasilkan pesan yang mudah
dipahami.

**Tanda tangan PDF (`signpdf.js`).**
Tanda tangan dibuat lewat tiga mode: gambar di kanvas, ketik dengan font script,
atau unggah gambar. Hasilnya dipangkas otomatis (*trim*) menjadi PNG transparan;
untuk hasil scan/foto tersedia opsi hapus latar putih. Stempel bisa digeser dan
diubah ukurannya di pratinjau, diterapkan ke semua halaman atau rentang tertentu,
dan penempatannya sudah memperhitungkan rotasi halaman (`/Rotate` 0/90/180/270).
Ini adalah tanda tangan visual, bukan sertifikat digital.

---

## 4. Struktur Folder

```text
frontend/                     ← root deploy (tanpa backend)
├── index.html                # shell aplikasi + urutan pemuatan script
├── sw.js                     # Service Worker (cache offline)
├── vercel.json               # rewrite SPA untuk Vercel
├── css/
│   ├── style.css             # tema skeuomorphic, layout, komponen dasar
│   └── tools.css             # gaya per-alat (termasuk .pdfed dan .sign-*)
├── js/
│   ├── core.js               # helper bersama & SP.* API
│   ├── app.js                # hash router, beranda, pencarian
│   └── tools/
│       ├── pages.js          # gabung, pisah, ekstrak, hapus, atur, putar
│       ├── optimize.js       # kompres, grayscale
│       ├── convert.js        # gambar↔PDF, PDF→teks/gambar
│       ├── edit.js           # nomor halaman, watermark, metadata
│       ├── colorsplit.js     # pisah warna (fitur andalan)
│       ├── office.js         # Word & Excel → PDF
│       ├── pptx2pdf.js       # PowerPoint → PDF
│       ├── signpdf.js        # tanda tangan PDF
│       ├── pdf2docx/         # PDF → Word (extract, layout, docx, UI)
│       └── pdfedit/          # editor teks PDF (textlayer + UI)
└── vendor/                   # semua library pihak ketiga (lokal)
    ├── pdf.min.js            # pdf.js — rendering & parsing
    ├── pdf.worker.min.js     # worker pdf.js
    ├── pdf-lib.min.js        # menulis & memodifikasi PDF
    ├── jszip.min.js          # ZIP hasil multi-file
    ├── docx-preview.min.js   # render .docx
    ├── mammoth.browser.min.js# konversi .docx → HTML
    ├── xlsx.full.min.js      # SheetJS untuk Excel
    ├── html2canvas.min.js    # DOM → canvas
    └── fa/                   # FontAwesome lokal
```

---

## 5. Menjalankan Secara Lokal

```bash
cd frontend
python -m http.server 3000
# atau: npx serve .
```

Buka `http://localhost:3000`. Membuka `index.html` langsung dengan `file://` juga
berfungsi karena seluruh path bersifat relatif dan tidak ada logika server.

Setelah perubahan kode, lakukan **hard reload** (`Ctrl+F5`) sekali agar Service
Worker baru aktif.

### Deploy

Arahkan root deploy ke folder `frontend/`.

| Platform | Konfigurasi |
|---|---|
| **Vercel** | `vercel.json` sudah disertakan (rewrite `/*` → `/index.html`) |
| **Netlify** | Tambahkan `_redirects`: `/* /index.html 200` |
| **GitHub Pages** | Push isi `frontend/` ke branch `gh-pages` |
| **Cloudflare Pages** | Build command kosong, output directory `frontend` |

---

## 6. Menambah Alat Baru

1. Buat file di `frontend/js/tools/` dan daftarkan lewat `SP.register()`:

```js
SP.register({
  id: 'nama',
  category: 'edit',            // organize | optimize | to-pdf | from-pdf | edit
  icon: 'fa-star',
  hue: 'blue',                 // blue | orange | green | violet | cyan | gold
  title: 'Nama Alat',
  desc: 'Deskripsi singkat.',
  keywords: 'kata kunci pencarian',
  mount(root, ctx) {
    SP.singlePdf(root, ctx, {
      start(doc, stage) {      // doc = { file, buffer, pdf (pdf.js), numPages }
        const action = SP.actionBar({
          label: 'Proses',
          onClick: async () => {
            const out = await SP.run('Memproses...', async () => {
              /* olah PDF dengan pdf-lib di sini */
            });
            if (!out) return;
            stage.innerHTML = '';
            stage.appendChild(SP.resultCard({
              blob: SP.pdfBlob(out),
              filename: 'hasil.pdf',
              onAgain: ctx.reset,
            }));
          },
        });
        stage.appendChild(action.el);
      },
    });
  },
});
```

2. Tambahkan `<script src="./js/tools/nama.js"></script>` di `index.html`
   **sebelum** `app.js`.
3. Tambahkan file yang sama ke `ASSETS_TO_CACHE` di `sw.js` dan naikkan
   `CACHE_NAME`.

Alat akan otomatis muncul di beranda dan ikut dalam pencarian.

---

## 7. Batasan yang Diketahui

- **PDF terenkripsi/password** belum didukung (`pdf-lib` tidak menangani
  enkripsi); pengguna mendapat pesan yang jelas.
- **Tidak ada OCR.** PDF hasil scan tidak bisa diekstrak teksnya; PDF ke Word
  menyertakan halaman scan sebagai gambar, dan PDF ke Teks mengembalikan kosong.
- **Teks yang diedit dirender sebagai gambar** beresolusi tinggi agar font asli
  tampil identik; baris yang diubah karena itu tidak lagi bisa dipilih sebagai teks.
- **Konversi Word/Excel/PowerPoint berbasis rendering.** Tata letak umum, tabel,
  gambar, dan teks dipertahankan, tetapi fitur kompleks (animasi, SmartArt
  tertentu, formula Excel yang belum dihitung) tidak direplikasi sempurna.
- **Nomor halaman & watermark** memakai font standar PDF (Helvetica): hanya huruf
  Latin, angka, dan tanda baca umum.
- **Kompresi gambar & PDF ke Hitam-Putih** merasterisasi halaman; gunakan mode
  "Optimasi Struktur" bila teks harus tetap bisa dipilih.
- **Batas ukuran** 200 MB per file (`SP.MAX_MB` di `core.js`), selebihnya
  bergantung pada RAM perangkat.
- **Tanda tangan** bersifat visual, bukan tanda tangan digital tersertifikasi.

---

## 8. Rencana Pengembangan

- [ ] OCR untuk PDF hasil scan (tesseract.js)
- [ ] Crop / potong area halaman
- [ ] Buka & proteksi password (qpdf-wasm)
- [ ] Mode terang (light theme)
- [ ] Kompres yang mempertahankan teks (rekompresi gambar tertanam)
