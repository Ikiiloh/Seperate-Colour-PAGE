# SeparaPDF — Pemisah Halaman PDF Berwarna vs Hitam-Putih

Aplikasi web modern untuk memisahkan halaman **Berwarna** (*Color*) dan **Hitam-Putih** (*Black & White*) dari dokumen PDF secara otomatis dan presisi. Dirancang khusus untuk membantu mahasiswa, akademisi, dan profesional menghemat biaya cetak dokumen tebal seperti skripsi, tesis, disertasi, makalah, hingga laporan kerja.

---

## 📌 Latar Belakang Masalah

Dokumen skripsi atau laporan akademik umumnya terdiri dari puluhan hingga ratusan halaman. Namun, biasanya hanya sebagian kecil halaman yang memuat elemen berwarna (seperti diagram, grafik, peta, logo, atau foto dokumentasi). 

Bila seluruh halaman dicetak dengan tarif *full-color* (biasanya Rp 1.000 – Rp 2.500/lembar), total pengeluaran menjadi sangat membengkak. Sementara itu, memilah halaman satu per satu secara manual memakan waktu dan rawan salah hitung.

**SeparaPDF** mengotomatisasi proses pemilahan halaman dalam hitungan detik. Pengguna cukup mengunggah file PDF dan sistem akan memisahkan dokumen menjadi dua file PDF terpisah yang siap dicetak di percetakan (*copy center*).

---

## ✨ Fitur Utama

- ⚡ **Dual Processing Architecture**:
  - **Client-Side (Default Browser)**: Pemrosesan langsung di browser pengguna menggunakan **PDF.js**, **pdf-lib**, dan **JSZip**. Cepat, hemat bandwidth, dan privasi 100% terjaga (file tidak harus keluar dari perangkat).
  - **Server-Side API (FastAPI + PyMuPDF)**: Backend API bertenaga tinggi yang dioptimalkan untuk lingkungan server low-RAM (512MB RAM).
- 🎨 **Deteksi Piksel Warna Cerdas**:
  - Menganalisis deviasi channel warna RGB ($|R-G|$, $|G-B|$, $|B-R|$).
  - Otomatis mengabaikan background putih kertas (*paper background*) dan tinta teks hitam (*deep black ink*).
  - Dilengkapi ambang batas sensitivitas (*threshold slider*) yang dapat disesuaikan untuk dokumen hasil *scan*.
- 🖼️ **Galeri Thumbnail Interaktif**:
  - Preview thumbnail setiap halaman lengkap dengan badge kategori dan persentase skor warna.
  - **One-Click Category Toggle**: Ubah kategori halaman (Warna $\leftrightarrow$ Hitam-Putih) langsung dari thumbnail jika terjadi salah deteksi.
- 🔍 **High-Resolution Modal Preview**:
  - Klik pada halaman manapun untuk membuka preview beresolusi tinggi.
  - Dilengkapi navigasi keyboard (*Arrow Left/Right* untuk ganti halaman, *Escape* untuk menutup).
- 🏷️ **Batch Action & Filter Tampilan**:
  - Filter halaman: **Semua**, **Berwarna**, atau **Hitam-Putih**.
  - Aksi massal: *Tandai Semua Berwarna*, *Tandai Semua Hitam-Putih*, atau *Reset ke Deteksi Awal*.
- 💰 **Kalkulator Estimasi Biaya Cetak**:
  - Masukkan tarif cetak per lembar warna dan hitam-putih sesuai harga percetakan langganan.
  - Menampilkan perbandingan biaya total vs biaya pisah serta persentase uang yang berhasil dihemat (*Savings Tracker*).
- 📦 **Pilihan Unduhan Fleksibel**:
  - Unduh **PDF Berwarna** saja.
  - Unduh **PDF Hitam-Putih** saja.
  - Unduh keduanya sekaligus dalam satu arsip **ZIP (Paket Cetak)**.
