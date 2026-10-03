# SeparaPDF — Pemisah Halaman PDF Berwarna vs Hitam-Putih

Aplikasi web **100% Client-Side** (*Serverless*) untuk memisahkan halaman **Berwarna** (*Color*) dan **Hitam-Putih** (*Black & White*) dari dokumen PDF secara otomatis, instan, dan presisi. Dirancang khusus untuk membantu mahasiswa, akademisi, dan profesional menekan biaya cetak dokumen tebal seperti skripsi, tesis, makalah, hingga laporan kerja.

---

## 📌 Latar Belakang Masalah

Dokumen skripsi atau laporan akademik umumnya terdiri dari puluhan hingga ratusan halaman. Namun, biasanya hanya sebagian kecil halaman yang memuat elemen berwarna (seperti diagram grafik, peta, logo, atau foto dokumentasi).

Bila seluruh halaman dicetak dengan tarif *full-color* (biasanya Rp 1.000 – Rp 2.500/lembar), total pengeluaran menjadi sangat mahal. Sementara itu, memilah halaman secara manual memakan waktu dan rentan salah catat.

**SeparaPDF** mengotomatisasi pemilahan halaman dalam hitungan detik langsung di browser Anda. Anda akan mendapatkan dua file PDF terpisah yang siap dicetak di percetakan (*copy center*) tanpa biaya server dan tanpa risiko kebocoran data.

---

## 🔒 Keunggulan Arsitektur Client-Side

- 🛡️ **100% Privasi Terjaga**: Dokumen PDF diproses seutuhnya di memori browser perangkat Anda. Dokumen **tidak pernah diunggah** ke server pihak ketiga mana pun.
- ⚡ **Instan & Tanpa Antrean**: Tidak ada latensi upload/download ke backend. Pemrosesan langsung memanfaatkan komputasi perangkat Anda.
- 💸 **Nol Biaya Operasional (Zero Hosting/Server Cost)**: Aplikasi bersifat statis murni sehingga dapat di-host secara gratis di platform seperti Vercel, Netlify, atau GitHub Pages selamanya.
- 🌐 **Dapat Digunakan Offline**: Setelah aset web termuat, aplikasi dapat terus bekerja memproses PDF tanpa koneksi internet aktif.

---

## ✨ Fitur Utama

- 🎨 **Deteksi Piksel Warna Cerdas**:
  - Menganalisis deviasi channel warna RGB ($|R-G|$, $|G-B|$, $|B-R|$) per halaman dengan engine **PDF.js**.
  - Otomatis mengabaikan background putih kertas (*paper background*) dan tinta teks hitam (*deep black ink*).
  - Dilengkapi *slider* pengaturan sensitivitas (*threshold*) untuk mengatasi *noise* pada dokumen hasil *scan*.
- 🖼️ **Galeri Thumbnail Interaktif**:
  - Pratinjau thumbnail setiap halaman lengkap dengan badge kategori dan skor persentase warna.
  - **One-Click Toggle**: Ubah kategori halaman (Warna $\leftrightarrow$ Hitam-Putih) hanya dengan satu klik jika ada halaman yang ingin disesuaikan.
- 🔍 **High-Resolution Modal Preview**:
  - Klik halaman manapun untuk membuka tampilan resolusi tinggi.
  - Navigasi keyboard yang nyaman: tombol $\leftarrow$ / $\rightarrow$ untuk berpindah halaman dan `Esc` untuk menutup.
- 🏷️ **Aksi Cepat & Filter Halaman**:
  - Filter tampilan: **Semua**, **Berwarna**, atau **Hitam-Putih**.
  - Aksi massal: *Tandai Semua Berwarna*, *Tandai Semua Hitam-Putih*, atau *Reset ke Deteksi Awal*.
- 💰 **Kalkulator Penghematan Biaya Cetak**:
  - Input tarif cetak warna & hitam-putih per lembar sesuai harga tempat cetak langganan Anda.
  - Kalkulasi otomatis total biaya cetak biasa vs biaya cetak pisah beserta nominal dan persentase penghematan (*Savings Tracker*).
- 📦 **Pilihan Ekspor Fleksibel**:
  - Unduh **PDF Berwarna** saja.
  - Unduh **PDF Hitam-Putih** saja.
  - Unduh bundel **ZIP (Paket Cetak)** yang berisi kedua file PDF sekaligus (menggunakan **JSZip** & **pdf-lib**).
- 📱 **Desain Modern Skeuomorphic**:
  - Antarmuka taktikal modern bernuansa *dark slate* dengan kontras tinggi, visual *embossed*, dan responsif di berbagai ukuran layar.

