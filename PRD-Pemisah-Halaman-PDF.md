# Product Requirements Document (PRD)
## Web App Pemisah Halaman PDF (Berwarna vs Hitam-Putih)

**Disusun oleh:** Riski Ramadani
**Tanggal:** September 2026
**Versi:** 1.0

---

## 1. Latar Belakang

Mahasiswa tingkat akhir yang sedang menyusun skripsi sering perlu mencetak draft berulang kali untuk keperluan bimbingan atau sidang. Draft skripsi biasanya terdiri dari ratusan halaman, namun hanya sebagian kecil (puluhan halaman) yang mengandung elemen berwarna seperti gambar, grafik, atau diagram — sisanya murni teks hitam di atas putih.

Saat ini, memisahkan halaman berwarna dan tidak berwarna dilakukan secara manual satu per satu, yang memakan waktu dan rawan salah. Padahal, jika halaman dipisah dengan benar, halaman hitam-putih bisa dicetak dengan mode fotokopi (jauh lebih murah), sementara hanya halaman berwarna yang dicetak dengan mode warna. Ini berpotensi menghemat biaya cetak secara signifikan, terutama bagi mahasiswa kos yang budget-nya terbatas.

## 2. Tujuan Produk

- Menyediakan alat otomatis yang dapat memindai sebuah file PDF dan mengelompokkan halamannya menjadi dua kategori: **berwarna** dan **hitam-putih**
- Menghasilkan dua file PDF terpisah yang siap dibawa ke tempat print
- Dapat diakses publik secara online tanpa instalasi, gratis, dan mudah digunakan oleh siapa saja

## 3. Target Pengguna

- Mahasiswa tingkat akhir yang sedang mencetak draft skripsi/tugas akhir
- Mahasiswa kos dengan keterbatasan budget cetak
- Siapa pun yang perlu mencetak dokumen PDF campuran (berwarna + hitam-putih) secara hemat

## 4. User Stories

1. **Sebagai mahasiswa**, saya ingin mengunggah file PDF skripsi saya, agar sistem bisa mendeteksi halaman mana saja yang berwarna dan mana yang hitam-putih.
2. **Sebagai mahasiswa**, saya ingin mengunduh dua file PDF terpisah (berwarna dan hitam-putih), agar saya bisa langsung membawanya ke tempat print tanpa perlu memilah manual.
3. **Sebagai mahasiswa**, saya ingin melihat ringkasan sebelum mengunduh (misalnya "12 halaman berwarna, 188 halaman hitam-putih"), agar saya tahu estimasi biaya cetak.
4. **Sebagai pengguna baru**, saya ingin proses ini cepat dan tanpa perlu membuat akun, agar saya bisa langsung pakai saat mendesak.

## 5. Functional Requirements

| No | Requirement | Prioritas |
|----|-------------|-----------|
| FR-1 | Pengguna dapat mengunggah file PDF (drag & drop atau pilih file) | Must have |
| FR-2 | Sistem merender setiap halaman PDF menjadi gambar untuk dianalisis | Must have |
| FR-3 | Sistem mendeteksi apakah suatu halaman mengandung warna, berdasarkan analisis piksel (channel R, G, B) dengan toleransi threshold untuk noise scan | Must have |
| FR-4 | Sistem mengelompokkan halaman ke 2 kategori dan menyusun ulang jadi 2 file PDF baru, tanpa mengubah urutan asli tiap kategori | Must have |
| FR-5 | Pengguna dapat mengunduh kedua file hasil (PDF berwarna & PDF hitam-putih) | Must have |
| FR-6 | Sistem menampilkan ringkasan jumlah halaman per kategori sebelum/sesudah proses | Should have |
| FR-7 | Sistem menampilkan progress bar/status saat file sedang diproses (terutama untuk file besar) | Should have |
| FR-8 | Sistem menghapus file yang diunggah setelah beberapa waktu (privasi & hemat storage) | Should have |
| FR-9 | Sistem menampilkan preview thumbnail halaman yang terdeteksi berwarna vs hitam-putih | Could have |
| FR-10 | Pengguna dapat mengoreksi manual jika ada halaman yang salah kategori sebelum download final | Could have |

## 6. Non-Functional Requirements

- **Performa**: mampu memproses dokumen hingga ~300 halaman dalam waktu wajar (target < 1-2 menit tergantung resource server free-tier)
- **Batasan ukuran file**: dibatasi (misal maks 50 MB) untuk menjaga stabilitas di free-tier hosting
- **Ketersediaan**: aplikasi web dapat diakses 24/7, dengan catatan free-tier hosting bisa "tidur" saat idle dan butuh waktu bangun ~30-50 detik pada akses pertama
- **Privasi**: file yang diunggah tidak disimpan permanen, dihapus otomatis setelah diproses/dalam rentang waktu tertentu
- **Kompatibilitas**: dapat diakses dari browser desktop maupun mobile
- **Tanpa login**: tidak memerlukan pembuatan akun untuk mempercepat penggunaan

## 7. Spesifikasi Teknis (Rekomendasi)

- **Backend**: Python + FastAPI
- **Library pemrosesan PDF**: PyMuPDF (fitz) — untuk render halaman ke gambar dan ekstraksi/penyusunan ulang halaman PDF
- **Logika deteksi warna**: analisis piksel per halaman (cek deviasi antar channel RGB) dengan threshold yang dapat dikalibrasi untuk mengurangi false positive akibat noise hasil scan
- **Frontend**: halaman web sederhana (HTML/CSS/JS) untuk upload file, menampilkan progress, dan tombol download — bisa disajikan langsung dari server yang sama (tidak perlu hosting terpisah)
- **Deployment**: Render (free tier) — mendukung Python web service tanpa kartu kredit, dengan catatan sleep setelah 15 menit idle

## 8. Metrik Keberhasilan

- Akurasi deteksi halaman berwarna vs hitam-putih (target awal: >95% pada dokumen skripsi biasa)
- Waktu proses rata-rata per 100 halaman
- Jumlah pengguna unik yang memakai aplikasi (indikasi seberapa berguna untuk mahasiswa lain)
- Tidak ada laporan file pengguna yang bocor/tersimpan tanpa izin

## 9. Ruang Lingkup

**Termasuk (in-scope) untuk versi pertama (MVP):**
- Upload PDF, deteksi warna per halaman, output 2 file PDF terpisah, download

**Tidak termasuk (out-of-scope) untuk versi pertama:**
- Edit/anotasi PDF
- Login/akun pengguna & riwayat upload
- Deteksi selain warna (misal kompresi ukuran file, OCR, dll.)
- Preview & koreksi manual per halaman (masuk fase berikutnya jika dibutuhkan)

## 10. Risiko & Catatan

- Free-tier hosting bisa "tidur" saat idle → pengguna pertama setelah idle akan menunggu lebih lama; perlu dikomunikasikan di UI (misal pesan "sedang menyiapkan server, mohon tunggu")
- Dokumen hasil scan (bukan native PDF) berisiko punya noise warna meski aslinya hitam-putih → perlu threshold yang dikalibrasi dengan baik, dan idealnya diuji dengan beberapa contoh dokumen skripsi nyata
- Dokumen dengan halaman sangat banyak berisiko lambat diproses di server gratis dengan resource terbatas → perlu batasan ukuran/jumlah halaman di awal
