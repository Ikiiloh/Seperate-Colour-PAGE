# Product Requirements Document (PRD)
## Web App Pemisah Halaman PDF (Berwarna vs Hitam-Putih)

**Disusun oleh:** Riski Ramadani  
**Tanggal Terakhir Diperbarui:** Oktober 2026  
**Versi:** 2.0 (Client-Side Architecture)  
**Status:** Implemented / Production Ready  

---

## 1. Latar Belakang

Mahasiswa tingkat akhir yang sedang menyusun skripsi sering perlu mencetak draft berulang kali untuk keperluan bimbingan atau sidang. Draft skripsi biasanya terdiri dari ratusan halaman, namun hanya sebagian kecil (puluhan halaman) yang mengandung elemen berwarna seperti gambar, grafik, peta, logo, atau diagram — sisanya murni teks hitam di atas putih.

Saat ini, memisahkan halaman berwarna dan tidak berwarna sering dilakukan secara manual satu per satu, yang memakan waktu dan rawan salah hitung. Padahal, jika halaman dipisah dengan benar, halaman hitam-putih bisa dicetak dengan mode monokrom/fotokopi (jauh lebih murah, misal Rp 250/lembar), sementara hanya halaman berwarna yang dicetak dengan tarif warna (misal Rp 1.000 – Rp 2.500/lembar). Ini menghemat biaya cetak secara signifikan.

Untuk mengatasi hal tersebut tanpa ketergantungan server backend atau biaya langganan cloud hosting, aplikasi ini dibangun dengan **arsitektur 100% Client-Side**, di mana seluruh proses scanning piksel, pembuatan thumbnail, koreksi kategori, hingga pembagian file PDF dilakukan langsung di dalam memori browser pengguna.

---

## 2. Tujuan Produk

- Menyediakan alat otomatis berbasis web yang dapat memindai file PDF dan mengelompokkan halamannya menjadi dua kategori: **berwarna** (*color*) dan **hitam-putih** (*black & white*).
- Menghasilkan dua file PDF terpisah atau satu paket arsip ZIP yang siap dibawa ke tempat print/percetakan.
- Menyediakan kalkulator estimasi penghematan biaya cetak secara *real-time*.
- **Zero-Server / Serverless**: 100% privasi terjaga (file dokumen tidak pernah keluar dari perangkat pengguna), instan tanpa antrean server, dan bebas biaya operasional hosting.
- Dapat diakses publik secara online tanpa instalasi, tanpa registrasi/login, dan responsif di berbagai perangkat.

---

## 3. Target Pengguna

- Mahasiswa tingkat akhir yang sedang mencetak draft skripsi, tesis, atau tugas akhir.
- Dosen, peneliti, dan akademisi yang mencetak artikel jurnal/buku.
- Mahasiswa kos dengan keterbatasan budget cetak.
- Siapa pun yang perlu mencetak dokumen PDF campuran (berwarna + hitam-putih) secara hemat dan efisien.

---

## 4. User Stories

1. **Sebagai mahasiswa**, saya ingin mengunggah file PDF skripsi saya dengan mudah (drag-and-drop), agar sistem otomatis mendeteksi halaman mana yang berwarna dan mana yang hitam-putih.
2. **Sebagai pengguna**, saya ingin file PDF saya aman dan tidak diunggah ke server orang lain untuk menjaga kerahasiaan dokumen tugas akhir saya.
3. **Sebagai pengguna**, saya ingin melihat galeri thumbnail setiap halaman dengan persentase warnanya dan bisa mengubah kategorinya hanya dengan satu klik bila ada salah deteksi.
4. **Sebagai pengguna**, saya ingin melihat pratinjau halaman resolusi tinggi (modal preview) dengan navigasi keyboard agar yakin sebelum mencetak.
5. **Sebagai mahasiswa**, saya ingin melihat estimasi biaya cetak dan berapa rupiah yang berhasil saya hemat dengan memisahkan halaman tersebut.
6. **Sebagai pengguna**, saya ingin mengunduh PDF Berwarna, PDF Hitam-Putih, atau langsung keduanya dalam satu paket ZIP.

---

## 5. Functional Requirements

