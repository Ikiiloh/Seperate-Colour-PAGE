/**
 * Alat "PDF ke Word" — pipa konversi bertahap:
 *   P2D.extractPage  -> geometri mentah (span, garis, gambar)
 *   P2D.layoutPage   -> paragraf & tabel
 *   P2D.buildDocx    -> paket .docx
 *
 * Semua di browser; file tidak pernah diunggah.
 */
(function () {
    'use strict';

    function mountPdf2Word(root, ctx) {
        SP.singlePdf(root, ctx, {
            title: 'Tarik & lepaskan file PDF di sini',
            spec: 'PDF ke Word (.docx) | Teks, tabel, dan gambar bisa diedit',
            start(doc, stage) {
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <div class="opt-grid">
                            <div class="field" style="grid-column: 1 / -1;">
                                <label>Halaman yang Dikonversi <small>(kosong = semua halaman)</small></label>
                                <input type="text" class="text-input" id="p2wRange" placeholder="contoh: 1-3, 5, 8-10">
                            </div>
                        </div>
                        <p class="opt-hint"><i class="fa-solid fa-wand-magic-sparkles"></i> Paragraf, tabel bergaris, dan gambar disusun ulang menjadi elemen Word yang bisa diedit — satu section Word per halaman PDF.</p>
                    </div>`);
                stage.appendChild(panel);

                const previewCard = SP.h(`
                    <div class="skeuo-card office-preview-card">
                        <div class="office-preview-header">
                            <span><i class="fa-solid fa-file-pdf" style="color:#ef4444;"></i> Pratinjau</span>
                            <span class="preview-badge" id="p2wBadge">Merender pratinjau...</span>
                        </div>
                        <div class="office-preview-scroll" style="text-align:center; padding:16px;">
                            <canvas id="p2wPreviewCanvas" style="max-width:100%; box-shadow:0 2px 12px rgba(0,0,0,0.13); border-radius:4px;"></canvas>
                        </div>
                    </div>`);
                stage.appendChild(previewCard);

                const rangeInput = panel.querySelector('#p2wRange');
                const badge = previewCard.querySelector('#p2wBadge');
                const previewCanvas = previewCard.querySelector('#p2wPreviewCanvas');

                const run = async () => {
                    const pages = getTargetPages();
                    const layouts = [];

                    const blob = await SP.run('Mengonversi PDF ke Word...', async (progress) => {
                        for (let k = 0; k < pages.length; k++) {
                            const page = await doc.pdf.getPage(pages[k]);
                            progress((k / pages.length) * 55, `Membaca halaman ${pages[k]}...`);
                            const model = await P2D.extractPage(page, doc.buffer);
                            progress((k / pages.length) * 55 + 4, `Menyusun tata letak halaman ${pages[k]}...`);
                            layouts.push(P2D.layoutPage(model));
                            await SP.tick();
                        }
                        return await P2D.buildDocx(layouts, {
                            onProgress: (p, text) => progress(55 + Math.round(p * 0.45), text),
                        });
                    });

                    if (!blob) return;

                    const outName = `${SP.baseName(doc.file.name)}.docx`;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob,
                        filename: outName,
                        title: 'Selesai!',
                        lines: [
                            `<b>${pages.length}</b> halaman diubah menjadi dokumen Word (.docx).`,
                            'Paragraf, tabel, dan gambar dapat diedit langsung di Word.',
                        ],
                        onAgain: ctx.reset,
                    }));
                };

                const action = SP.actionBar({
                    label: 'Konversi ke Word (.docx)',
                    icon: 'fa-file-word',
                    onClick: run,
                });
                stage.appendChild(action.el);

                function getTargetPages() {
                    const val = rangeInput.value.trim();
                    if (!val) return Array.from({ length: doc.numPages }, (_, i) => i + 1);
                    return Array.from(new Set(SP.rangesToIndices(SP.parseRanges(val, doc.numPages)))).map((i) => i + 1);
                }

                function refreshSummary() {
                    try {
                        const pages = getTargetPages();
                        action.setSummary(`<b>${pages.length}</b> dari <b>${doc.numPages}</b> halaman siap diubah ke Word`);
                        action.setDisabled(pages.length === 0);
                    } catch (e) {
                        action.setSummary(`<span class="err">${SP.esc(e.message)}</span>`);
                        action.setDisabled(true);
                    }
                }

                rangeInput.addEventListener('input', refreshSummary);
                refreshSummary();

                (async () => {
                    try {
                        const first = await doc.pdf.getPage(1);
                        const vp = first.getViewport({ scale: 1 });
                        const scale = Math.min(1.2, 600 / vp.width);
                        const canvas = await SP.renderPage(first, scale);
                        previewCanvas.width = canvas.width;
                        previewCanvas.height = canvas.height;
                        previewCanvas.getContext('2d').drawImage(canvas, 0, 0);
                        SP.freeCanvas(canvas);
                        badge.textContent = `${doc.numPages} halaman • siap dikonversi`;
                    } catch (e) {
                        badge.textContent = 'Siap';
                        previewCanvas.style.display = 'none';
                    }
                })();
            },
        });
    }

    SP.register({
        id: 'pdf2word',
        category: 'from-pdf',
        icon: 'fa-file-pdf',
        hue: 'red',
        title: 'PDF ke Word',
        desc: 'Ubah file PDF menjadi dokumen Word (.docx) yang bisa diedit, dengan tata letak, tabel, dan gambar asli.',
        keywords: 'pdf word docx convert ubah edit teks doc docx gambar tabel skripsi',
        mount: mountPdf2Word,
    });
})();
