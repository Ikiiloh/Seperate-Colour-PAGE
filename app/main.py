import os
import uuid
import zipfile
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from app.pdf_processor import PDFProcessor
from app.cleanup import cleanup_old_sessions

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp_sessions")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app = FastAPI(
    title="Pemisah Halaman PDF Berwarna vs Hitam-Putih",
    description="Aplikasi web hemat biaya cetak skripsi & dokumen PDF",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema for PDF generation
class PageOverride(BaseModel):
    page_number: int
    category: str  # "color" or "bw"

class GenerateRequest(BaseModel):
    session_id: str
    pages: List[PageOverride]
    color_price: Optional[float] = 1000.0
    bw_price: Optional[float] = 250.0

@app.on_event("startup")
def startup_event():
    # Run cleanup of stale sessions on server startup
    cleanup_old_sessions(TEMP_DIR)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Pemisah Halaman PDF", "version": "1.0.0"}

@app.post("/api/analyze")
async def analyze_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    threshold: int = Form(18)
):
    # Trigger background cleanup of old session files
    background_tasks.add_task(cleanup_old_sessions, TEMP_DIR)

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File yang diunggah harus berformat PDF.")

    session_id = str(uuid.uuid4())
    session_path = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_path, exist_ok=True)

    file_path = os.path.join(session_path, "original.pdf")
    
    # Read file content and check size (limit 50 MB)
    contents = await file.read()
    max_bytes = 50 * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail="Ukuran file melebihi batas maksimum 50 MB.")

    with open(file_path, "wb") as f:
        f.write(contents)

    try:
        # Run PDF color analysis
        result = PDFProcessor.process_pdf(file_path, threshold=threshold)
        result["session_id"] = session_id
        result["filename"] = file.filename
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses dokumen PDF: {str(e)}")

@app.post("/api/generate")
async def generate_split_pdfs(req: GenerateRequest):
    session_path = os.path.join(TEMP_DIR, req.session_id)
    original_pdf = os.path.join(session_path, "original.pdf")

    if not os.path.exists(original_pdf):
        raise HTTPException(status_code=404, detail="Sesi telah kadaluarsa atau file tidak ditemukan.")

    color_pdf = os.path.join(session_path, "dokumen_berwarna.pdf")
    bw_pdf = os.path.join(session_path, "dokumen_hitam_putih.pdf")
    zip_path = os.path.join(session_path, "paket_cetak_pdf.zip")

    page_dicts = [p.dict() for p in req.pages]
    
    try:
        split_result = PDFProcessor.split_pdf(
            source_pdf_path=original_pdf,
            page_categories=page_dicts,
            output_color_path=color_pdf,
            output_bw_path=bw_pdf
        )

        # Count final pages
        color_count = split_result["color_pages_total"]
        bw_count = split_result["bw_pages_total"]
        total_pages = color_count + bw_count

        # Calculate cost estimation
        color_cost_single = total_pages * req.color_price
        split_cost = (color_count * req.color_price) + (bw_count * req.bw_price)
        money_saved = max(0.0, color_cost_single - split_cost)
        savings_percentage = round((money_saved / color_cost_single * 100), 1) if color_cost_single > 0 else 0.0

        # Create ZIP bundle if both exist
        has_zip = False
        if split_result["has_color_pdf"] or split_result["has_bw_pdf"]:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                if split_result["has_color_pdf"] and os.path.exists(color_pdf):
                    zf.write(color_pdf, arcname="Dokumen_Berwarna.pdf")
                if split_result["has_bw_pdf"] and os.path.exists(bw_pdf):
                    zf.write(bw_pdf, arcname="Dokumen_Hitam_Putih.pdf")
            has_zip = True

        return {
            "status": "success",
            "session_id": req.session_id,
            "has_color": split_result["has_color_pdf"],
            "has_bw": split_result["has_bw_pdf"],
            "has_zip": has_zip,
            "color_pages": color_count,
            "bw_pages": bw_count,
            "total_pages": total_pages,
            "cost_all_color": color_cost_single,
            "cost_split": split_cost,
            "money_saved": money_saved,
            "savings_percentage": savings_percentage
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memisah file PDF: {str(e)}")

@app.get("/api/download/{session_id}/{file_type}")
def download_pdf(session_id: str, file_type: str):
    session_path = os.path.join(TEMP_DIR, session_id)
    
    if file_type == "color":
        target_file = os.path.join(session_path, "dokumen_berwarna.pdf")
        download_name = "Dokumen_Berwarna.pdf"
        media_type = "application/pdf"
    elif file_type == "bw":
        target_file = os.path.join(session_path, "dokumen_hitam_putih.pdf")
        download_name = "Dokumen_Hitam_Putih.pdf"
        media_type = "application/pdf"
    elif file_type == "zip":
        target_file = os.path.join(session_path, "paket_cetak_pdf.zip")
        download_name = "Paket_Cetak_PDF.zip"
        media_type = "application/zip"
    else:
        raise HTTPException(status_code=400, detail="Jenis file unduhan tidak valid.")

    if not os.path.exists(target_file):
        raise HTTPException(status_code=404, detail="File unduhan tidak ditemukan.")

    return FileResponse(
        path=target_file,
        filename=download_name,
        media_type=media_type
    )

# Mount static files for frontend assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend static file index.html belum dibuat."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
