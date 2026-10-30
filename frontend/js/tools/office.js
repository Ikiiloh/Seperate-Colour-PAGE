/**
 * NoPDF - Office Document Converters:
 * 1. DOCX to PDF (Word ke PDF)
 * 2. XLSX to PDF (Excel ke PDF)
 * 3. PDF to DOCX (PDF ke Word - Tata Letak Presisi, Gambar & Tabel)
 *
 * Runs 100% client-side in the browser using docx-preview, mammoth, SheetJS,
 * pdf.js, html2canvas, and pdf-lib. No server, completely offline & private.
 */
(function () {
    'use strict';

    const PAGE_SIZES = {
        a4: [595.28, 841.89],
        letter: [612, 792],
    };


    // ====================================================================
    // 1. WORD (DOCX) -> PDF
    // ====================================================================
    function mountDocx2Pdf(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        const drop = SP.dropzone({
            accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            multiple: false,
            icon: 'fa-file-word',
            title: 'Tarik & lepaskan file Word (.docx) di sini',
            spec: 'Format .docx | Diproses 100% lokal & offline di browsermu',
            filter: (f) => /\.docx$/i.test(f.name),
            onFiles: (files) => initDocx(files[0]),
        });
        stage.appendChild(drop);

        async function initDocx(file) {
            stage.innerHTML = '';

            // File summary bar
            const bar = SP.h(`
                <div class="file-bar skeuo-inset-panel">
                    <i class="fa-solid fa-file-word file-bar-icon word"></i>
                    <div class="file-bar-info">
                        <strong class="file-bar-name"></strong>
                        <small></small>
                    </div>
                    <button type="button" class="skeuo-btn-sm"><i class="fa-solid fa-rotate"></i> Ganti file</button>
                </div>`);
            bar.querySelector('strong').textContent = file.name;
            bar.querySelector('small').textContent = `${SP.fmtSize(file.size)} • Dokumen Microsoft Word`;
            bar.querySelector('button').addEventListener('click', ctx.reset);
            stage.appendChild(bar);

            // Options panel
            const panel = SP.h(`
                <div class="skeuo-card tool-options">
                    <div class="opt-grid">
                        <div class="field">
                            <label>Ukuran Kertas</label>
                            <select class="text-input" id="docxSize">
                                <option value="a4" selected>A4 (210 × 297 mm)</option>
                                <option value="letter">Letter (8.5 × 11 in)</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Orientasi Halaman</label>
                            <select class="text-input" id="docxOri">
                                <option value="auto" selected>Otomatis (Sesuai Dokumen)</option>
                                <option value="p">Potret (Tegak)</option>
                                <option value="l">Lanskap (Mendatar)</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Kualitas Teks / Render</label>
                            <select class="text-input" id="docxQuality">
                                <option value="ultra" selected>Ultra Tajam (2.2x DPI - Rekomendasi)</option>
                                <option value="standard">Standar (Lebih Cepat - 1.5x DPI)</option>
                            </select>
                        </div>
                    </div>
                    <p class="opt-hint"><i class="fa-solid fa-circle-info"></i> Tampilan dokumen dipertahankan sesuai format asli Word (font, paragraf, tabel, gambar).</p>
                </div>`);
            stage.appendChild(panel);

            // Preview Section
            const previewCard = SP.h(`
                <div class="skeuo-card office-preview-card">
                    <div class="office-preview-header">
                        <span><i class="fa-solid fa-eye"></i> Pratinjau Dokumen</span>
                        <span class="preview-badge" id="docxPageCount">Memuat...</span>
                    </div>
                    <div class="office-preview-scroll" id="docxPreviewContainer">
                        <div class="office-loading"><i class="fa-solid fa-spinner fa-spin"></i> Merender pratinjau dokumen...</div>
                    </div>
                </div>`);
            stage.appendChild(previewCard);

            const container = previewCard.querySelector('#docxPreviewContainer');
            const pageBadge = previewCard.querySelector('#docxPageCount');

            // Action bar
            const action = SP.actionBar({
                label: 'Konversi ke PDF',
                icon: 'fa-file-pdf',
                onClick: processDocx,
            });
            action.setDisabled(true);
            action.setSummary('Mempersiapkan dokumen...');
            stage.appendChild(action.el);

            let buffer = null;

            try {
                buffer = await file.arrayBuffer();
                let renderSuccess = false;

                if (typeof docx !== 'undefined' && docx.renderAsync) {
                    try {
                        container.innerHTML = '';
                        await docx.renderAsync(buffer, container, null, {
                            inWrapper: true,
                            ignoreWidth: false,
                            ignoreHeight: false,
                            breakPages: true,
                            renderHeaders: true,
                            renderFooters: true,
                        });
                        const secCount = container.querySelectorAll('section.docx, .docx-wrapper').length;
                        renderSuccess = secCount > 0;
                    } catch (e) {
                        console.warn('docx-preview failed, attempting mammoth fallback:', e);
                        renderSuccess = false;
                    }
                }

                if (!renderSuccess && typeof mammoth !== 'undefined') {
                    const res = await mammoth.convertToHtml({ arrayBuffer: buffer });
                    container.innerHTML = '';
                    const pageEl = SP.h('<div class="mammoth-docx-page"></div>');
                    pageEl.innerHTML = res.value || '<p>Dokumen tidak memiliki teks terbaca.</p>';
                    container.appendChild(pageEl);
                    renderSuccess = true;
                }

                if (!renderSuccess && !container.firstElementChild) {
                    container.innerHTML = '<div class="mammoth-docx-page"><p>Format dokumen Word siap dikonversi ke PDF.</p></div>';
                }

                const detectedPages = container.querySelectorAll('section.docx').length || 1;
                pageBadge.textContent = `${detectedPages} Halaman terdeteksi`;
                action.setSummary(`<b>${file.name}</b> • Siap dikonversi (${detectedPages} halaman)`);
                action.setDisabled(false);
            } catch (err) {
                console.error(err);
                container.innerHTML = `<p class="err"><i class="fa-solid fa-triangle-exclamation"></i> Gagal membaca file: ${SP.esc(err.message)}</p>`;
                pageBadge.textContent = 'Gagal';
                action.setSummary('<span class="err">Dokumen tidak dapat dibaca</span>');
            }

            async function processDocx() {
                const sizeKey = panel.querySelector('#docxSize').value;
                const oriVal = panel.querySelector('#docxOri').value;
                const qualityVal = panel.querySelector('#docxQuality').value;
                const scaleVal = qualityVal === 'ultra' ? 2.2 : 1.5;

                const pdfBytes = await SP.run('Mengonversi Word ke PDF...', async (progress) => {
                    if (typeof PDFLib === 'undefined') throw new Error('Library PDFLib belum termuat.');
                    if (typeof html2canvas === 'undefined') throw new Error('Library html2canvas belum termuat.');

                    const doc = await PDFLib.PDFDocument.create();

                    let sections = Array.from(container.querySelectorAll('section.docx'));
                    if (!sections.length) {
                        const wrapper = container.querySelector('.docx-wrapper, .mammoth-docx-page');
                        if (wrapper) sections = [wrapper];
                    }
                    if (!sections.length && container.firstElementChild) {
                        sections = [container.firstElementChild];
                    }

                    if (!sections.length) {
                        throw new Error('Tidak ada konten yang dapat dikonversi ke PDF.');
                    }

                    const total = sections.length;
                    let i = 0;

                    for (const sec of sections) {
                        i++;
                        progress(((i - 1) / total) * 88, `Merender halaman ${i} dari ${total}...`);

                        const stageWrapper = document.createElement('div');
                        stageWrapper.className = 'docx-stage-wrapper';
                        stageWrapper.style.position = 'fixed';
                        stageWrapper.style.top = '0';
                        stageWrapper.style.left = '0';
                        stageWrapper.style.width = '850px';
                        stageWrapper.style.minHeight = '1100px';
                        stageWrapper.style.background = '#ffffff';
                        stageWrapper.style.zIndex = '-99999';
                        stageWrapper.style.opacity = '0.01';
                        stageWrapper.style.pointerEvents = 'none';

                        container.querySelectorAll('style').forEach((st) => {
                            stageWrapper.appendChild(st.cloneNode(true));
                        });

                        const clone = sec.cloneNode(true);
                        clone.style.margin = '0 auto';
                        clone.style.boxShadow = 'none';
                        stageWrapper.appendChild(clone);
                        document.body.appendChild(stageWrapper);

                        let canvas;
                        try {
                            canvas = await html2canvas(stageWrapper, {
                                scale: scaleVal,
                                useCORS: true,
                                logging: false,
                                backgroundColor: '#ffffff',
                                width: stageWrapper.offsetWidth || 850,
                            });
                        } finally {
                            stageWrapper.remove();
                        }

                        if (!canvas || canvas.width === 0 || canvas.height === 0) {
                            throw new Error(`Gagal merender halaman ${i}. Ukuran canvas tidak valid.`);
                        }

                        let [pw, ph] = PAGE_SIZES[sizeKey] || PAGE_SIZES.a4;
                        const isLandscape = oriVal === 'l' || (oriVal === 'auto' && canvas.width > canvas.height);
                        if (isLandscape && pw < ph) [pw, ph] = [ph, pw];
                        if (!isLandscape && pw > ph) [pw, ph] = [ph, pw];

                        const pageAspect = ph / pw;
                        const canvasAspect = canvas.height / canvas.width;

                        if (canvasAspect > pageAspect * 1.35) {
                            const sliceHeightPx = Math.round(canvas.width * pageAspect);
                            let yOffset = 0;

                            while (yOffset < canvas.height) {
                                const currentChunkH = Math.min(sliceHeightPx, canvas.height - yOffset);
                                const sliceCanvas = document.createElement('canvas');
                                sliceCanvas.width = canvas.width;
                                sliceCanvas.height = sliceHeightPx;
                                const sCtx = sliceCanvas.getContext('2d');
                                sCtx.fillStyle = '#ffffff';
                                sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                                sCtx.drawImage(
                                    canvas,
                                    0, yOffset, canvas.width, currentChunkH,
                                    0, 0, canvas.width, currentChunkH
                                );

                                const sliceBlob = await SP.canvasToBlob(sliceCanvas, 'image/jpeg', 0.95);
                                const sliceBytes = await sliceBlob.arrayBuffer();
                                const embeddedSlice = await doc.embedJpg(sliceBytes);

                                const page = doc.addPage([pw, ph]);
                                page.drawImage(embeddedSlice, { x: 0, y: 0, width: pw, height: ph });

                                SP.freeCanvas(sliceCanvas);
                                yOffset += sliceHeightPx;
                            }
                        } else {
                            const blob = await SP.canvasToBlob(canvas, 'image/jpeg', 0.95);
                            const imgBytes = await blob.arrayBuffer();
                            const embedded = await doc.embedJpg(imgBytes);

                            const page = doc.addPage([pw, ph]);
                            const scale = Math.min(pw / canvas.width, ph / canvas.height);
                            const drawW = canvas.width * scale;
                            const drawH = canvas.height * scale;

                            page.drawImage(embedded, {
                                x: (pw - drawW) / 2,
                                y: (ph - drawH) / 2,
                                width: drawW,
                                height: drawH,
                            });
                        }

                        SP.freeCanvas(canvas);
                        await SP.tick();
                    }

                    if (doc.getPageCount() === 0) {
                        throw new Error('Dokumen PDF kosong. Gagal membuat halaman.');
                    }

                    progress(95, 'Menyusun dokumen PDF...');
                    return await doc.save();
                });

                if (!pdfBytes || pdfBytes.length === 0) return;

                stage.innerHTML = '';
                const base = SP.baseName(file.name);
                const outName = `${base}.pdf`;
                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

                stage.appendChild(SP.resultCard({
                    blob: pdfBlob,
                    filename: outName,
                    lines: [
                        `Dokumen Word <b>"${SP.esc(file.name)}"</b> berhasil diubah menjadi PDF.`,
                        `Diproses langsung di browser secara aman & private.`,
                    ],
                    onAgain: ctx.reset,
                }));
            }
        }
    }

    // ====================================================================
    // 2. EXCEL (XLSX, XLS, CSV) -> PDF
    // ====================================================================
    function mountXlsx2Pdf(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        const drop = SP.dropzone({
            accept: '.xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv',
            multiple: false,
            icon: 'fa-file-excel',
            title: 'Tarik & lepaskan file Excel (.xlsx, .xls, .csv) di sini',
            spec: 'XLSX, XLS, CSV | 100% diproses di browser tanpa upload ke server',
            filter: (f) => /\.(xlsx|xls|csv|ods)$/i.test(f.name),
            onFiles: (files) => initXlsx(files[0]),
        });
        stage.appendChild(drop);

        async function initXlsx(file) {
            stage.innerHTML = '';

            const bar = SP.h(`
                <div class="file-bar skeuo-inset-panel">
                    <i class="fa-solid fa-file-excel file-bar-icon excel"></i>
                    <div class="file-bar-info">
                        <strong class="file-bar-name"></strong>
                        <small></small>
                    </div>
                    <button type="button" class="skeuo-btn-sm"><i class="fa-solid fa-rotate"></i> Ganti file</button>
                </div>`);
            bar.querySelector('strong').textContent = file.name;
            bar.querySelector('small').textContent = `${SP.fmtSize(file.size)} • Lembar Kerja Spreadsheet`;
            bar.querySelector('button').addEventListener('click', ctx.reset);
            stage.appendChild(bar);

            let workbook;
            try {
                if (typeof XLSX === 'undefined') throw new Error('Library SheetJS (XLSX) belum termuat.');
                const ab = await file.arrayBuffer();
                workbook = XLSX.read(ab, { type: 'array', cellDates: true });
            } catch (err) {
                console.error(err);
                stage.appendChild(SP.h(`
                    <div class="skeuo-card">
                        <p class="err"><i class="fa-solid fa-triangle-exclamation"></i> Gagal membuka file Excel: ${SP.esc(err.message)}</p>
                        <button type="button" class="skeuo-btn-sm" style="margin-top:10px;"><i class="fa-solid fa-rotate-left"></i> Coba file lain</button>
                    </div>`));
                stage.querySelector('button').addEventListener('click', ctx.reset);
                return;
            }

            const sheetNames = workbook.SheetNames || [];
            if (!sheetNames.length) {
                SP.toast('File Excel tidak memiliki lembar kerja (sheet).', 'error');
                ctx.reset();
                return;
            }

            const panel = SP.h(`
                <div class="skeuo-card tool-options">
                    <div class="opt-grid">
                        <div class="field">
                            <label>Pilih Lembar (Sheet)</label>
                            <select class="text-input" id="xlsxSheet"></select>
                        </div>
                        <div class="field">
                            <label>Orientasi Halaman</label>
                            <select class="text-input" id="xlsxOri">
                                <option value="l" selected>Lanskap (Mendatar - Disarankan)</option>
                                <option value="p">Potret (Tegak)</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Ukuran Kertas</label>
                            <select class="text-input" id="xlsxSize">
                                <option value="a4" selected>A4</option>
                                <option value="letter">Letter</option>
                            </select>
                        </div>
                    </div>
                    <div class="opt-row">
                        <label class="chk">
                            <input type="checkbox" id="xlsxGrid" checked>
                            <span>Tampilkan garis kisi tabel (gridlines)</span>
                        </label>
                        <label class="chk">
                            <input type="checkbox" id="xlsxFit" checked>
                            <span>Sesuaikan lebar tabel agar pas di halaman (Fit to width)</span>
                        </label>
                        <label class="chk">
                            <input type="checkbox" id="xlsxPageNum" checked>
                            <span>Sertakan nomor halaman di bagian bawah</span>
                        </label>
                    </div>
                </div>`);

            const sheetSelect = panel.querySelector('#xlsxSheet');
            if (sheetNames.length > 1) {
                const optAll = document.createElement('option');
                optAll.value = '__all__';
                optAll.textContent = `Semua Sheet (${sheetNames.length} lembar kerja)`;
                sheetSelect.appendChild(optAll);
            }
            sheetNames.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sheetSelect.appendChild(opt);
            });

            stage.appendChild(panel);

            const previewCard = SP.h(`
                <div class="skeuo-card office-preview-card">
                    <div class="office-preview-header">
                        <span><i class="fa-solid fa-table"></i> Pratinjau Tabel Excel</span>
                        <span class="preview-badge" id="xlsxRowCount">Memuat data...</span>
                    </div>
                    <div class="office-preview-scroll">
                        <div class="xlsx-preview-container" id="xlsxPreviewWrap"></div>
                    </div>
                </div>`);
            stage.appendChild(previewCard);

            const previewWrap = previewCard.querySelector('#xlsxPreviewWrap');
            const rowBadge = previewCard.querySelector('#xlsxRowCount');

            const action = SP.actionBar({
                label: 'Konversi ke PDF',
                icon: 'fa-file-pdf',
                onClick: processXlsx,
            });
            stage.appendChild(action.el);

            function updatePreview() {
                const curSheet = sheetSelect.value === '__all__' ? sheetNames[0] : sheetSelect.value;
                const ws = workbook.Sheets[curSheet];
                if (!ws) {
                    previewWrap.innerHTML = '<p class="err">Sheet kosong atau tidak ditemukan.</p>';
                    return;
                }

                const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                const rows = data.filter((r) => r.some((c) => String(c).trim().length > 0));

                if (!rows.length) {
                    previewWrap.innerHTML = '<p class="opt-hint">Lembar kerja ini tidak memiliki data.</p>';
                    rowBadge.textContent = '0 Baris';
                    return;
                }

                rowBadge.textContent = `${rows.length} Baris data (${curSheet})`;

                const showGrid = panel.querySelector('#xlsxGrid').checked;
                let html = `<table class="xlsx-render-table ${showGrid ? '' : 'no-grid'}">`;
                rows.slice(0, 40).forEach((row, rIdx) => {
                    const tag = rIdx === 0 ? 'th' : 'td';
                    html += '<tr>';
                    row.forEach((cell) => {
                        html += `<${tag}>${SP.esc(cell != null ? String(cell) : '')}</${tag}>`;
                    });
                    html += '</tr>';
                });
                html += '</table>';
                if (rows.length > 40) {
                    html += `<p class="opt-hint" style="margin-top:10px;text-align:center;">... Menampilkan 40 dari ${rows.length} baris (semua akan dicetak ke PDF) ...</p>`;
                }
                previewWrap.innerHTML = html;

                action.setSummary(`<b>${file.name}</b> • Sheet: <b>${SP.esc(sheetSelect.value === '__all__' ? 'Semua Sheet' : sheetSelect.value)}</b>`);
            }

            sheetSelect.addEventListener('change', updatePreview);
            panel.querySelector('#xlsxGrid').addEventListener('change', updatePreview);
            updatePreview();

            async function processXlsx() {
                const targetSheetVal = sheetSelect.value;
                const sheetsToProcess = targetSheetVal === '__all__' ? sheetNames : [targetSheetVal];
                const oriVal = panel.querySelector('#xlsxOri').value;
                const sizeKey = panel.querySelector('#xlsxSize').value;
                const showGrid = panel.querySelector('#xlsxGrid').checked;
                const fitWidth = panel.querySelector('#xlsxFit').checked;
                const addPageNum = panel.querySelector('#xlsxPageNum').checked;

                const pdfBytes = await SP.run('Mengonversi Excel ke PDF...', async (progress) => {
                    if (typeof PDFLib === 'undefined') throw new Error('Library PDFLib belum termuat.');
                    if (typeof html2canvas === 'undefined') throw new Error('Library html2canvas belum termuat.');

                    const doc = await PDFLib.PDFDocument.create();

                    let [pw, ph] = PAGE_SIZES[sizeKey] || PAGE_SIZES.a4;
                    if (oriVal === 'l' && pw < ph) [pw, ph] = [ph, pw];
                    if (oriVal === 'p' && pw > ph) [pw, ph] = [ph, pw];

                    const containerWidthPx = oriVal === 'l' ? 1120 : 794;
                    const printableHeightPx = oriVal === 'l' ? 700 : 980;

                    let totalPagesAdded = 0;
                    let currentSheetIndex = 0;

                    for (const sName of sheetsToProcess) {
                        currentSheetIndex++;
                        progress(
                            ((currentSheetIndex - 1) / sheetsToProcess.length) * 85,
                            `Memproses sheet "${sName}" (${currentSheetIndex} dari ${sheetsToProcess.length})...`
                        );

                        const ws = workbook.Sheets[sName];
                        if (!ws) continue;

                        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                        const rows = rawData.filter((r) => r.some((c) => String(c).trim().length > 0));
                        if (!rows.length) continue;

                        const headerRow = rows[0];
                        const bodyRows = rows.slice(1);

                        const rowsPerPage = oriVal === 'l' ? 20 : 32;
                        const chunkCount = Math.ceil(bodyRows.length / rowsPerPage) || 1;

                        for (let pageIdx = 0; pageIdx < chunkCount; pageIdx++) {
                            const chunk = bodyRows.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);

                            const pageWrapper = document.createElement('div');
                            pageWrapper.style.position = 'fixed';
                            pageWrapper.style.left = '0';
                            pageWrapper.style.top = '0';
                            pageWrapper.style.width = `${containerWidthPx}px`;
                            pageWrapper.style.minHeight = `${printableHeightPx}px`;
                            pageWrapper.style.background = '#ffffff';
                            pageWrapper.style.color = '#0f172a';
                            pageWrapper.style.padding = '36px 40px';
                            pageWrapper.style.boxSizing = 'border-box';
                            pageWrapper.style.fontFamily = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
                            pageWrapper.style.zIndex = '-99999';
                            pageWrapper.style.opacity = '0.01';
                            pageWrapper.style.pointerEvents = 'none';

                            let pageHtml = `
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 16px;">
                                    <div>
                                        <h2 style="margin:0; font-size: 1.25rem; color: #0369a1; font-weight: 800;">${SP.esc(sName)}</h2>
                                        <span style="font-size: 0.78rem; color: #64748b;">${SP.esc(file.name)}</span>
                                    </div>
                                    <span style="font-size: 0.8rem; font-weight: 600; color: #64748b;">Halaman ${pageIdx + 1} dari ${chunkCount}</span>
                                </div>
                            `;

                            pageHtml += `
                                <table class="xlsx-render-table ${showGrid ? '' : 'no-grid'}" style="width: 100%; table-layout: ${fitWidth ? 'auto' : 'auto'}; border-collapse: collapse;">
                                    <thead>
                                        <tr>
                            `;
                            headerRow.forEach((col) => {
                                pageHtml += `<th style="background:#f1f5f9; color:#0f172a; font-weight:700; padding:8px 10px; border:${showGrid ? '1px solid #cbd5e1' : 'none'}; text-align:left; font-size:0.84rem;">${SP.esc(String(col))}</th>`;
                            });
                            pageHtml += `
                                        </tr>
                                    </thead>
                                    <tbody>
                            `;

                            chunk.forEach((row, rSubIdx) => {
                                const bg = rSubIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
                                pageHtml += `<tr style="background:${bg};">`;
                                for (let cIdx = 0; cIdx < headerRow.length; cIdx++) {
                                    const val = row[cIdx] != null ? String(row[cIdx]) : '';
                                    pageHtml += `<td style="padding:6px 10px; border:${showGrid ? '1px solid #e2e8f0' : 'none'}; text-align:left; font-size:0.8rem; overflow-wrap: break-word;">${SP.esc(val)}</td>`;
                                }
                                pageHtml += '</tr>';
                            });

                            pageHtml += `
                                    </tbody>
                                </table>
                            `;

                            if (addPageNum) {
                                pageHtml += `
                                    <div style="margin-top: 24px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                                        <span>NoPDF — Konversi Excel Offline</span>
                                        <span>${sName} • Hal ${pageIdx + 1}/${chunkCount}</span>
                                    </div>
                                `;
                            }

                            pageWrapper.innerHTML = pageHtml;
                            document.body.appendChild(pageWrapper);

                            let canvas;
                            try {
                                canvas = await html2canvas(pageWrapper, {
                                    scale: 2,
                                    useCORS: true,
                                    logging: false,
                                    backgroundColor: '#ffffff',
                                });
                            } finally {
                                pageWrapper.remove();
                            }

                            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                                throw new Error('Gagal merender lembar kerja ke canvas.');
                            }

                            const blob = await SP.canvasToBlob(canvas, 'image/jpeg', 0.95);
                            const imgBytes = await blob.arrayBuffer();
                            const embedded = await doc.embedJpg(imgBytes);

                            const page = doc.addPage([pw, ph]);
                            const scale = Math.min(pw / canvas.width, ph / canvas.height);
                            const drawW = canvas.width * scale;
                            const drawH = canvas.height * scale;

                            page.drawImage(embedded, {
                                x: (pw - drawW) / 2,
                                y: (ph - drawH) / 2,
                                width: drawW,
                                height: drawH,
                            });

                            SP.freeCanvas(canvas);
                            totalPagesAdded++;
                            await SP.tick();
                        }
                    }

                    if (totalPagesAdded === 0) {
                        throw new Error('Tidak ada data yang dapat dikonversi dari file Excel ini.');
                    }

                    progress(95, 'Menyimpan dokumen PDF...');
                    return await doc.save();
                });

                if (!pdfBytes || pdfBytes.length === 0) return;

                stage.innerHTML = '';
                const base = SP.baseName(file.name);
                const outName = `${base}.pdf`;
                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

                stage.appendChild(SP.resultCard({
                    blob: pdfBlob,
                    filename: outName,
                    lines: [
                        `File Excel <b>"${SP.esc(file.name)}"</b> berhasil diubah menjadi PDF.`,
                        `Total <b>${sheetsToProcess.length}</b> sheet diproses 100% lokal di browser.`,
                    ],
                    onAgain: ctx.reset,
                }));
            }
        }
    }

    // ====================================================================
    // REGISTRATION
    // ====================================================================
    SP.register({
        id: 'docx2pdf',
        category: 'to-pdf',
        icon: 'fa-file-word',
        hue: 'blue',
        title: 'Word ke PDF',
        desc: 'Ubah dokumen Word (.docx) menjadi file PDF rapi dengan tata letak asli.',
        keywords: 'word docx doc docx2pdf convert ubah dokumen surat skripsi',
        mount: mountDocx2Pdf,
    });

    SP.register({
        id: 'xlsx2pdf',
        category: 'to-pdf',
        icon: 'fa-file-excel',
        hue: 'green',
        title: 'Excel ke PDF',
        desc: 'Ubah lembar kerja Excel (.xlsx, .xls, .csv) menjadi dokumen PDF tabel rapi.',
        keywords: 'excel xlsx xls csv spreadsheet tabel sheet convert ubah data',
        mount: mountXlsx2Pdf,
    });
})();
