# SeparaPDF — Pemisah Halaman PDF Berwarna vs Hitam-Putih

Aplikasi web yang memisahkan halaman berwarna dan hitam-putih dari sebuah file PDF secara otomatis. Dibuat khusus untuk membantu mahasiswa menekan biaya cetak dokumen seperti skripsi atau laporan tugas akhir.

---

## Latar Belakang

Dokumen skripsi umumnya terdiri dari ratusan halaman, namun hanya sebagian kecil yang benar-benar mengandung elemen berwarna seperti grafik, diagram, atau foto. Jika dicetak seluruhnya dengan mode warna, biayanya jauh lebih mahal dibanding mencetak halaman hitam-putih secara terpisah.

Aplikasi ini mengotomasi proses pemilahan yang biasanya dilakukan secara manual, sehingga pengguna cukup mengunggah satu file PDF dan langsung mendapatkan dua file PDF terpisah yang siap dibawa ke tempat cetak.

---

## Fitur Utama

- Upload PDF via drag-and-drop atau pilih file dari perangkat
- Analisis piksel per halaman untuk mendeteksi keberadaan warna (menggunakan deviasi channel RGB)
- Pengaturan ambang batas sensitivitas (threshold) yang dapat dikalibrasi untuk mengakomodasi noise pada dokumen hasil scan
- Tampilan ringkasan hasil: total halaman, jumlah halaman berwarna, jumlah halaman hitam-putih
- Kalkulator estimasi biaya cetak dengan tarif yang dapat disesuaikan
- Preview thumbnail setiap halaman beserta labelnya
- Koreksi manual: pengguna dapat mengubah kategori halaman yang salah terdeteksi sebelum mengunduh
- Unduh hasil sebagai PDF berwarna, PDF hitam-putih, atau keduanya sekaligus dalam satu file ZIP
- File yang diunggah dihapus otomatis dari server setelah diproses (tidak disimpan permanen)
- Tidak memerlukan akun atau login

---

## Tumpukan Teknologi

| Lapisan | Teknologi |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Pemrosesan PDF | PyMuPDF (fitz), Pillow |
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Deployment | Docker, Render (free tier) |

---

## Cara Kerja

1. Pengguna mengunggah file PDF melalui antarmuka web.
2. Backend menerima file dan menyimpannya ke direktori sesi sementara yang unik (UUID).
3. `PDFProcessor` merender setiap halaman PDF menjadi gambar, lalu menganalisis piksel untuk menentukan apakah halaman tersebut mengandung warna berdasarkan deviasi antar channel R, G, dan B terhadap nilai threshold.
4. Hasil analisis dikembalikan ke frontend beserta metadata setiap halaman.
5. Pengguna dapat meninjau hasil di UI, melakukan koreksi manual jika diperlukan, lalu memulai proses pemisahan.
6. Backend menyusun dua file PDF baru (berwarna dan hitam-putih) sesuai kategori final tanpa mengubah urutan halaman asli.
7. File hasil dapat diunduh secara individual atau sekaligus dalam format ZIP.
8. File sesi dibersihkan di background secara berkala untuk menjaga privasi dan efisiensi penyimpanan.

---

## Struktur Proyek

```
.
├── app/
│   ├── main.py           # Entri poin FastAPI, definisi semua endpoint API
│   ├── pdf_processor.py  # Logika analisis warna dan pemisahan PDF (dioptimalkan low-RAM)
│   └── cleanup.py        # Fungsi pembersihan file sesi lama
├── frontend/
│   ├── index.html        # Antarmuka pengguna (Vercel static)
│   ├── css/
│   │   └── style.css     # Stylesheet dengan tema skeuomorphic
│   ├── js/
│   │   └── app.js        # Logika frontend & API routing
│   └── vercel.json       # Konfigurasi routing Vercel
├── temp_sessions/        # Direktori sementara untuk file sesi (tidak di-commit)
├── Dockerfile            # Konfigurasi Docker untuk Koyeb backend
├── Procfile
├── requirements.txt
└── README.md
```

---

## API Endpoint

### `POST /api/analyze`

Menerima file PDF dan menjalankan analisis warna per halaman.

**Form data:**

| Field | Tipe | Keterangan |
|---|---|---|
| `file` | File | File PDF, maksimal 50 MB |
| `threshold` | Integer | Ambang batas sensitivitas deteksi warna (default: 18) |

**Response:** JSON berisi daftar halaman beserta kategori deteksi awal dan metadata sesi.

---

### `POST /api/generate`

Menerima daftar halaman beserta kategori final dari pengguna dan menghasilkan file PDF yang telah dipisah.

**Body (JSON):**

```json
{
  "session_id": "uuid-sesi",
  "pages": [
    { "page_number": 1, "category": "color" },
    { "page_number": 2, "category": "bw" }
  ],
  "color_price": 1000,
  "bw_price": 250
}
```

**Response:** JSON berisi status, jumlah halaman per kategori, dan kalkulasi estimasi biaya.

---

### `GET /api/download/{session_id}/{file_type}`

Mengunduh file hasil pemisahan. Parameter `file_type` yang valid: `color`, `bw`, atau `zip`.

---

### `GET /api/health`

Cek status server.

---

## Menjalankan Secara Lokal

**Prasyarat:** Python 3.11+

```bash
# 1. Clone repositori
git clone https://github.com/Ikiiloh/Seperate-Colour-PAGE
cd Seperate-Colour-PAGE

# 2. Buat dan aktifkan virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux

# 3. Install dependensi
pip install -r requirements.txt

# 4. Jalankan server
uvicorn app.main:app --reload

# 5. Buka di browser
# http://127.0.0.1:8000
```

---

## Menjalankan dengan Docker

```bash
docker build -t separa-pdf .
docker run -p 8000:8000 separa-pdf
```

---

## Deployment ke Render

Proyek ini siap dideploy ke [Render](https://render.com) menggunakan file `render.yaml` yang sudah tersedia. Cukup hubungkan repositori ini ke Render dan layanan akan dikonfigurasi secara otomatis.

Catatan: Pada free tier Render, server akan "tidur" setelah 15 menit tidak aktif. Akses pertama setelah idle memerlukan waktu sekitar 30-50 detik untuk server bangun kembali.

---

## Batasan

- Ukuran file maksimal: 50 MB (sekitar 300+ halaman)
- Format file yang didukung: PDF saja
- Dokumen hasil scan fisik berpotensi memiliki noise warna pada halaman hitam-putih; sesuaikan nilai threshold jika terjadi salah deteksi
- File sesi dihapus otomatis dan tidak dapat dipulihkan setelah masa berlaku sesi habis

---

## Lisensi

Proyek ini dibuat untuk keperluan pembelajaran dan penggunaan publik. Silakan gunakan, modifikasi, dan distribusikan sesuai kebutuhan.