---

## 🛠️ Tumpukan Teknologi (Tech Stack)

| Komponen | Teknologi | Keterangan |
|---|---|---|
| **Core Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) | Ringan, cepat, tanpa overhead framework berat |
| **PDF Rendering Engine** | [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla) | Membaca struktur PDF, merender viewport canvas, dan ekstraksi piksel warna |
| **PDF Manipulation Engine** | [pdf-lib](https://pdf-lib.js.org/) | Menyusun, memilah, dan mengekspor halaman ke file PDF baru di browser |
| **Archiver** | [JSZip](https://stuk.github.io/jszip/) | Membuat file arsip ZIP secara instan di sisi klien |
| **Tipografi & Ikon** | Google Fonts (*Plus Jakarta Sans*, *Rajdhani*), FontAwesome 6 | Tampilan tipografi modern dan ikonik |
| **Hosting & Deployment** | Vercel / Netlify / GitHub Pages / Cloudflare Pages | Static web hosting berkinerja tinggi |

---

## 📁 Struktur Proyek

```text
.
├── frontend/
│   ├── css/
│   │   └── style.css     # Stylesheet tema skeuomorphic modern, grid kartu, & modal
│   ├── js/
│   │   └── app.js        # Controller utama: analisis piksel PDF.js, manipulasi pdf-lib, kalkulator
│   ├── index.html        # Halaman utama aplikasi web
│   └── vercel.json       # Konfigurasi routing static web
├── PRD-Pemisah-Halaman-PDF.md # Dokumen spesifikasi kebutuhan produk (PRD)
├── .gitignore            # Konfigurasi file yang diabaikan Git
└── README.md             # Dokumentasi utama proyek
```

---

## 🚀 Panduan Menjalankan Aplikasi

### Opsi 1: Buka Langsung di Browser
Cukup klik dua kali atau buka file `frontend/index.html` di browser modern mana pun (Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Safari).

---

### Opsi 2: Menggunakan Local Development Server

Untuk pengalaman terbaik (mengatasi kebijakan CORS lokal pada beberapa browser):

**Menggunakan Node.js / npx:**
```bash
npx serve frontend
```

**Menggunakan Python built-in server:**
```bash
cd frontend
python -m http.server 3000
```
Buka browser pada alamat: `http://localhost:3000`

**Menggunakan Ekstensi VS Code:**
- Install ekstensi **Live Server** di VS Code.
- Klik kanan pada `frontend/index.html` $\rightarrow$ pilih **"Open with Live Server"**.

---

## 🌐 Panduan Deployment ke Web Production

Aplikasi ini dapat di-deploy secara gratis ke berbagai penyedia hosting statis:

### 1. Deploy ke Vercel (Direkomendasikan)
1. Hubungkan repositori GitHub Anda ke [Vercel](https://vercel.com).
2. Di bagian **Root Directory**, pilih atau ketik folder `frontend`.
3. Klik **Deploy**. Selesai!

### 2. Deploy ke Netlify
1. Masuk ke [Netlify](https://netlify.com) $\rightarrow$ **Add new site** $\rightarrow$ **Import an existing project**.
2. Pilih repositori Anda, set **Publish directory** ke `frontend`.
3. Klik **Deploy Site**.

### 3. Deploy ke GitHub Pages
1. Masuk ke tab **Settings** di repositori GitHub Anda $\rightarrow$ **Pages**.
2. Pilih branch `main` dan folder `/ (root)` atau gunakan workflow GitHub Actions untuk mem-publish folder `frontend`.

---

## 💡 Tips Penggunaan

1. **Mengatur Sensitivitas (Threshold)**: Jika Anda memproses PDF hasil *scan* yang memiliki kertas kekuningan, buka menu *Pengaturan Sensitivitas* dan naikkan threshold ke angka **25 – 35** agar background tidak terhitung sebagai warna.
2. **Koreksi Manual Cepat**: Gunakan filter **Berwarna** untuk memeriksa halaman-halaman yang terdeteksi warna. Bila ada halaman hitam-putih yang keliru masuk, klik tombol **Ubah ke B/W**.
3. **Download Arsip**: Klik **Download Semua (.ZIP)** untuk langsung memperoleh dua file (`Dokumen_Berwarna.pdf` dan `Dokumen_Hitam_Putih.pdf`) yang siap dibawa ke tempat cetak.

---

## 📄 Lisensi

Proyek ini bersifat open-source dan bebas digunakan serta dimodifikasi untuk keperluan edukasi, non-komersial, maupun umum.

