/**
 * SeparaPDF - Main JavaScript Application Controller
 */

// =============================================================
// CONFIG: Ganti nilai ini dengan URL Hugging Face Space kamu
// setelah deploy backend. Format: https://USERNAME-SPACENAME.hf.space
// =============================================================
const API_BASE_URL = window.SEPARA_API_URL || 'https://GANTI-DENGAN-URL-HF-SPACE-KAMU.hf.space';

document.addEventListener('DOMContentLoaded', () => {
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

    // --- State Variables ---
    let currentSessionId = null;
    let originalData = null; // Copy of API analysis response
    let pagesData = []; // Array of page objects with dynamic manual overrides
    let activeFilter = 'all';

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

        uploadFileAndAnalyze(file);
    }

    async function uploadFileAndAnalyze(file) {
        // Show progress view
        uploadSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        progressBarFill.style.width = '20%';
        progressTitle.textContent = `Memindai ${file.name}...`;
        scanStatus.textContent = 'Mengunggah file ke server...';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('threshold', thresholdRange.value);

        try {
            progressBarFill.style.width = '50%';
            scanStatus.textContent = 'Menganalisis piksel channel warna di setiap halaman...';

            const response = await fetch(`${API_BASE_URL}/api/analyze`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Gagal memproses file PDF.');
            }

            progressBarFill.style.width = '90%';
            scanStatus.textContent = 'Menyusun visual thumbnail halaman...';

            const data = await response.json();
            
            progressBarFill.style.width = '100%';
            
            // Save state
            currentSessionId = data.session_id;
            originalData = data;
            pagesData = JSON.parse(JSON.stringify(data.pages));

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
                toggleBtn.addEventListener('click', () => {
                    page.category = page.category === 'color' ? 'bw' : 'color';
                    updateUI();
                });
            }

            thumbnailsGrid.appendChild(card);
        });
    }

    async function triggerPdfGeneration(targetType, btnElement) {
        if (!currentSessionId) {
            alert("Sesi tidak ditemukan. Silakan unggah ulang dokumen.");
            return;
        }

        const payload = {
            session_id: currentSessionId,
            pages: pagesData.map(p => ({ page_number: p.page_number, category: p.category })),
            color_price: parseFloat(inputPriceColor ? inputPriceColor.value : 1000) || 1000,
            bw_price: parseFloat(inputPriceBw ? inputPriceBw.value : 250) || 250
        };

        if (btnElement) {
            btnElement.disabled = true;
            btnElement.style.opacity = '0.6';
        }

        try {
            // Send updated classifications to generate split PDFs
            const genRes = await fetch(`${API_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!genRes.ok) {
                const errData = await genRes.json();
                throw new Error(errData.detail || 'Gagal menghasilkan PDF.');
            }

            // Reliable file download using an anchor element
            const downloadUrl = `${API_BASE_URL}/api/download/${currentSessionId}/${targetType}`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', '');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

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
        currentSessionId = null;
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
});