- 🔒 **Privasi & Keamanan**:
  - Tanpa perlu registrasi / login.
  - Pada mode backend, session file dibersihkan otomatis secara berkala via background worker.

---

## 🛠️ Tumpukan Teknologi (Tech Stack)

| Komponen | Teknologi | Keterangan |
|---|---|---|
| **Frontend UI** | HTML5, CSS3 (Modern Skeuomorphic Theme), Vanilla JavaScript (ES6+) | Tampilan modern bernuansa taktikal, responsif, dan tanpa dependensi framework berat |
| **Typography & Icons** | Google Fonts (*Plus Jakarta Sans*, *Rajdhani*), FontAwesome 6 | Tipografi modern & ikon yang informatif |
| **Client-Side PDF Engine** | PDF.js (Mozilla), pdf-lib, JSZip | Ekstraksi canvas, analisis RGB di browser, manipulasi PDF, dan kompresi ZIP |
| **Backend Framework** | Python 3.11, FastAPI, Uvicorn, Pydantic | REST API asinkron berkecepatan tinggi |
| **Server PDF Processing** | PyMuPDF (`fitz`), Pillow (PIL), NumPy | Rendering pixmap dan analisis array piksel berkecepatan tinggi (low-RAM footprint) |
| **DevOps & Deployment** | Docker, Vercel (`vercel.json`), Render (`render.yaml`), Procfile | Siap dideploy ke cloud platform modern |

---

## 📁 Struktur Proyek

```text
.
├── app/
│   ├── cleanup.py        # Worker pembersihan file sesi sementara di server
│   ├── main.py           # Endpoint REST API FastAPI & konfigurasi CORS
│   └── pdf_processor.py  # Core engine analisis piksel warna & splitting PDF (PyMuPDF)
├── frontend/
│   ├── css/
│   │   └── style.css     # Styling tema skeuomorphic modern, grid kartu, & modal
│   ├── js/
│   │   └── app.js        # Controller utama: analisis PDF.js, interaksi UI, kalkulator, pdf-lib
│   ├── index.html        # Antarmuka web aplikasi lengkap
│   └── vercel.json       # Konfigurasi routing untuk deployment Vercel
├── temp_sessions/        # Folder temporary session backend (diabaikan oleh git)
├── .dockerignore         # Daftar file/folder yang dikecualikan dari build Docker
├── .gitignore            # Daftar file/folder yang diabaikan Git
├── Dockerfile            # Blueprint container berbasis python:3.11-slim
├── Procfile              # Konfigurasi process runner web worker
├── PRD-Pemisah-Halaman-PDF.md # Dokumen spesifikasi kebutuhan produk (PRD)
├── render.yaml           # Konfigurasi Infrastructure as Code untuk Render
├── requirements.txt      # Daftar dependensi Python
└── README.md             # Dokumentasi utama proyek
```

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Menjalankan Frontend Secara Langsung (Client-Side Mode)

Karena SeparaPDF memiliki engine client-side mandiri, Anda dapat langsung menjalankan frontend tanpa backend:

- Buka file `frontend/index.html` langsung di browser Anda, atau
- Gunakan ekstensi seperti **Live Server** (VS Code), atau jalankan static server:
  ```bash
  # Menggunakan npx serve
  npx serve frontend

  # Atau menggunakan modul http bawaan Python
  cd frontend
  python -m http.server 3000
  ```
  Akses di browser pada: `http://localhost:3000`

---

### 2. Menjalankan Backend FastAPI Secara Lokal

Jika Anda ingin memanfaatkan REST API backend:

**Prasyarat:** Python 3.11+

```bash
# 1. Clone repositori
git clone https://github.com/Ikiiloh/Seperate-Colour-PAGE.git
cd Seperate-Colour-PAGE

# 2. Buat dan aktifkan virtual environment
python -m venv venv
# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Windows (CMD):
venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate

# 3. Install dependensi Python
pip install -r requirements.txt

# 4. Jalankan backend server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Swagger API Docs**: `http://127.0.0.1:8000/docs`
- **Redoc API Docs**: `http://127.0.0.1:8000/redoc`

