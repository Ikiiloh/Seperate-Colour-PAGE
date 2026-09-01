# SeparaPDF - Pemisah Halaman PDF (Berwarna vs Hitam-Putih)

Aplikasi Web modern untuk memindai dokumen PDF (seperti draft skripsi/tugas akhir) dan memisahkannya secara otomatis menjadi 2 file terpisah: **PDF Berwarna** dan **PDF Hitam-Putih**. Membantu mahasiswa dan pengguna menghemat biaya cetak hingga 70%.

---

## Fitur Utama

- **Deteksi Warna Otomatis**: Memindai channel RGB piksel dengan algoritma toleransi noise scan.
- **Visual Preview & Koreksi Manual**: Menampilkan thumbnail setiap halaman dan memungkinkan pengguna mengoreksi klasifikasi halaman (Toggle Berwarna / Hitam-Putih) secara manual sebelum mengunduh.
- **Kalkulator Hemat Biaya Cetak**: Menghitung estimasi biaya print warna vs print pisah secara real-time.
- **Download Paket ZIP & File Terpisah**: Unduh PDF Berwarna, PDF Hitam-Putih, atau keduanya dalam satu paket ZIP.
- **Privacy First**: File sementara otomatis dihapus dari server setelah diproses.

---

## Cara Menjalankan Secara Lokal

### Prasyarat
- Python 3.10+
- `pip` package manager

### Langkah-Langkah

1. Install dependensi Python:
   ```bash
   pip install -r requirements.txt
   ```

2. Jalankan server FastAPI:
   ```bash
   python -m app.main
   ```
   *atau menggunakan uvicorn langsung:*
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

3. Buka browser dan akses:
   ```text
   http://127.0.0.1:8000
   ```

---

## Cara Deploy ke Render (Free Tier)

Aplikasi ini siap didaftarkan di [Render.com](https://render.com) (Python Web Service):

1. **Push repositori ini ke GitHub / GitLab**.
2. **Buat Web Service baru di Render**:
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Selesai! Aplikasi web Anda akan aktif online 24/7.

---

## Struktur Project

```text
Seperate-Colour-PAGE/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI Web Server & API Endpoints
│   ├── pdf_processor.py     # Engine Deteksi Warna & Pemisah PDF (PyMuPDF)
│   └── cleanup.py           # Pembersihan Otomatis File Sementara
├── static/
│   ├── index.html           # Modern Glassmorphic Single Page App UI
│   ├── css/
│   │   └── style.css        # Custom Stylesheet & Design System
│   └── js/
│       └── app.js           # Frontend Controller (Upload, Drag&Drop, Override, Calc)
├── temp_sessions/          # Folder Penyimpanan Sementara Sesi PDF
├── requirements.txt         # Dependensi Python
└── README.md                # Dokumentasi Project
```
