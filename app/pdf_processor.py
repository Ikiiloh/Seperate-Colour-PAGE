import fitz  # PyMuPDF
import base64
import os
from io import BytesIO
from PIL import Image
import numpy as np

class PDFProcessor:
    """
    Handles PDF scanning, color detection per page, thumbnail extraction,
    and splitting PDF into separate Color and Black&White documents.
    """

    @staticmethod
    def is_pixel_colored(r: int, g: int, b: int, threshold: int = 18) -> bool:
        """
        Check if an individual pixel is colored beyond the noise threshold.
        Ignores near-white backgrounds and near-black text ink.
        """
        # Ignore paper background (near white)
        if r > 242 and g > 242 and b > 242:
            return False
        # Ignore deep black ink / text (near black)
        if r < 30 and g < 30 and b < 30:
            return False
        
        # Max channel difference (saturation indicator)
        max_diff = max(abs(int(r) - int(g)), abs(int(g) - int(b)), abs(int(b) - int(r)))
        return max_diff >= threshold

    @classmethod
    def analyze_page_color(cls, page: fitz.Page, threshold: int = 18, render_dpi: int = 90) -> tuple[bool, float, str]:
        """
        Analyzes a single PyMuPDF page for color presence.
        Returns: (is_color: bool, color_score: float, base64_thumbnail: str)
        """
        pix = page.get_pixmap(dpi=render_dpi)
        
        # Convert pixmap to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        # Downsample image for high-speed color analysis if too large
        sample_img = img.resize((min(300, img.width), min(400, img.height)))
        img_np = np.array(sample_img, dtype=np.int16)
        
        # Extract RGB channels
        r = img_np[:, :, 0]
        g = img_np[:, :, 1]
        b = img_np[:, :, 2]
        
        # Masks for background/ink filtering
        paper_bg_mask = (r > 242) & (g > 242) & (b > 242)
        deep_ink_mask = (r < 30) & (g < 30) & (b < 30)
        valid_pixel_mask = ~(paper_bg_mask | deep_ink_mask)
        
        # Compute channel differences
        diff_rg = np.abs(r - g)
        diff_gb = np.abs(g - b)
        diff_br = np.abs(b - r)
        max_diff = np.maximum(np.maximum(diff_rg, diff_gb), diff_br)
        
        # Color pixels within valid region
        color_pixel_mask = valid_pixel_mask & (max_diff >= threshold)
        color_pixel_count = int(np.sum(color_pixel_mask))
        valid_pixel_count = int(np.sum(valid_pixel_mask))
        
        # Calculate color score percentage
        color_ratio = (color_pixel_count / valid_pixel_count) if valid_pixel_count > 0 else 0.0
        
        # Threshold decision: page is color if color ratio >= 0.15% of content pixels OR total color pixels > 40
        is_color = (color_ratio >= 0.0015 and color_pixel_count >= 30) or (color_pixel_count >= 120)

        # Generate JPEG Thumbnail base64 for UI rendering
        thumb_img = img.resize((min(180, img.width), min(240, img.height)))
        buffered = BytesIO()
        thumb_img.save(buffered, format="JPEG", quality=70)
        thumb_b64 = "data:image/jpeg;base64," + base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return is_color, round(color_ratio * 100, 2), thumb_b64

    @classmethod
    def process_pdf(cls, pdf_path: str, threshold: int = 18) -> dict:
        """
        Processes full PDF document and returns detailed page breakdown & metrics.
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        pages_info = []
        color_count = 0
        bw_count = 0

        for page_idx in range(total_pages):
            page = doc[page_idx]
            is_color, color_score, thumb_b64 = cls.analyze_page_color(page, threshold=threshold)
            
            category = "color" if is_color else "bw"
            if is_color:
                color_count += 1
            else:
                bw_count += 1

            pages_info.append({
                "page_number": page_idx + 1,
                "category": category,
                "is_color": is_color,
                "color_score": color_score,
                "thumbnail": thumb_b64
            })
            
        doc.close()

        return {
            "total_pages": total_pages,
            "color_pages_count": color_count,
            "bw_pages_count": bw_count,
            "pages": pages_info
        }

    @classmethod
    def split_pdf(cls, source_pdf_path: str, page_categories: list[dict], output_color_path: str, output_bw_path: str) -> dict:
        """
        Splits source PDF into two files (Color vs Black&White) based on classifications.
        page_categories: list of {"page_number": 1, "category": "color" | "bw"}
        """
        src_doc = fitz.open(source_pdf_path)
        
        doc_color = fitz.open()
        doc_bw = fitz.open()

        color_indices = []
        bw_indices = []

        for item in page_categories:
            page_num = item.get("page_number")  # 1-indexed
            category = item.get("category")
            page_idx = page_num - 1
            
            if category == "color":
                color_indices.append(page_idx)
            else:
                bw_indices.append(page_idx)

        # Build color PDF
        has_color = len(color_indices) > 0
        if has_color:
            for idx in color_indices:
                doc_color.insert_pdf(src_doc, from_page=idx, to_page=idx)
            doc_color.save(output_color_path)

        # Build B&W PDF
        has_bw = len(bw_indices) > 0
        if has_bw:
            for idx in bw_indices:
                doc_bw.insert_pdf(src_doc, from_page=idx, to_page=idx)
            doc_bw.save(output_bw_path)

        src_doc.close()
        doc_color.close()
        doc_bw.close()

        return {
            "has_color_pdf": has_color,
            "has_bw_pdf": has_bw,
            "color_pages_total": len(color_indices),
            "bw_pages_total": len(bw_indices)
        }
