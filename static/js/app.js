/**
 * SeparaPDF - Main JavaScript Application Controller
 */

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
    toggleSettings.addEventListener('click', () => {
        settingsBody.classList.toggle('open');
        const icon = toggleSettings.querySelector('.caret-icon');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });

    thresholdRange.addEventListener('input', (e) => {
        thresholdVal.textContent = e.target.value;
    });

    // Drag & Drop
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

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Price Input Listeners
    inputPriceColor.addEventListener('input', updateCostCalculator);
    inputPriceBw.addEventListener('input', updateCostCalculator);

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

    btnResetCategories.addEventListener('click', () => {
        if (originalData) {
            pagesData = JSON.parse(JSON.stringify(originalData.pages));
            updateUI();
        }
    });

    // Download Handlers
    btnDownloadColor.addEventListener('click', () => triggerPdfGeneration('color'));
    btnDownloadBw.addEventListener('click', () => triggerPdfGeneration('bw'));
    btnDownloadZip.addEventListener('click', () => triggerPdfGeneration('zip'));

    btnResetApp.addEventListener('click', resetApp);

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

            const response = await fetch('/api/analyze', {
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
        valTotalPages.textContent = total;
        valColorPages.textContent = colorCount;
        valBwPages.textContent = bwCount;

        // Filter Counts
        countFilterAll.textContent = total;
        countFilterColor.textContent = colorCount;
        countFilterBw.textContent = bwCount;

        // Subtexts on Download Buttons
        subTextDownloadColor.textContent = `${colorCount} Halaman`;
        subTextDownloadBw.textContent = `${bwCount} Halaman`;

        btnDownloadColor.disabled = colorCount === 0;
        btnDownloadBw.disabled = bwCount === 0;

        updateCostCalculator();
        renderThumbnails();
    }

    function updateCostCalculator() {
        const total = pagesData.length;
        const colorCount = pagesData.filter(p => p.category === 'color').length;
        const bwCount = pagesData.filter(p => p.category === 'bw').length;

        const priceColor = parseFloat(inputPriceColor.value) || 0;
        const priceBw = parseFloat(inputPriceBw.value) || 0;

        const totalAllColor = total * priceColor;
        const totalSplit = (colorCount * priceColor) + (bwCount * priceBw);
        const saved = Math.max(0, totalAllColor - totalSplit);
        const percent = totalAllColor > 0 ? Math.round((saved / totalAllColor) * 100) : 0;

        costAllColor.textContent = formatRupiah(totalAllColor);
        costSplit.textContent = formatRupiah(totalSplit);
        valMoneySaved.textContent = formatRupiah(saved);
        valSavingsPercent.textContent = `Hemat ${percent}%`;
    }

    function renderThumbnails() {
        thumbnailsGrid.innerHTML = '';

        const filteredPages = pagesData.filter(p => {
            if (activeFilter === 'color') return p.category === 'color';
            if (activeFilter === 'bw') return p.category === 'bw';
            return true;
        });

        if (filteredPages.length === 0) {
            thumbnailsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
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
                        <span><strong>Hal ${page.page_number}</strong></span>
                        <small style="opacity: 0.7;">${page.color_score}% warna</small>
                    </div>
                    <button class="btn-toggle-cat ${isColor ? 'to-bw' : 'to-color'}" data-page="${page.page_number}">
                        <i class="fa-solid ${isColor ? 'fa-font' : 'fa-palette'}"></i>
                        ${isColor ? 'Ubah ke B/W' : 'Ubah ke Warna'}
                    </button>
                </div>
            `;

            const toggleBtn = card.querySelector('.btn-toggle-cat');
            toggleBtn.addEventListener('click', () => {
                page.category = page.category === 'color' ? 'bw' : 'color';
                updateUI();
            });

            thumbnailsGrid.appendChild(card);
        });
    }

    async function triggerPdfGeneration(targetType) {
        if (!currentSessionId) return;

        const payload = {
            session_id: currentSessionId,
            pages: pagesData.map(p => ({ page_number: p.page_number, category: p.category })),
            color_price: parseFloat(inputPriceColor.value) || 1000,
            bw_price: parseFloat(inputPriceBw.value) || 250
        };

        try {
            // Send updated classifications to generate split PDFs
            const genRes = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!genRes.ok) {
                const errData = await genRes.json();
                throw new Error(errData.detail || 'Gagal menghasilkan PDF.');
            }

            // Trigger file download
            window.location.href = `/api/download/${currentSessionId}/${targetType}`;

        } catch (error) {
            alert(`Gagal mengunduh file: ${error.message}`);
        }
    }

    function resetApp() {
        currentSessionId = null;
        originalData = null;
        pagesData = [];
        fileInput.value = '';
        progressBarFill.style.width = '0%';

        uploadSection.classList.remove('hidden');
        progressSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
    }

    function formatRupiah(amount) {
        return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
    }
});