| No | Requirement | Keterangan / Spesifikasi | Prioritas | Status |
|---|---|---|---|---|
| **FR-1** | Unggah File PDF | Drag & drop atau browse file dengan validasi format `.pdf` dan batas wajar (hingga 50 MB) | Must have | Selesai |
| **FR-2** | Rendering Halaman di Browser | Merender setiap halaman PDF menjadi viewport canvas menggunakan **PDF.js** | Must have | Selesai |
| **FR-3** | Analisis Piksel Warna Otomatis | Deteksi deviasi channel RGB ($|R-G|$, $|G-B|$, $|B-R|$) dengan pengabaian background kertas putih dan tinta teks hitam | Must have | Selesai |
| **FR-4** | Pengaturan Sensitivitas (Threshold) | Slider threshold interaktif untuk mengakomodasi dokumen hasil scan yang memiliki noise | Must have | Selesai |
| **FR-5** | Galeri Thumbnail Interaktif | Menampilkan thumbnail seluruh halaman, nomor halaman, persentase warna, dan badge kategori | Must have | Selesai |
| **FR-6** | Koreksi Manual Satu-Klik | Tombol toggle kategori per halaman (Warna $\leftrightarrow$ B/W) yang langsung memperbarui statistik | Must have | Selesai |
| **FR-7** | High-Resolution Modal Preview | Modal preview resolusi tinggi saat kartu halaman diklik, lengkap dengan navigasi keyboard ($\leftarrow$, $\rightarrow$, `Esc`) | Must have | Selesai |
| **FR-8** | Filter Tampilan & Batch Action | Tab filter (Semua, Berwarna, Hitam-Putih) serta aksi massal (*Tandai Semua Warna*, *Tandai Semua B/W*, *Reset*) | Must have | Selesai |
| **FR-9** | Kalkulator Estimasi Biaya | Perhitungan biaya total cetak warna vs biaya pisah halaman dengan input tarif yang dapat diubah dan output format Rupiah | Must have | Selesai |
| **FR-10** | Pemisahan Dokumen PDF di Browser | Menggunakan **pdf-lib** untuk mengekstrak dan menggabungkan halaman sesuai kategori final tanpa mengubah urutan kronologis | Must have | Selesai |
| **FR-11** | Unduh PDF & Bundel ZIP | Opsi download file `Dokumen_Berwarna.pdf`, `Dokumen_Hitam_Putih.pdf`, atau `Paket_Cetak_PDF.zip` (via **JSZip**) | Must have | Selesai |
| **FR-12** | Progress Bar Dinamis | Indikator visual persentase dan status pembacaan halaman selama proses pemindaian | Must have | Selesai |

---

## 6. Non-Functional Requirements

- **Arsitektur (Client-Side Only)**: Tidak membutuhkan server backend (Python/Node backend tidak diperlukan).
- **Privasi & Keamanan**: Dokumen 100% diproses di memori lokal browser pengguna (Zero Data Upload).
- **Ketersediaan (Uptime)**: 100% ketersediaan hosting statis tanpa kendala *cold start* / *server sleep*.
- **Performa**: Mampu memproses puluhan hingga ratusan halaman dengan efisien, dengan pembersihan memori canvas setelah pemrosesan tiap halaman.
- **Kompatibilitas**: Berjalan mulus di seluruh modern desktop & mobile browser (Chrome, Edge, Firefox, Safari, Brave).
- **Aksesibilitas & Tanpa Login**: Siap pakai secara instan tanpa perlu registrasi atau akun pengguna.

---

## 7. Spesifikasi Teknis

- **Struktur Aplikasi**: Single Page Application (SPA) Statis
- **Bahasa & UI**: HTML5, Modern Skeuomorphic CSS, Vanilla JavaScript (ES6+)
- **Library Rendering PDF**: [PDF.js](https://mozilla.github.io/pdf.js/) (v3.11.174) — render canvas & ekstraksi piksel warna
- **Library Manipulasi PDF**: [pdf-lib](https://pdf-lib.js.org/) (v1.17.1) — pembuatan dan pemisahan dokumen PDF di browser
- **Library Kompresi Arsip**: [JSZip](https://stuk.github.io/jszip/) (v3.10.1) — pembuatan bundel ZIP di sisi klien
- **Aset & Tipografi**: Google Fonts (*Plus Jakarta Sans*, *Rajdhani*), FontAwesome 6
- **Hosting / Deployment Target**: Vercel (disertai `vercel.json`), Netlify, GitHub Pages, atau Cloudflare Pages

---

## 8. Metrik Keberhasilan

- **Tingkat Privasi**: 0 byte dokumen yang dikirim ke server luar.
- **Akurasi Deteksi**: >95% pada dokumen skripsi standar berbasis teks & gambar digital.
- **Kecepatan**: Pemrosesan dokumen berlangsung dalam hitungan detik tergantung spesifikasi perangkat dan jumlah halaman.
- **Kemudahan Penggunaan**: Pengguna dapat menyelesaikan alur pemisahan dan unduh dalam kurang dari 3 langkah mudah.

---

## 9. Penanganan Risiko

| Risiko Potensial | Strategi Mitigasi |
|---|---|
| **Noise pada Dokumen Hasil Scan** | Pengguna dapat menyesuaikan nilai slider threshold (misal: 25–35) untuk menyaring noise warna kertas kekuningan. |
| **Konsumsi RAM pada PDF Sangat Tebal** | Implementasi pembersihan memori secara berkala (me-reset dimensi canvas temporary setelah ekstraksi ImageData selesai). |
| **Ketergantungan CDN Library** | Menggunakan CDN publik berkecepatan tinggi dan terpercaya (Cloudflare cdnjs / unpkg) dengan versi library yang terkunci (*fixed version*). |

