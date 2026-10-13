/**
 * Tool: Pisah Warna (NoPDF original feature)
 * Detects colour vs black & white pages and exports them as two PDFs.
 */
(function () {
    'use strict';

    const TEMPLATE = `
<!-- Step 1: Upload Dropzone Card -->
        <section id="uploadSection" class="skeuo-card upload-card">
            <div class="upload-zone skeuo-inset-panel" id="dropzone">
                <input type="file" id="fileInput" accept=".pdf" class="file-input">
                <div class="upload-content">
                    <div class="upload-icon-wrapper skeuo-icon-btn">
                        <i class="fa-solid fa-cloud-arrow-up upload-icon"></i>
                    </div>
                    <h2>Tarik & Lepaskan File PDF Skripsi di Sini</h2>
                    <p class="upload-hint">atau <span class="browse-btn skeuo-btn-sm">Pilih File dari Perangkat</span>
                    </p>
                    <span class="upload-specs skeuo-inset-badge"><i class="fa-solid fa-circle-info"></i> Format PDF |
                        Maksimal 50 MB (hingga ~300+ Halaman)</span>
                </div>
            </div>

            <!-- Advanced Settings Accordion -->
            <div class="settings-box">
                <div class="settings-header skeuo-header-toggle" id="toggleSettings">
                    <span><i class="fa-solid fa-sliders"></i> Pengaturan Sensitivitas & Noise Scan</span>
                    <i class="fa-solid fa-chevron-down caret-icon"></i>
                </div>
                <div class="settings-body" id="settingsBody">
                    <div class="setting-item">
                        <label for="thresholdRange">Toleransi Deteksi Warna (Threshold): <strong id="thresholdVal"
                                class="skeuo-badge-inline">18</strong></label>
                        <input type="range" id="thresholdRange" min="5" max="40" value="18" step="1"
                            class="skeuo-slider">
                        <small>Gunakan nilai lebih tinggi jika dokumen Anda hasil scan yang memiliki bayangan kertas
                            agak kekuningan/abu-abu.</small>
                    </div>
                </div>
            </div>
        </section>

        <!-- Loading / Progress State -->
        <section id="progressSection" class="skeuo-card progress-card hidden">
            <div class="spinner-container skeuo-meter-dial">
                <i class="fa-solid fa-gear fa-spin scanner-icon"></i>
            </div>
            <h2 id="progressTitle" class="progress-title skeuo-embossed-text">MEMINDAI DOKUMEN PDF...</h2>
            <p id="progressSubtitle">Menganalisis piksel warna di setiap halaman PDF Anda...</p>
            <div class="progress-bar-wrapper skeuo-inset-bar">
                <div class="progress-bar-fill skeuo-bar-fill" id="progressBarFill"></div>
            </div>
            <div class="scan-status skeuo-lcd-text" id="scanStatus">Menyiapkan halaman...</div>
        </section>

        <!-- Step 2: Dashboard Results & Overrides -->
        <section id="resultsSection" class="results-wrapper hidden">
            <!-- Stats Counters Row -->
            <div class="stats-grid">
                <div class="stat-card skeuo-gauge-card">
                    <div class="stat-icon skeuo-icon-inset"><i class="fa-solid fa-copy"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">TOTAL HALAMAN</span>
                        <h2 class="stat-value skeuo-lcd-val" id="valTotalPages">0</h2>
                    </div>
                </div>

                <div class="stat-card skeuo-gauge-card card-color-theme">
                    <div class="stat-icon skeuo-icon-inset"><i class="fa-solid fa-palette"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">HALAMAN BERWARNA</span>
                        <h2 class="stat-value skeuo-lcd-val color-text" id="valColorPages">0</h2>
                    </div>
                </div>

                <div class="stat-card skeuo-gauge-card card-bw-theme">
                    <div class="stat-icon skeuo-icon-inset"><i class="fa-solid fa-print"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">HITAM-PUTIH (B/W)</span>
                        <h2 class="stat-value skeuo-lcd-val bw-text" id="valBwPages">0</h2>
                    </div>
                </div>

                <div class="stat-card skeuo-gauge-card card-green-theme">
                    <div class="stat-icon skeuo-icon-inset"><i class="fa-solid fa-piggy-bank"></i></div>
                    <div class="stat-info">
                        <span class="stat-label">ESTIMASI HEMAT</span>
                        <h2 class="stat-value skeuo-lcd-val green-text" id="valMoneySaved">Rp 0</h2>
                        <span class="savings-percent-badge skeuo-inset-tag" id="valSavingsPercent">HEMAT 0%</span>
                    </div>
                </div>
            </div>

            <!-- Cost Estimator Calculator -->
            <div class="skeuo-card estimator-card skeuo-calculator-body">
                <div class="card-title skeuo-calc-header">
                    <i class="fa-solid fa-calculator"></i> KALKULATOR ESTIMASI BIAYA PRINT SKRIPSI
                </div>
                <div class="estimator-form">
                    <div class="input-group">
                        <label for="inputPriceColor">Tarif Print Warna / Lembar</label>
                        <div class="input-wrapper skeuo-inset-input">
                            <span class="currency-prefix">Rp</span>
                            <input type="number" id="inputPriceColor" value="1000" min="0" step="100">
                        </div>
                    </div>
                    <div class="input-group">
                        <label for="inputPriceBw">Tarif Print B/W / Lembar</label>
                        <div class="input-wrapper skeuo-inset-input">
                            <span class="currency-prefix">Rp</span>
                            <input type="number" id="inputPriceBw" value="250" min="0" step="50">
                        </div>
                    </div>
                    <div class="cost-summary skeuo-calc-screen">
                        <div class="cost-item">
                            <span>Biaya Cetak Semua Warna:</span>
                            <strong id="costAllColor" class="old-price">Rp 0</strong>
                        </div>
                        <div class="cost-item">
                            <span>Biaya Setelah Dipisah:</span>
                            <strong id="costSplit" class="new-price">Rp 0</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Thumbnail Grid & Manual Override Section -->
            <div class="skeuo-card preview-card">
                <div class="preview-header">
                    <div class="preview-title">
                        <h3><i class="fa-solid fa-images"></i> PREVIEW HALAMAN & KOREKSI MANUAL</h3>
                        <small>Klik tombol pada thumbnail untuk mengoreksi halaman yang salah terdeteksi</small>
                    </div>
                    <div class="filter-controls skeuo-button-group">
                        <button class="filter-btn skeuo-btn active" data-filter="all" type="button">SEMUA (<span
                                id="countFilterAll">0</span>)</button>
                        <button class="filter-btn skeuo-btn" data-filter="color" type="button">BERWARNA (<span
                                id="countFilterColor">0</span>)</button>
                        <button class="filter-btn skeuo-btn" data-filter="bw" type="button">HITAM-PUTIH (<span
                                id="countFilterBw">0</span>)</button>
                    </div>
                </div>

                <div class="quick-actions-bar">
                    <button class="action-btn skeuo-btn btn-metallic-tactile" id="btnResetCategories" type="button"><i
                            class="fa-solid fa-rotate-left"></i> Reset Deteksi Awal</button>
                </div>

                <!-- Grid Container -->
                <div class="thumbnails-grid skeuo-grid-tray" id="thumbnailsGrid">
                    <!-- Dynamic page thumbnails rendered by JavaScript -->
                </div>
            </div>

            <!-- Download Action Panel -->
            <div class="skeuo-card download-card skeuo-panel-metal">
                <div class="download-header">
                    <h2><i class="fa-solid fa-download"></i> UNDUH FILE PDF TERPISAH</h2>
                    <p>File hasil pisah siap langsung dibawa ke tempat fotokopi/print!</p>
                </div>

                <div class="download-buttons">
                    <button id="btnDownloadColor" type="button" class="btn skeuo-push-btn btn-color-skeuo">
                        <i class="fa-solid fa-file-arrow-down"></i>
                        <div class="btn-text">
                            <span>UNDUH PDF BERWARNA</span>
                            <small id="subTextDownloadColor">0 Halaman</small>
                        </div>
                    </button>

                    <button id="btnDownloadBw" type="button" class="btn skeuo-push-btn btn-bw-skeuo">
                        <i class="fa-solid fa-file-arrow-down"></i>
                        <div class="btn-text">
                            <span>UNDUH PDF HITAM-PUTIH</span>
                            <small id="subTextDownloadBw">0 Halaman</small>
                        </div>
                    </button>

                    <button id="btnDownloadZip" type="button" class="btn skeuo-push-btn btn-zip-skeuo">
                        <i class="fa-solid fa-file-zipper"></i>
                        <div class="btn-text">
                            <span>UNDUH PAKET (ZIP)</span>
                            <small>Kedua File Sekaligus</small>
                        </div>
                    </button>
                </div>

                <div class="reset-wrapper">
                    <button id="btnResetApp" type="button" class="btn-link skeuo-btn-sm"><i
                            class="fa-solid fa-arrow-left"></i> Unggah & Proses Dokumen Lain</button>
                </div>
            </div>
        </section>

<!-- Full Page Preview Modal -->
    <div class="preview-modal" id="previewModal" aria-hidden="true">
        <div class="modal-overlay" id="modalOverlay"></div>
        <div class="modal-box skeuo-card">
            <button class="modal-close" id="modalClose" type="button" aria-label="Tutup">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="modal-nav modal-prev" id="modalPrev" type="button" aria-label="Halaman sebelumnya">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="modal-nav modal-next" id="modalNext" type="button" aria-label="Halaman berikutnya">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <div class="modal-stage" id="modalStage">
                <div class="modal-loading" id="modalLoading">
                    <i class="fa-solid fa-gear fa-spin"></i> Merender halaman...
                </div>
                <canvas class="modal-canvas" id="modalCanvas"></canvas>
            </div>
            <div class="modal-caption" id="modalCaption"></div>
        </div>
    </div>
`;

    function mountColorSplit(root) {
        root.innerHTML = TEMPLATE;

    // --- DOM Elements ---
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const toggleSettings = document.getElementById('toggleSettings');
    const settingsBody = document.getElementById('settingsBody');
    const thresholdRange = document.getElementById('thresholdRange');
    const thresholdVal = document.getElementById('thresholdVal');

    const uploadSection = document.getElementById('uploadSection');
    const progressSection = document.getElementById('progressSection');
    const resultsSection = document.getElementById('resultsSection');

    const progressTitle = document.getElementById('progressTitle');
    const progressSubtitle = document.getElementById('progressSubtitle');
    const progressBarFill = document.getElementById('progressBarFill');
    const scanStatus = document.getElementById('scanStatus');

    // Stats
    const valTotalPages = document.getElementById('valTotalPages');
    const valColorPages = document.getElementById('valColorPages');
    const valBwPages = document.getElementById('valBwPages');
    const valMoneySaved = document.getElementById('valMoneySaved');
    const valSavingsPercent = document.getElementById('valSavingsPercent');

    // Estimator
    const inputPriceColor = document.getElementById('inputPriceColor');
    const inputPriceBw = document.getElementById('inputPriceBw');
    const costAllColor = document.getElementById('costAllColor');
    const costSplit = document.getElementById('costSplit');

    // Grid & Filters
    const thumbnailsGrid = document.getElementById('thumbnailsGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const countFilterAll = document.getElementById('countFilterAll');
    const countFilterColor = document.getElementById('countFilterColor');
    const countFilterBw = document.getElementById('countFilterBw');

    const btnMarkAllColor = document.getElementById('btnMarkAllColor');
    const btnMarkAllBw = document.getElementById('btnMarkAllBw');
    const btnResetCategories = document.getElementById('btnResetCategories');

    // Downloads
    const btnDownloadColor = document.getElementById('btnDownloadColor');
    const btnDownloadBw = document.getElementById('btnDownloadBw');
    const btnDownloadZip = document.getElementById('btnDownloadZip');
    const subTextDownloadColor = document.getElementById('subTextDownloadColor');
    const subTextDownloadBw = document.getElementById('subTextDownloadBw');
    const btnResetApp = document.getElementById('btnResetApp');

    // Preview modal
    const previewModal = document.getElementById('previewModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');
    const modalPrev = document.getElementById('modalPrev');
    const modalNext = document.getElementById('modalNext');
    const modalLoading = document.getElementById('modalLoading');
    const modalCanvas = document.getElementById('modalCanvas');
    const modalCaption = document.getElementById('modalCaption');

    SP.onCleanup(() => { if (currentPdfDoc) { try { currentPdfDoc.destroy(); } catch (e) { /* ignore */ } } });

    // --- State Variables ---
    let originalFileBuffer = null;       // Keep source PDF bytes for split/generate
    let originalData = null;             // Copy of analysis response
    let pagesData = [];                  // Array of page objects with dynamic manual overrides
    let activeFilter = 'all';
    let currentPdfDoc = null;            // Loaded pdf.js document (lazy) for preview rendering
    let previewIndex = -1;               // Page index being previewed (into pagesData)

    // --- Event Listeners ---
    if (toggleSettings) {
        toggleSettings.addEventListener('click', () => {
            settingsBody.classList.toggle('open');
            const icon = toggleSettings.querySelector('.caret-icon');
            if (icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        });
    }

    if (thresholdRange) {
        thresholdRange.addEventListener('input', (e) => {
            thresholdVal.textContent = e.target.value;
        });
    }

    // Drag & Drop
    if (dropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleFileSelect(files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    // Price Input Listeners
    if (inputPriceColor) inputPriceColor.addEventListener('input', updateCostCalculator);
    if (inputPriceBw) inputPriceBw.addEventListener('input', updateCostCalculator);

    // Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.getAttribute('data-filter');
            renderThumbnails();
        });
    });

    // Quick Actions
    if (btnMarkAllColor) {
        btnMarkAllColor.addEventListener('click', () => {
            pagesData.forEach(p => p.category = 'color');
            updateUI();
        });
    }

    if (btnMarkAllBw) {
        btnMarkAllBw.addEventListener('click', () => {
            pagesData.forEach(p => p.category = 'bw');
            updateUI();
        });
    }

    if (btnResetCategories) {
        btnResetCategories.addEventListener('click', () => {
            if (originalData) {
                pagesData = JSON.parse(JSON.stringify(originalData.pages));
                updateUI();
            }
        });
    }

    // Download Handlers (Robust & Fail-safe)
    if (btnDownloadColor) {
        btnDownloadColor.addEventListener('click', (e) => {
            e.preventDefault();
            triggerPdfGeneration('color', btnDownloadColor);
        });
    }
    if (btnDownloadBw) {
        btnDownloadBw.addEventListener('click', (e) => {
            e.preventDefault();
            triggerPdfGeneration('bw', btnDownloadBw);
        });
    }
    if (btnDownloadZip) {
        btnDownloadZip.addEventListener('click', (e) => {
            e.preventDefault();
            triggerPdfGeneration('zip', btnDownloadZip);
        });
    }

    if (btnResetApp) {
        btnResetApp.addEventListener('click', (e) => {
            e.preventDefault();
            resetApp();
        });
    }

    // Browse button trigger
    const browseBtns = document.querySelectorAll('.browse-btn');
    browseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (fileInput) fileInput.click();
        });
    });

    // --- Preview Modal ---
    function closePreview() {
        if (previewModal) {
            previewModal.classList.remove('open');
            previewModal.setAttribute('aria-hidden', 'true');
        }
        previewIndex = -1;
    }

    async function getOrLoadPdf() {
        if (currentPdfDoc) return currentPdfDoc;
        if (!originalFileBuffer) return null;
        currentPdfDoc = await pdfjsLib.getDocument({
            data: new Uint8Array(originalFileBuffer.slice(0))
        }).promise;
        return currentPdfDoc;
    }

    async function renderPreviewPage(index) {
        if (index < 0 || index >= pagesData.length) return;
        previewIndex = index;

        const pageObj = pagesData[index];
        if (!pageObj) return;

        modalLoading.classList.remove('hidden');
        modalCanvas.classList.remove('ready');

        const pdf = await getOrLoadPdf();
        if (!pdf) {
            alert('File PDF tidak ditemukan. Silakan unggah ulang dokumen.');
            closePreview();
            return;
        }

        try {
            const page = await pdf.getPage(pageObj.page_number);

            // Render at a much higher resolution than the thumbnail for clarity.
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(3, 1500 / baseViewport.width);
            const viewport = page.getViewport({ scale });

            const dpr = window.devicePixelRatio || 1;
            modalCanvas.width = Math.floor(viewport.width) * dpr;
            modalCanvas.height = Math.floor(viewport.height) * dpr;

            const ctx = modalCanvas.getContext('2d');
            ctx.scale(dpr, dpr);
            await page.render({ canvasContext: ctx, viewport }).promise;

            page.cleanup();

            const label = pageObj.category === 'color' ? 'Berwarna' : 'Hitam-Putih';
            modalCaption.textContent =
                `Halaman ${pageObj.page_number} dari ${pagesData.length} • ${label} • ${pageObj.color_score}% warna`;

            modalPrev.disabled = (index <= 0);
            modalNext.disabled = (index >= pagesData.length - 1);

            modalLoading.classList.add('hidden');
            modalCanvas.classList.add('ready');
        } catch (error) {
            alert(`Gagal merender halaman: ${error.message}`);
            modalLoading.classList.add('hidden');
        }
    }

    function openPreview(pageNumber) {
        if (!previewModal || !pagesData.length) return;
        const idx = pagesData.findIndex(p => p.page_number === pageNumber);
        if (idx < 0) return;

        previewModal.classList.add('open');
        previewModal.setAttribute('aria-hidden', 'false');
        renderPreviewPage(idx);
    }

    if (previewModal) {
        modalOverlay.addEventListener('click', closePreview);
        modalClose.addEventListener('click', closePreview);
        modalPrev.addEventListener('click', () => renderPreviewPage(previewIndex - 1));
        modalNext.addEventListener('click', () => renderPreviewPage(previewIndex + 1));
        const onKey = (e) => {
            if (!previewModal.classList.contains('open')) return;
            if (e.key === 'Escape') closePreview();
            if (e.key === 'ArrowLeft') renderPreviewPage(previewIndex - 1);
            if (e.key === 'ArrowRight') renderPreviewPage(previewIndex + 1);
        };
        document.addEventListener('keydown', onKey);
        SP.onCleanup(() => document.removeEventListener('keydown', onKey));
    }

    // --- Core Functions ---
    function handleFileSelect(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            alert('Silakan pilih file berformat PDF.');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            alert('Ukuran file melebihi batas 50 MB.');
            return;
        }

        analyzePdfLocally(file);
    }

    // Render a single page to a canvas (~90 DPI to mirror the server pipeline).
    async function renderPageToCanvas(page) {
        const scale = 1.25; // 90 / 72
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        return canvas;
    }

    // Downsample the rendered page and read pixel data for color analysis.
    function getAnalysisImageData(canvas) {
        const w = canvas.width;
        const h = canvas.height;
        let sw = w;
        let sh = h;
        if (w > 300 || h > 400) {
            const r = Math.min(300 / w, 400 / h);
            sw = Math.max(1, Math.round(w * r));
            sh = Math.max(1, Math.round(h * r));
        }
        const small = document.createElement('canvas');
        small.width = sw;
        small.height = sh;
        const sctx = small.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(canvas, 0, 0, sw, sh);
        return sctx.getImageData(0, 0, sw, sh).data;
    }

    // Port of PDFProcessor.is_* logic (python/numpy) to plain JS.
    function analyzePixelsFromImageData(data, threshold) {
        let colorPixelCount = 0;
        let validPixelCount = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Ignore near-white backgrounds and near-black ink.
            if (r > 242 && g > 242 && b > 242) continue;
            if (r < 30 && g < 30 && b < 30) continue;

            validPixelCount++;
            const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(b - r));
            if (maxDiff >= threshold) colorPixelCount++;
        }

        const colorRatio = validPixelCount > 0 ? colorPixelCount / validPixelCount : 0;
        const isColor = (colorRatio >= 0.0015 && colorPixelCount >= 30) || (colorPixelCount >= 120);
        return { is_color: isColor, color_score: Math.round(colorRatio * 10000) / 100 };
    }

    // Build the JPEG thumbnail used by the UI (mirrors server output).
    function makeThumbnail(canvas) {
        const tw = Math.max(1, Math.min(180, canvas.width));
        const th = Math.max(1, Math.min(240, canvas.height));
        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        c.getContext('2d').drawImage(canvas, 0, 0, tw, th);
        return c.toDataURL('image/jpeg', 0.7);
    }

    // Trigger a blob download using an anchor element.
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    async function analyzePdfLocally(file) {
        // Show progress view
        uploadSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        progressBarFill.style.width = '10%';
        progressTitle.textContent = `Memindai ${file.name}...`;
        scanStatus.textContent = 'Membaca file PDF di browser Anda...';

        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('Library pdf.js tidak termuat. Periksa koneksi internet Anda.');
            }

            const arrayBuffer = await file.arrayBuffer();
            originalFileBuffer = arrayBuffer;

            // Pass a copy to pdf.js so originalFileBuffer stays usable later for splitting.
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
            currentPdfDoc = pdf;
            const totalPages = pdf.numPages;

            const pages = [];
            let colorCount = 0;
            let bwCount = 0;
            const thresholdValue = parseInt(thresholdRange.value, 10) || 18;

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const canvas = await renderPageToCanvas(page);

                const { is_color, color_score } = analyzePixelsFromImageData(
                    getAnalysisImageData(canvas), thresholdValue
                );
                const thumbnail = makeThumbnail(canvas);

                // Free canvas memory immediately
                canvas.width = 1;
                canvas.height = 1;
                page.cleanup();

                const category = is_color ? 'color' : 'bw';
                if (is_color) colorCount++;
                else bwCount++;

                pages.push({
                    page_number: i,
                    category,
                    is_color,
                    color_score,
                    thumbnail
                });

                const pct = 10 + Math.round((i / totalPages) * 85);
                progressBarFill.style.width = pct + '%';
                scanStatus.textContent = `Menganalisis piksel warna halaman ${i} dari ${totalPages}...`;
            }

            progressBarFill.style.width = '97%';
            scanStatus.textContent = 'Menyusun visual thumbnail halaman...';

            // Save state
            originalData = {
                total_pages: totalPages,
                color_pages_count: colorCount,
                bw_pages_count: bwCount,
                pages
            };
            pagesData = JSON.parse(JSON.stringify(originalData.pages));

            progressBarFill.style.width = '100%';

            setTimeout(() => {
                progressSection.classList.add('hidden');
                resultsSection.classList.remove('hidden');
                updateUI();
            }, 400);

        } catch (error) {
            alert(`Terjadi kesalahan: ${error.message}`);
            resetApp();
        }
    }

    function updateUI() {
        const total = pagesData.length;
        const colorCount = pagesData.filter(p => p.category === 'color').length;
        const bwCount = pagesData.filter(p => p.category === 'bw').length;

        // Counters
        if (valTotalPages) valTotalPages.textContent = total;
        if (valColorPages) valColorPages.textContent = colorCount;
        if (valBwPages) valBwPages.textContent = bwCount;

        // Filter Counts
        if (countFilterAll) countFilterAll.textContent = total;
        if (countFilterColor) countFilterColor.textContent = colorCount;
        if (countFilterBw) countFilterBw.textContent = bwCount;

        // Subtexts on Download Buttons
        if (subTextDownloadColor) subTextDownloadColor.textContent = `${colorCount} Halaman`;
        if (subTextDownloadBw) subTextDownloadBw.textContent = `${bwCount} Halaman`;

        if (btnDownloadColor) btnDownloadColor.disabled = colorCount === 0;
        if (btnDownloadBw) btnDownloadBw.disabled = bwCount === 0;

        updateCostCalculator();
        renderThumbnails();
    }

    function updateCostCalculator() {
        const total = pagesData.length;
        const colorCount = pagesData.filter(p => p.category === 'color').length;
        const bwCount = pagesData.filter(p => p.category === 'bw').length;

        const priceColor = parseFloat(inputPriceColor ? inputPriceColor.value : 1000) || 0;
        const priceBw = parseFloat(inputPriceBw ? inputPriceBw.value : 250) || 0;

        const totalAllColor = total * priceColor;
        const totalSplit = (colorCount * priceColor) + (bwCount * priceBw);
        const saved = Math.max(0, totalAllColor - totalSplit);
        const percent = totalAllColor > 0 ? Math.round((saved / totalAllColor) * 100) : 0;

        if (costAllColor) costAllColor.textContent = formatRupiah(totalAllColor);
        if (costSplit) costSplit.textContent = formatRupiah(totalSplit);
        if (valMoneySaved) valMoneySaved.textContent = formatRupiah(saved);
        if (valSavingsPercent) valSavingsPercent.textContent = `HEMAT ${percent}%`;
    }

    function renderThumbnails() {
        if (!thumbnailsGrid) return;
        thumbnailsGrid.innerHTML = '';

        const filteredPages = pagesData.filter(p => {
            if (activeFilter === 'color') return p.category === 'color';
            if (activeFilter === 'bw') return p.category === 'bw';
            return true;
        });

        if (filteredPages.length === 0) {
            thumbnailsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--skeuo-text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 8px;"></i>
                    <p>Tidak ada halaman untuk kategori ini.</p>
                </div>
            `;
            return;
        }

        filteredPages.forEach(page => {
            const isColor = page.category === 'color';
            const card = document.createElement('div');
            card.className = `thumb-card ${isColor ? 'is-color' : 'is-bw'}`;

            card.innerHTML = `
                <div class="thumb-img-wrapper">
                    <img src="${page.thumbnail}" alt="Hal ${page.page_number}" loading="lazy">
                    <span class="thumb-badge ${isColor ? 'badge-color-tag' : 'badge-bw-tag'}">
                        ${isColor ? 'Berwarna' : 'Hitam-Putih'}
                    </span>
                </div>
                <div class="thumb-details">
                    <div class="thumb-meta">
                        <span>Hal ${page.page_number}</span>
                        <small style="opacity: 0.7;">${page.color_score}% warna</small>
                    </div>
                    <button class="btn-toggle-cat ${isColor ? 'to-bw' : 'to-color'}" data-page="${page.page_number}" type="button">
                        <i class="fa-solid ${isColor ? 'fa-font' : 'fa-palette'}"></i>
                        ${isColor ? 'Ubah ke B/W' : 'Ubah ke Warna'}
                    </button>
                </div>
            `;

            const toggleBtn = card.querySelector('.btn-toggle-cat');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    page.category = page.category === 'color' ? 'bw' : 'color';
                    updateUI();
                });
            }

            card.addEventListener('click', () => {
                openPreview(page.page_number);
            });

            thumbnailsGrid.appendChild(card);
        });
    }

    async function triggerPdfGeneration(targetType, btnElement) {
        if (!originalFileBuffer) {
            alert("File tidak ditemukan. Silakan unggah ulang dokumen.");
            return;
        }
        if (typeof PDFLib === 'undefined' || typeof JSZip === 'undefined') {
            alert('Library pdf-lib / JSZip belum termuat. Periksa koneksi internet Anda.');
            return;
        }

        if (btnElement) {
            btnElement.disabled = true;
            btnElement.style.opacity = '0.6';
        }

        try {
            // Load the original bytes and split pages into Color / B&W documents.
            const srcDoc = await PDFLib.PDFDocument.load(originalFileBuffer);
            const colorIndices = [];
            const bwIndices = [];
            pagesData.forEach(p => {
                const idx = p.page_number - 1;
                if (p.category === 'color') colorIndices.push(idx);
                else bwIndices.push(idx);
            });

            const built = {};

            if (colorIndices.length > 0) {
                const colorDoc = await PDFLib.PDFDocument.create();
                const colorPages = await colorDoc.copyPages(srcDoc, colorIndices);
                colorPages.forEach(p => colorDoc.addPage(p));
                built.color = await colorDoc.save();
            }

            if (bwIndices.length > 0) {
                const bwDoc = await PDFLib.PDFDocument.create();
                const bwPages = await bwDoc.copyPages(srcDoc, bwIndices);
                bwPages.forEach(p => bwDoc.addPage(p));
                built.bw = await bwDoc.save();
            }

            // Download requested output(s).
            if (targetType === 'zip') {
                const zip = new JSZip();
                if (built.color) zip.file('Dokumen_Berwarna.pdf', built.color);
                if (built.bw) zip.file('Dokumen_Hitam_Putih.pdf', built.bw);
                downloadBlob(await zip.generateAsync({ type: 'blob' }), 'Paket_Cetak_PDF.zip');
            } else if (targetType === 'color' && built.color) {
                downloadBlob(new Blob([built.color], { type: 'application/pdf' }), 'Dokumen_Berwarna.pdf');
            } else if (targetType === 'bw' && built.bw) {
                downloadBlob(new Blob([built.bw], { type: 'application/pdf' }), 'Dokumen_Hitam_Putih.pdf');
            } else {
                alert('Tidak ada halaman untuk kategori ini.');
            }

        } catch (error) {
            alert(`Gagal mengunduh file: ${error.message}`);
        } finally {
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.style.opacity = '1';
            }
        }
    }

    function resetApp() {
        closePreview();
        currentPdfDoc = null;
        originalFileBuffer = null;
        originalData = null;
        pagesData = [];
        if (fileInput) {
            fileInput.value = '';
        }
        if (progressBarFill) {
            progressBarFill.style.width = '0%';
        }
        activeFilter = 'all';

        // Reset filter button styles
        filterBtns.forEach(btn => {
            if (btn.getAttribute('data-filter') === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (uploadSection) uploadSection.classList.remove('hidden');
        if (progressSection) progressSection.classList.add('hidden');
        if (resultsSection) resultsSection.classList.add('hidden');

        // Smooth scroll to top of page
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function formatRupiah(amount) {
        return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
    }
    }

    SP.register({
        id: 'colorsplit', category: 'optimize', icon: 'fa-palette', hue: 'gold', featured: true,
        title: 'Pisah Warna & Hitam-Putih',
        desc: 'Pisahkan halaman berwarna dan hitam-putih otomatis untuk hemat biaya cetak skripsi.',
        keywords: 'color warna bw hitam putih cetak print skripsi hemat separate',
        mount: mountColorSplit,
    });
})();
