/** Compress PDF and PDF-to-grayscale. */
(function () {
    'use strict';

    // Levels that re-encode embedded images only (text/vector stay intact).
    // This never bloats text-heavy PDFs, unlike full-page rasterization.
    const LEVELS = [
        { id: 'struct', icon: 'fa-wand-magic-sparkles', name: 'Optimasi struktur', sub: 'Teks tetap bisa dipilih & dicari. Penghematan kecil.', mode: 'struct' },
        { id: 'light', icon: 'fa-feather', name: 'Ringan', sub: 'Kompres gambar (kualitas tinggi). Teks tetap utuh.', mode: 'img', q: 0.75, maxDim: 2000 },
        { id: 'medium', icon: 'fa-scale-balanced', name: 'Sedang', sub: 'Kompres gambar (seimbang). Teks tetap utuh.', mode: 'img', q: 0.55, maxDim: 1600, rec: true },
        { id: 'strong', icon: 'fa-compress', name: 'Maksimal', sub: 'Kompres gambar (paling kecil). Teks tetap utuh.', mode: 'img', q: 0.38, maxDim: 1200 },
    ];

    // Fallback: full-page image conversion for scanned PDFs.
    // Descriptions avoid jargon like "raster" or "DPI".
    const RASTER_LEVELS = [
        { id: 'light', icon: 'fa-feather', name: 'Ringan', sub: 'Kualitas tajam. Cocok untuk dokumen scan yang ingin tetap jelas.', mode: 'raster', dpi: 150, q: 0.7 },
        { id: 'medium', icon: 'fa-scale-balanced', name: 'Sedang', sub: 'Seimbang antara ukuran & kualitas. Untuk lampiran email/upload.', mode: 'raster', dpi: 110, q: 0.55, rec: true },
        { id: 'strong', icon: 'fa-compress', name: 'Maksimal', sub: 'Ukuran paling kecil. Kualitas agak menurun, cukup untuk dibaca.', mode: 'raster', dpi: 72, q: 0.4 },
    ];

    function choiceGrid(name, items, selected) {
        const grid = SP.h('<div class="choice-grid"></div>');
        items.forEach((it) => {
            const lab = SP.h(`
                <label class="choice">
                    <input type="radio" name="${name}" value="${it.id}" ${it.id === selected ? 'checked' : ''}>
                    <span class="choice-body">
                        <i class="fa-solid ${it.icon}"></i>
                        <strong>${it.name}${it.rec ? ' <em>disarankan</em>' : ''}</strong>
                        <small>${it.sub}</small>
                    </span>
                </label>`);
            grid.appendChild(lab);
        });
        return grid;
    }

    function mountCompress(root, ctx) {
        SP.singlePdf(root, ctx, {
            start(doc, stage) {
                const panel = SP.h('<div class="skeuo-card tool-options"><p class="opt-hint">Pilih tingkat kompresi.</p></div>');

                const gridWrap = SP.h('<div class="level-grid"></div>');
                let grid = choiceGrid('level', LEVELS, 'medium');
                gridWrap.appendChild(grid);
                panel.appendChild(gridWrap);

                // Toggle: full-page image mode for scanned PDFs (no "raster" jargon).
                const toggle = SP.h(`
                    <label class="scan-toggle">
                        <div class="scan-toggle-icon"><i class="fa-solid fa-camera"></i></div>
                        <div class="scan-toggle-text">
                            <strong>PDF ini hasil scan / foto</strong>
                            <small>Centang jika semua halaman adalah gambar (mis. hasil scan kamera). Mode ini mengubah tiap halaman jadi gambar — teks tidak bisa dipilih lagi.</small>
                        </div>
                        <div class="scan-switch">
                            <input type="checkbox" id="scanMode">
                            <span class="scan-slider"></span>
                        </div>
                    </label>`);
                panel.appendChild(toggle);

                const note = SP.h('<p class="note-warn hidden"><i class="fa-solid fa-triangle-exclamation"></i> Mode scan mengubah setiap halaman menjadi gambar, sehingga <b>teks tidak bisa lagi dipilih/dicari</b>. Hanya gunakan ini untuk PDF hasil scan/foto. Untuk PDF teks biasa (Word, dll.), biarkan tidak dicentang agar ukuran tidak membengkak.</p>');
                panel.appendChild(note);
                stage.appendChild(panel);

                const action = SP.actionBar({ label: 'Kompres PDF', icon: 'fa-compress', onClick: process });
                action.setSummary(`Ukuran asli: <b>${SP.fmtSize(doc.file.size)}</b>`);
                stage.appendChild(action.el);

                const cb = toggle.querySelector('input');
                const current = () => {
                    const items = cb.checked ? RASTER_LEVELS : LEVELS;
                    return items.find((l) => l.id === gridWrap.querySelector('input:checked').value);
                };
                const sync = () => {
                    note.classList.toggle('hidden', !cb.checked);
                    toggle.classList.toggle('active', cb.checked);
                    action.setSummary(`Ukuran asli: <b>${SP.fmtSize(doc.file.size)}</b> · ${cb.checked ? 'Mode scan' : 'Kompres gambar'}`);
                };
                panel.addEventListener('change', sync);

                // Rebuild the level grid when toggling scan mode.
                cb.addEventListener('change', () => {
                    const items = cb.checked ? RASTER_LEVELS : LEVELS;
                    const old = gridWrap.querySelector('.choice-grid');
                    const newGrid = choiceGrid('level', items, 'medium');
                    gridWrap.replaceChild(newGrid, old);
                    grid = newGrid;
                    sync();
                });
                sync();

                async function process() {
                    const lvl = current();
                    const out = await SP.run('Mengompres PDF...', async (progress) => {
                        if (lvl.mode === 'struct') {
                            const d = await SP.openPdfLib(doc.buffer, doc.file.name);
                            d.setProducer('NoPDF'); d.setCreator('NoPDF');
                            progress(50, 'Menyimpan...');
                            return d.save({ useObjectStreams: true });
                        }
                        if (lvl.mode === 'img') {
                            const d = await SP.openPdfLib(doc.buffer, doc.file.name);
                            progress(5, 'Memindai gambar...');
                            await SP.compressImages(d, {
                                quality: lvl.q, maxDim: lvl.maxDim,
                                onProgress: (i, t) => progress(5 + (i / t) * 90, `Mengompres gambar ${i} dari ${t}...`),
                            });
                            progress(96, 'Menyimpan...');
                            return d.save({ useObjectStreams: true });
                        }
                        // raster mode
                        return SP.rasterizePdf(doc.pdf, {
                            dpi: lvl.dpi, quality: lvl.q,
                            onProgress: (i, n) => progress((i / n) * 95, `Memampatkan halaman ${i} dari ${n}...`),
                        });
                    });
                    if (!out) return;
                    const before = doc.file.size; const after = out.byteLength;
                    const saved = Math.round((1 - after / before) * 100);
                    const lines = [`<b>${SP.fmtSize(before)}</b> &rarr; <b>${SP.fmtSize(after)}</b>` +
                        (saved > 0 ? ` (<span class="ok">hemat ${saved}%</span>)` : '')];
                    if (after >= before) {
                        lines.push('<span class="warn">Ukuran tidak berkurang. File ini sudah efisien atau berisi teks — coba tingkat "Optimasi struktur".</span>');
                    }
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out), filename: `${SP.baseName(doc.file.name)}_kompres.pdf`,
                        title: after < before ? 'Berhasil dikompres!' : 'Selesai', lines, onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    const GRAY_Q = [
        { id: 'std', icon: 'fa-print', name: 'Standar (150 DPI)', sub: 'Cukup tajam untuk cetak harian.', dpi: 150, q: 0.8, rec: true },
        { id: 'hi', icon: 'fa-gem', name: 'Tajam (220 DPI)', sub: 'Teks halus, ukuran file lebih besar.', dpi: 220, q: 0.85 },
    ];

    function mountGray(root, ctx) {
        SP.singlePdf(root, ctx, {
            start(doc, stage) {
                const panel = SP.h('<div class="skeuo-card tool-options"><p class="opt-hint">Semua warna diubah menjadi skala abu-abu — hemat tinta & biaya cetak. Teks akan menjadi gambar (tidak bisa dipilih).</p></div>');
                panel.appendChild(choiceGrid('gq', GRAY_Q, 'std'));
                stage.appendChild(panel);
                const action = SP.actionBar({ label: 'Ubah ke Hitam-Putih', icon: 'fa-circle-half-stroke', onClick: process });
                action.setSummary(`<b>${doc.numPages}</b> halaman akan dikonversi`);
                stage.appendChild(action.el);

                async function process() {
                    const q = GRAY_Q.find((l) => l.id === panel.querySelector('input:checked').value);
                    const out = await SP.run('Mengubah ke skala abu-abu...', (progress) => SP.rasterizePdf(doc.pdf, {
                        dpi: q.dpi, quality: q.q, gray: true,
                        onProgress: (i, n) => progress((i / n) * 95, `Halaman ${i} dari ${n}...`),
                    }));
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out), filename: `${SP.baseName(doc.file.name)}_grayscale.pdf`,
                        lines: [`<b>${doc.numPages}</b> halaman diubah menjadi hitam-putih.`], onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    SP.register({
        id: 'compress', category: 'optimize', icon: 'fa-compress', hue: 'green',
        title: 'Kompres PDF', desc: 'Perkecil ukuran file PDF agar mudah dikirim atau diunggah.',
        keywords: 'compress kecilkan ukuran size reduce',
        mount: mountCompress,
    });
    SP.register({
        id: 'grayscale', category: 'optimize', icon: 'fa-circle-half-stroke', hue: 'green',
        title: 'PDF ke Hitam-Putih', desc: 'Ubah seluruh dokumen menjadi skala abu-abu untuk hemat tinta.',
        keywords: 'grayscale abu-abu bw mono',
        mount: mountGray,
    });
})();
