/** Conversion tools: images -> PDF, PDF -> images, PDF -> text. */
(function () {
    'use strict';

    // ====================================================================
    // IMAGES -> PDF
    // ====================================================================
    const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
    const MAX_IMG_SIDE = 3500;

    async function imageToBytes(file) {
        // createImageBitmap honours EXIF orientation, so phone photos stay upright.
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        let w = bmp.width; let h = bmp.height;
        const k = Math.min(1, MAX_IMG_SIDE / Math.max(w, h));
        w = Math.round(w * k); h = Math.round(h * k);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const keepAlpha = /png|gif|webp/i.test(file.type || file.name);
        if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        const asPng = keepAlpha;
        const blob = await SP.canvasToBlob(c, asPng ? 'image/png' : 'image/jpeg', 0.92);
        SP.freeCanvas(c);
        return { bytes: await blob.arrayBuffer(), png: asPng, w, h };
    }

    function mountImg2Pdf(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);
        let uid = 0;
        const files = new Map();
        const urls = [];
        SP.onCleanup(() => urls.forEach((u) => URL.revokeObjectURL(u)));
        let list = null; let action = null; let opts = null;

        const drop = SP.dropzone({
            accept: 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp',
            multiple: true, icon: 'fa-images',
            title: 'Tarik & lepaskan gambar di sini',
            spec: 'JPG, PNG, WEBP, GIF, BMP | Bisa banyak gambar sekaligus',
            filter: SP.isImage,
            onFiles: add,
        });
        stage.appendChild(drop);

        function add(fs) {
            if (!list) build();
            fs.forEach((f) => {
                const id = ++uid;
                files.set(id, f);
                const url = URL.createObjectURL(f); urls.push(url);
                const el = SP.h(`
                    <div class="file-item skeuo-inset-panel" draggable="true" data-id="${id}">
                        <i class="fa-solid fa-grip-vertical grip"></i>
                        <div class="file-thumb"><img alt=""></div>
                        <div class="file-meta"><strong></strong><small></small></div>
                        <div class="file-actions">
                            <button type="button" class="tile-btn" data-act="up" title="Naikkan"><i class="fa-solid fa-chevron-up"></i></button>
                            <button type="button" class="tile-btn" data-act="down" title="Turunkan"><i class="fa-solid fa-chevron-down"></i></button>
                            <button type="button" class="tile-btn danger" data-act="del" title="Hapus"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>`);
                el.querySelector('img').src = url;
                el.querySelector('strong').textContent = f.name;
                el.querySelector('small').textContent = SP.fmtSize(f.size);
                el.addEventListener('click', (e) => {
                    const b = e.target.closest('button'); if (!b) return;
                    if (b.dataset.act === 'up') SP.moveItem(el, -1);
                    if (b.dataset.act === 'down') SP.moveItem(el, 1);
                    if (b.dataset.act === 'del') { files.delete(id); el.remove(); refresh(); }
                });
                list.appendChild(el);
            });
            refresh();
        }

        function build() {
            drop.querySelector('h2').textContent = 'Tambah gambar lainnya';
            drop.classList.add('compact');
            opts = SP.h(`
                <div class="skeuo-card tool-options">
                    <div class="opt-grid">
                        <div class="field"><label>Ukuran halaman</label>
                            <select class="text-input" id="imgSize">
                                <option value="fit">Sesuai ukuran gambar</option>
                                <option value="a4" selected>A4</option>
                                <option value="letter">Letter</option>
                            </select></div>
                        <div class="field"><label>Orientasi</label>
                            <select class="text-input" id="imgOri">
                                <option value="auto">Otomatis (ikuti gambar)</option>
                                <option value="p">Potret</option>
                                <option value="l">Lanskap</option>
                            </select></div>
                        <div class="field"><label>Margin</label>
                            <select class="text-input" id="imgMargin">
                                <option value="0">Tanpa margin</option>
                                <option value="20" selected>Kecil</option>
                                <option value="45">Besar</option>
                            </select></div>
                    </div>
                    <p class="opt-hint">Seret gambar untuk mengubah urutan halaman.</p>
                </div>`);
            list = SP.h('<div class="file-list"></div>');
            SP.sortable(list, { itemSelector: '.file-item', axis: 'y', onReorder: () => {} });
            action = SP.actionBar({ label: 'Buat PDF', icon: 'fa-file-pdf', onClick: process });
            stage.append(opts, list, action.el);
            const sizeSel = opts.querySelector('#imgSize');
            const sync = () => { opts.querySelector('#imgOri').disabled = sizeSel.value === 'fit'; };
            sizeSel.addEventListener('change', sync); sync();
        }

        function refresh() {
            action.setSummary(`<b>${files.size}</b> gambar → <b>${files.size}</b> halaman`);
            action.setDisabled(files.size === 0);
        }

        async function process() {
            const ordered = Array.from(list.children).map((el) => files.get(+el.dataset.id));
            const size = opts.querySelector('#imgSize').value;
            const ori = opts.querySelector('#imgOri').value;
            const margin = +opts.querySelector('#imgMargin').value;

            const out = await SP.run('Membuat PDF dari gambar...', async (progress) => {
                const doc = await PDFLib.PDFDocument.create();
                let i = 0;
                for (const f of ordered) {
                    let info;
                    try { info = await imageToBytes(f); } catch (e) { throw new Error(`Gambar "${f.name}" tidak bisa dibaca.`); }
                    const img = info.png ? await doc.embedPng(info.bytes) : await doc.embedJpg(info.bytes);

                    let pw; let ph;
                    if (size === 'fit') {
                        const k = Math.min(1, 1190 / Math.max(info.w, info.h));
                        pw = info.w * k + margin * 2; ph = info.h * k + margin * 2;
                    } else {
                        [pw, ph] = PAGE_SIZES[size];
                        const landscape = ori === 'l' || (ori === 'auto' && info.w > info.h);
                        if (landscape) [pw, ph] = [ph, pw];
                    }
                    const page = doc.addPage([pw, ph]);
                    const aw = pw - margin * 2; const ah = ph - margin * 2;
                    const s = Math.min(aw / info.w, ah / info.h);
                    const dw = info.w * s; const dh = info.h * s;
                    page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
                    progress((++i / ordered.length) * 95, `Gambar ${i} dari ${ordered.length}...`);
                    await SP.tick();
                }
                return doc.save();
            });
            if (!out) return;
            stage.innerHTML = '';
            stage.appendChild(SP.resultCard({
                blob: SP.pdfBlob(out), filename: 'gambar.pdf',
                lines: [`<b>${ordered.length}</b> gambar menjadi PDF dengan <b>${ordered.length}</b> halaman.`],
                onAgain: ctx.reset,
            }));
        }
    }

    // ====================================================================
    // PDF -> IMAGES
    // ====================================================================
    function mountPdf2Img(root, ctx) {
        SP.singlePdf(root, ctx, {
            start(doc, stage) {
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <div class="opt-grid">
                            <div class="field"><label>Format gambar</label>
                                <select class="text-input" id="imgFmt">
                                    <option value="jpg">JPG (lebih kecil)</option>
                                    <option value="png">PNG (tajam, lossless)</option>
                                </select></div>
                            <div class="field"><label>Kualitas / resolusi</label>
                                <select class="text-input" id="imgDpi">
                                    <option value="96">Rendah — 96 DPI</option>
                                    <option value="150" selected>Standar — 150 DPI</option>
                                    <option value="220">Tinggi — 220 DPI</option>
                                    <option value="300">Sangat tinggi — 300 DPI</option>
                                </select></div>
                            <div class="field"><label>Halaman <small>(kosong = semua)</small></label>
                                <input type="text" class="text-input" id="imgRange" placeholder="contoh: 1-3, 5"></div>
                        </div>
                    </div>`);
                stage.appendChild(panel);
                const action = SP.actionBar({ label: 'Konversi ke Gambar', icon: 'fa-image', onClick: process });
                stage.appendChild(action.el);
                const range = panel.querySelector('#imgRange');

                const pages = () => (range.value.trim()
                    ? Array.from(new Set(SP.rangesToIndices(SP.parseRanges(range.value, doc.numPages)))).map((i) => i + 1)
                    : Array.from({ length: doc.numPages }, (_, i) => i + 1));
                const refresh = () => {
                    try { action.setSummary(`<b>${pages().length}</b> halaman akan dikonversi`); action.setDisabled(false); }
                    catch (e) { action.setSummary(`<span class="err">${SP.esc(e.message)}</span>`); action.setDisabled(true); }
                };
                range.addEventListener('input', refresh); refresh();

                async function process() {
                    const list = pages();
                    const fmt = panel.querySelector('#imgFmt').value;
                    const dpi = +panel.querySelector('#imgDpi').value;
                    const base = SP.baseName(doc.file.name);
                    const pad = String(doc.numPages).length;
                    const out = await SP.run('Mengubah halaman menjadi gambar...', async (progress) => {
                        const entries = [];
                        let i = 0;
                        for (const n of list) {
                            const page = await doc.pdf.getPage(n);
                            const canvas = await SP.renderPage(page, dpi / 72);
                            const blob = await SP.canvasToBlob(canvas, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
                            entries.push({ name: `${base}_hal_${String(n).padStart(pad, '0')}.${fmt}`, data: blob, blob });
                            SP.freeCanvas(canvas); page.cleanup();
                            progress((++i / list.length) * 90, `Halaman ${i} dari ${list.length}...`);
                            await SP.tick();
                        }
                        if (entries.length === 1) return { blob: entries[0].blob, name: entries[0].name, n: 1 };
                        progress(94, 'Membuat ZIP...');
                        return { blob: await SP.zip(entries), name: `${base}_gambar.zip`, n: entries.length };
                    });
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: out.blob, filename: out.name,
                        lines: [`<b>${out.n}</b> gambar ${fmt.toUpperCase()} dihasilkan${out.n > 1 ? ' (dalam ZIP)' : ''}.`],
                        onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    // ====================================================================
    // PDF -> TEXT
    // ====================================================================
    async function extractText(pdf, withSeparators, progress) {
        const parts = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const tc = await page.getTextContent();
            let s = ''; let lastY = null;
            tc.items.forEach((it) => {
                if (!('str' in it)) return;
                const y = it.transform ? it.transform[5] : null;
                if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !s.endsWith('\n')) s += '\n';
                s += it.str;
                if (it.hasEOL) s += '\n';
                if (y !== null) lastY = y;
            });
            parts.push(withSeparators ? `--- Halaman ${n} ---\n${s.trim()}` : s.trim());
            page.cleanup();
            progress((n / pdf.numPages) * 100, `Halaman ${n} dari ${pdf.numPages}...`);
            if (n % 5 === 0) await SP.tick();
        }
        return parts.join('\n\n');
    }

    function mountPdf2Text(root, ctx) {
        SP.singlePdf(root, ctx, {
            start(doc, stage) {
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <p class="opt-hint">Mengambil teks yang tertanam di PDF. Dokumen hasil scan (berupa gambar) tidak punya teks tertanam sehingga hasilnya kosong.</p>
                        <label class="chk"><input type="checkbox" id="txtSep" checked> <span>Tambahkan penanda nomor halaman</span></label>
                    </div>`);
                stage.appendChild(panel);
                const action = SP.actionBar({ label: 'Ekstrak Teks', icon: 'fa-align-left', onClick: process });
                action.setSummary(`<b>${doc.numPages}</b> halaman`);
                stage.appendChild(action.el);

                async function process() {
                    const sep = panel.querySelector('#txtSep').checked;
                    const text = await SP.run('Mengekstrak teks...', (progress) => extractText(doc.pdf, sep, progress));
                    if (text === undefined) return;
                    const hasText = text.replace(/--- Halaman \d+ ---/g, '').trim().length > 0;
                    stage.innerHTML = '';
                    const card = SP.h(`
                        <div class="skeuo-card result-card text-result">
                            <h2 class="result-title">${hasText ? 'Teks berhasil diekstrak' : 'Tidak ada teks ditemukan'}</h2>
                            <p class="result-lines">${hasText ? `<b>${text.length.toLocaleString('id-ID')}</b> karakter.` : 'PDF ini kemungkinan hasil scan (gambar). Butuh OCR untuk membaca teksnya.'}</p>
                            <textarea class="text-input text-out" readonly></textarea>
                            <div class="result-actions">
                                <button type="button" class="btn skeuo-push-btn btn-zip-skeuo" data-a="dl"><i class="fa-solid fa-file-arrow-down"></i><div class="btn-text"><span>UNDUH .TXT</span></div></button>
                                <button type="button" class="skeuo-btn-sm" data-a="copy"><i class="fa-regular fa-copy"></i> Salin teks</button>
                                <button type="button" class="skeuo-btn-sm" data-a="again"><i class="fa-solid fa-arrow-rotate-left"></i> Proses file lain</button>
                            </div>
                        </div>`);
                    card.querySelector('textarea').value = text;
                    card.addEventListener('click', async (e) => {
                        const b = e.target.closest('button'); if (!b) return;
                        if (b.dataset.a === 'dl') SP.download(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${SP.baseName(doc.file.name)}.txt`);
                        if (b.dataset.a === 'copy') {
                            try { await navigator.clipboard.writeText(text); SP.toast('Teks disalin.', 'ok'); }
                            catch (err) { card.querySelector('textarea').select(); document.execCommand('copy'); SP.toast('Teks disalin.', 'ok'); }
                        }
                        if (b.dataset.a === 'again') ctx.reset();
                    });
                    if (!hasText) card.querySelector('[data-a="dl"]').disabled = true;
                    stage.appendChild(card);
                }
            },
        });
    }

    SP.register({
        id: 'img2pdf', category: 'to-pdf', icon: 'fa-images', hue: 'violet',
        title: 'Gambar ke PDF', desc: 'Ubah JPG, PNG, atau gambar lain menjadi satu file PDF.',
        keywords: 'jpg png foto image picture convert',
        mount: mountImg2Pdf,
    });
    SP.register({
        id: 'pdf2img', category: 'from-pdf', icon: 'fa-image', hue: 'violet',
        title: 'PDF ke Gambar', desc: 'Simpan setiap halaman PDF sebagai gambar JPG atau PNG.',
        keywords: 'jpg png foto image convert',
        mount: mountPdf2Img,
    });
    SP.register({
        id: 'pdf2text', category: 'from-pdf', icon: 'fa-align-left', hue: 'violet',
        title: 'PDF ke Teks', desc: 'Ambil teks dari PDF untuk disalin atau disimpan sebagai .txt.',
        keywords: 'text txt copy salin extract',
        mount: mountPdf2Text,
    });
})();