---

### 3. Menjalankan dengan Docker

```bash
# Build Docker image
docker build -t separapdf .

# Jalankan container pada port 3000
docker run -d -p 3000:3000 --name separapdf-app separapdf
```
Akses di browser pada `http://localhost:3000`.

---

## 📡 Dokumentasi REST API

### 1. `GET /api/health`
Cek status ketersediaan dan versi layanan backend.

- **Response:**
  ```json
  {
    "status": "ok",
    "app": "Pemisah Halaman PDF",
    "version": "1.0.0"
  }
  ```

---

### 2. `POST /api/analyze`
Mengunggah file PDF untuk dianalisis warna per halamannya.

- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `file`: File PDF (Maksimum 50 MB).
  - `threshold` (*optional*): Nilai ambang deviasi RGB (default: `18`).
- **Response Contoh**:
  ```json
  {
    "total_pages": 45,
    "color_pages_count": 8,
    "bw_pages_count": 37,
    "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "filename": "skripsi_final.pdf",
    "pages": [
      {
        "page_number": 1,
        "category": "color",
        "is_color": true,
        "color_score": 12.45,
        "thumbnail": "data:image/jpeg;base64,..."
      }
    ]
  }
  ```

---

### 3. `POST /api/generate`
Memproses pemisahan PDF berdasarkan kategori final (setelah disesuaikan oleh pengguna).

- **Content-Type**: `application/json`
- **Body**:
  ```json
  {
    "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "pages": [
      { "page_number": 1, "category": "color" },
      { "page_number": 2, "category": "bw" }
    ],
    "color_price": 1000.0,
    "bw_price": 250.0
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "session_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "has_color": true,
    "has_bw": true,
    "has_zip": true,
    "color_pages": 8,
    "bw_pages": 37,
    "total_pages": 45,
    "cost_all_color": 45000.0,
    "cost_split": 17250.0,
    "money_saved": 27750.0,
    "savings_percentage": 61.7
  }
  ```

---

### 4. `GET /api/download/{session_id}/{file_type}`
Mengunduh file PDF atau arsip ZIP hasil pemisahan.

- **Path Parameters**:
  - `session_id`: UUID sesi pemrosesan.
  - `file_type`: Pilihan jenis file (`color`, `bw`, atau `zip`).
- **Response**: File stream (`application/pdf` atau `application/zip`).

---

## 🌐 Panduan Deployment

### Deploy Frontend ke Vercel
1. Hubungkan repositori GitHub ini ke dashboard [Vercel](https://vercel.com).
2. Set **Root Directory** ke `frontend` (atau biarkan Vercel membaca [`vercel.json`](file:///c:/Users/muhri/Desktop/Seperate-Colour-PAGE/frontend/vercel.json)).
3. Klik **Deploy**.

### Deploy Backend ke Render
1. Buat Web Service baru di [Render](https://render.com).
2. Hubungkan repositori GitHub ini, pilih environment **Python 3**.
3. Render akan otomatis membaca konfigurasi [`render.yaml`](file:///c:/Users/muhri/Desktop/Seperate-Colour-PAGE/render.yaml):
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

---

## ⚖️ Batasan & Catatan Teknis

- **Ukuran Berkas**: Rekomendasi batas unggah adalah 50 MB untuk kenyamanan rendering di browser.
- **Noise Dokumen Scan**: Dokumen hasil scan fisik dapat mengandung sedikit noise warna pada kertas kekuningan; geser *threshold slider* ke nilai yang lebih tinggi (misal: 25–35) untuk menyaring noise tersebut.
- **Urutan Halaman**: Halaman di dalam PDF hasil pemisahan tetap mempertahankan urutan kronologis aslinya.

---

## 📄 Lisensi

Proyek ini bersifat open-source dan bebas digunakan, dimodifikasi, serta didistribusikan untuk keperluan pendidikan dan non-komersial.
