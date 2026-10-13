/** Edit tools: page numbers, watermark, metadata. */
(function () {
    'use strict';

    const hexToRgb = (hex) => {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [0, '00', '00', '00'];
        return PDFLib.rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
    };

    const num = (el, def, min, max) => {
        const v = parseFloat(el.value);
        if (Number.isNaN(v)) return def;
        return Math.min(max, Math.max(min, v));
    };

    /** Live preview of the first affected page, re-rendered after edits. */
    function previewPane(buildBytes) {
        const el = SP.h(`
            <div class="preview-pane skeuo-inset-panel">
                <div class="preview-label"><i class="fa-solid fa-eye"></i> Pratinjau</div>
                <div class="preview-canvas-wrap"><canvas></canvas><div class="preview-msg"></div></div>
            </div>`);
        const canvas = el.querySelector('canvas');
        const msg = el.querySelector('.preview-msg');
        let timer = null; let seq = 0;

        async function render() {
            const my = ++seq;
            try {
                const bytes = await buildBytes();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
                const page = await pdf.getPage(1);
                const base = page.getViewport({ scale: 1 });
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const vp = page.getViewport({ scale: (340 * dpr) / base.width });
                if (my !== seq) { pdf.destroy(); return; }
                canvas.width = vp.width; canvas.height = vp.height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                pdf.destroy();
                msg.textContent = '';
                canvas.classList.add('ready');
            } catch (e) {
                if (my === seq) { msg.textContent = e.message; canvas.classList.remove('ready'); }
            }
        }
        return { el, update: () => { clearTimeout(timer); timer = setTimeout(render, 250); }, now: render };
    }

    // ====================================================================
    // PAGE NUMBERS
    // ====================================================================
    function mountPageNumbers(root, ctx) {
        SP.singlePdf(root, ctx, {
            async start(doc, stage) {
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <div class="opt-grid">
                            <div class="field"><label>Posisi</label>
                                <select class="text-input" id="pnPos">
                                    <option value="bc" selected>Bawah — tengah</option>
                                    <option value="br">Bawah — kanan</option>
                                    <option value="bl">Bawah — kiri</option>
                                    <option value="tc">Atas — tengah</option>
                                    <option value="tr">Atas — kanan</option>
                                    <option value="tl">Atas — kiri</option>
                                </select></div>
                            <div class="field"><label>Format</label>
                                <select class="text-input" id="pnFmt">
                                    <option value="{n}">1, 2, 3</option>
                                    <option value="Halaman {n}">Halaman 1</option>
                                    <option value="{n} / {total}">1 / ${doc.numPages}</option>
                                    <option value="Halaman {n} dari {total}">Halaman 1 dari ${doc.numPages}</option>
                                    <option value="- {n} -">- 1 -</option>
                                </select></div>
                            <div class="field"><label>Mulai dari angka</label>
                                <input type="number" id="pnStart" class="text-input" value="1" min="0"></div>
                            <div class="field"><label>Dari halaman</label>
                                <input type="number" id="pnFrom" class="text-input" value="1" min="1" max="${doc.numPages}"></div>
                            <div class="field"><label>Sampai halaman</label>
                                <input type="number" id="pnTo" class="text-input" value="${doc.numPages}" min="1" max="${doc.numPages}"></div>
                            <div class="field"><label>Ukuran huruf</label>
                                <input type="number" id="pnSize" class="text-input" value="11" min="6" max="48"></div>
                        </div>
                    </div>`);
                const layout = SP.h('<div class="edit-layout"></div>');
                layout.appendChild(panel);
                stage.appendChild(layout);
                const $ = (id) => panel.querySelector('#' + id);

                const srcDoc = await SP.run('Menyiapkan...', () => SP.openPdfLib(doc.buffer, doc.file.name));
                if (!srcDoc) return;

                const read = () => {
                    const from = num($('pnFrom'), 1, 1, doc.numPages);
                    const to = num($('pnTo'), doc.numPages, from, doc.numPages);
                    return {
                        pos: $('pnPos').value, fmt: $('pnFmt').value,
                        start: Math.round(num($('pnStart'), 1, 0, 100000)),
                        from, to, size: num($('pnSize'), 11, 6, 48),
                    };
                };

                function apply(target, font, o, entries) {
                    entries.forEach(({ page, idx }) => {
                        const n = o.start + (idx - (o.from - 1));
                        const text = o.fmt.replace('{n}', n).replace('{total}', doc.numPages);
                        const w = font.widthOfTextAtSize(text, o.size);
                        const g = SP.pageGeometry(page);
                        const m = 28;
                        const vx = o.pos[1] === 'l' ? m : o.pos[1] === 'r' ? g.visW - m - w : (g.visW - w) / 2;
                        const vy = o.pos[0] === 'b' ? m : g.visH - m - o.size * 0.75;
                        const p = g.toUser(vx, vy);
                        page.drawText(text, {
                            x: p.x, y: p.y, size: o.size, font, color: PDFLib.rgb(0.1, 0.1, 0.1),
                            rotate: PDFLib.degrees(g.angle),
                        });
                    });
                }

                const preview = previewPane(async () => {
                    const o = read();
                    const tmp = await PDFLib.PDFDocument.create();
                    const [pg] = await tmp.copyPages(srcDoc, [o.from - 1]);
                    tmp.addPage(pg);
                    const font = await tmp.embedFont(PDFLib.StandardFonts.Helvetica);
                    apply(tmp, font, o, [{ page: pg, idx: o.from - 1 }]);
                    return tmp.save();
                });
                layout.appendChild(preview.el);
                panel.addEventListener('input', preview.update);
                preview.now();

                const action = SP.actionBar({ label: 'Tambahkan Nomor Halaman', icon: 'fa-list-ol', onClick: process });
                const sum = () => { const o = read(); action.setSummary(`Nomor ditambahkan pada halaman <b>${o.from}–${o.to}</b>`); };
                panel.addEventListener('input', sum); sum();
                stage.appendChild(action.el);

                async function process() {
                    const o = read();
                    const out = await SP.run('Menambahkan nomor halaman...', async (progress) => {
                        const d = await SP.openPdfLib(doc.buffer, doc.file.name);
                        const font = await d.embedFont(PDFLib.StandardFonts.Helvetica);
                        const pages = d.getPages();
                        const entries = [];
                        for (let i = o.from - 1; i <= o.to - 1; i++) entries.push({ page: pages[i], idx: i });
                        progress(50);
                        apply(d, font, o, entries);
                        return d.save();
                    });
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out), filename: `${SP.baseName(doc.file.name)}_nomor.pdf`,
                        lines: [`Nomor halaman ditambahkan pada halaman ${o.from}–${o.to}.`], onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    // ====================================================================
    // WATERMARK
    // ====================================================================
    function mountWatermark(root, ctx) {
        SP.singlePdf(root, ctx, {
            async start(doc, stage) {
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <div class="field"><label>Teks watermark</label>
                            <input type="text" id="wmText" class="text-input" value="RAHASIA" maxlength="80" autocomplete="off"></div>
                        <div class="opt-grid">
                            <div class="field"><label>Ukuran huruf</label>
                                <input type="number" id="wmSize" class="text-input" value="64" min="8" max="300"></div>
                            <div class="field"><label>Warna</label>
                                <input type="color" id="wmColor" class="color-input" value="#8b8b8b"></div>
                            <div class="field"><label>Transparansi <small id="wmOpVal">30%</small></label>
                                <input type="range" id="wmOpacity" class="skeuo-slider" min="5" max="100" value="30"></div>
                            <div class="field"><label>Sudut</label>
                                <select class="text-input" id="wmRot">
                                    <option value="45" selected>Diagonal (45°)</option>
                                    <option value="0">Horizontal (0°)</option>
                                    <option value="90">Vertikal (90°)</option>
                                    <option value="-45">Diagonal terbalik (−45°)</option>
                                </select></div>
                            <div class="field"><label>Tata letak</label>
                                <select class="text-input" id="wmLayout">
                                    <option value="center" selected>Satu di tengah</option>
                                    <option value="tile">Berulang (ubin)</option>
                                </select></div>
                            <div class="field"><label>Halaman <small>(kosong = semua)</small></label>
                                <input type="text" id="wmPages" class="text-input" placeholder="contoh: 1-3, 5"></div>
                        </div>
                    </div>`);
                const layout = SP.h('<div class="edit-layout"></div>');
                layout.appendChild(panel);
                stage.appendChild(layout);
                const $ = (id) => panel.querySelector('#' + id);

                const srcDoc = await SP.run('Menyiapkan...', () => SP.openPdfLib(doc.buffer, doc.file.name));
                if (!srcDoc) return;

                const read = () => ({
                    text: $('wmText').value, size: num($('wmSize'), 64, 8, 300),
                    color: hexToRgb($('wmColor').value), opacity: num($('wmOpacity'), 30, 5, 100) / 100,
                    rot: parseFloat($('wmRot').value), layout: $('wmLayout').value, pages: $('wmPages').value,
                });

                function stamp(page, font, o) {
                    const w = font.widthOfTextAtSize(o.text, o.size);
                    const g = SP.pageGeometry(page);
                    const th = (o.rot * Math.PI) / 180;
                    const cos = Math.cos(th); const sin = Math.sin(th);
                    const place = (cx, cy) => {
                        // baseline-left anchor so that the text's centre lands on (cx, cy)
                        const ox = w / 2; const oy = o.size * 0.3;
                        const ax = cx - (ox * cos - oy * sin);
                        const ay = cy - (ox * sin + oy * cos);
                        const p = g.toUser(ax, ay);
                        page.drawText(o.text, {
                            x: p.x, y: p.y, size: o.size, font, color: o.color, opacity: o.opacity,
                            rotate: PDFLib.degrees(o.rot + g.angle),
                        });
                    };
                    if (o.layout === 'center') { place(g.visW / 2, g.visH / 2); return; }
                    const stepX = w * 1.5; const stepY = o.size * 4;
                    let row = 0;
                    for (let y = stepY / 2; y < g.visH + stepY; y += stepY, row++) {
                        for (let x = (row % 2 ? stepX / 2 : 0); x < g.visW + stepX; x += stepX) place(x, y);
                    }
                }

                const validate = (o) => {
                    if (!o.text.trim()) throw new Error('Teks watermark masih kosong.');
                };

                const preview = previewPane(async () => {
                    const o = read(); validate(o);
                    const tmp = await PDFLib.PDFDocument.create();
                    const font = await tmp.embedFont(PDFLib.StandardFonts.HelveticaBold);
                    try { font.encodeText(o.text); } catch (e) { throw new Error('Teks memuat karakter yang tidak didukung (gunakan huruf Latin, angka, dan tanda baca umum).'); }
                    let first = 0;
                    if (o.pages.trim()) { try { first = SP.parseRanges(o.pages, doc.numPages)[0][0] - 1; } catch (e) { throw e; } }
                    const [pg] = await tmp.copyPages(srcDoc, [first]);
                    tmp.addPage(pg);
                    stamp(pg, font, o);
                    return tmp.save();
                });
                layout.appendChild(preview.el);
                panel.addEventListener('input', () => { $('wmOpVal').textContent = $('wmOpacity').value + '%'; preview.update(); });
                preview.now();

                const action = SP.actionBar({ label: 'Tambahkan Watermark', icon: 'fa-stamp', onClick: process });
                action.setSummary(`<b>${doc.numPages}</b> halaman tersedia`);
                stage.appendChild(action.el);

                async function process() {
                    const o = read();
                    try { validate(o); if (o.pages.trim()) SP.parseRanges(o.pages, doc.numPages); } catch (e) { SP.toast(e.message, 'error'); return; }
                    const out = await SP.run('Menambahkan watermark...', async (progress) => {
                        const d = await SP.openPdfLib(doc.buffer, doc.file.name);
                        const font = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
                        try { font.encodeText(o.text); } catch (e) { throw new Error('Teks memuat karakter yang tidak didukung (gunakan huruf Latin, angka, dan tanda baca umum).'); }
                        const pages = d.getPages();
                        const set = o.pages.trim()
                            ? new Set(SP.rangesToIndices(SP.parseRanges(o.pages, doc.numPages)))
                            : new Set(pages.map((_, i) => i));
                        let i = 0;
                        for (const idx of set) {
                            stamp(pages[idx], font, o);
                            progress((++i / set.size) * 90);
                            if (i % 20 === 0) await SP.tick();
                        }
                        return { bytes: await d.save(), n: set.size };
                    });
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out.bytes), filename: `${SP.baseName(doc.file.name)}_watermark.pdf`,
                        lines: [`Watermark ditambahkan pada <b>${out.n}</b> halaman.`], onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    // ====================================================================
    // METADATA
    // ====================================================================
    function mountMetadata(root, ctx) {
        SP.singlePdf(root, ctx, {
            async start(doc, stage) {
                const src = await SP.run('Membaca metadata...', () => SP.openPdfLib(doc.buffer, doc.file.name, { updateMetadata: false }));
                if (!src) return;
                const fmt = (d) => (d ? d.toLocaleString('id-ID') : '—');
                const panel = SP.h(`
                    <div class="skeuo-card tool-options">
                        <div class="opt-grid two">
                            <div class="field"><label>Judul</label><input id="mdTitle" class="text-input" type="text"></div>
                            <div class="field"><label>Penulis</label><input id="mdAuthor" class="text-input" type="text"></div>
                            <div class="field"><label>Subjek</label><input id="mdSubject" class="text-input" type="text"></div>
                            <div class="field"><label>Kata kunci <small>(pisahkan koma)</small></label><input id="mdKeywords" class="text-input" type="text"></div>
                            <div class="field"><label>Aplikasi pembuat</label><input id="mdCreator" class="text-input" type="text"></div>
                            <div class="field"><label>Produser PDF</label><input id="mdProducer" class="text-input" type="text"></div>
                        </div>
                        <label class="chk"><input type="checkbox" id="mdWipe"> <span>Hapus <b>semua</b> metadata (untuk privasi)</span></label>
                        <p class="opt-hint">Dibuat: ${fmt(src.getCreationDate())} • Diubah: ${fmt(src.getModificationDate())}</p>
                    </div>`);
                stage.appendChild(panel);
                const $ = (id) => panel.querySelector('#' + id);
                $('mdTitle').value = src.getTitle() || '';
                $('mdAuthor').value = src.getAuthor() || '';
                $('mdSubject').value = src.getSubject() || '';
                $('mdKeywords').value = src.getKeywords() || '';
                $('mdCreator').value = src.getCreator() || '';
                $('mdProducer').value = src.getProducer() || '';
                const wipe = $('mdWipe');
                wipe.addEventListener('change', () => panel.querySelectorAll('.text-input').forEach((i) => { i.disabled = wipe.checked; }));

                const action = SP.actionBar({ label: 'Simpan Metadata', icon: 'fa-tags', onClick: process });
                action.setSummary('Ubah lalu simpan sebagai PDF baru');
                stage.appendChild(action.el);

                async function process() {
                    const out = await SP.run('Menyimpan metadata...', async () => {
                        const d = await SP.openPdfLib(doc.buffer, doc.file.name, { updateMetadata: false });
                        if (wipe.checked) {
                            d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]);
                            d.setCreator(''); d.setProducer('');
                            const info = d.context.lookup(d.context.trailerInfo.Info);
                            if (info && info.dict) {
                                Array.from(info.dict.keys()).forEach((k) => info.dict.delete(k));
                            }
                        } else {
                            d.setTitle($('mdTitle').value); d.setAuthor($('mdAuthor').value);
                            d.setSubject($('mdSubject').value);
                            d.setKeywords($('mdKeywords').value.split(',').map((s) => s.trim()).filter(Boolean));
                            d.setCreator($('mdCreator').value); d.setProducer($('mdProducer').value);
                            d.setModificationDate(new Date());
                        }
                        return d.save();
                    });
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out), filename: `${SP.baseName(doc.file.name)}_metadata.pdf`,
                        lines: [wipe.checked ? 'Semua metadata dihapus.' : 'Metadata berhasil diperbarui.'], onAgain: ctx.reset,
                    }));
                }
            },
        });
    }

    SP.register({
        id: 'pagenumbers', category: 'edit', icon: 'fa-list-ol', hue: 'cyan',
        title: 'Nomor Halaman', desc: 'Tambahkan nomor halaman dengan posisi dan format pilihanmu.',
        keywords: 'page number numbering halaman nomor',
        mount: mountPageNumbers,
    });
    SP.register({
        id: 'watermark', category: 'edit', icon: 'fa-stamp', hue: 'cyan',
        title: 'Watermark', desc: 'Tempel teks watermark (mis. RAHASIA / DRAFT) di halaman PDF.',
        keywords: 'stamp cap tanda air draft rahasia',
        mount: mountWatermark,
    });
    SP.register({
        id: 'metadata', category: 'edit', icon: 'fa-tags', hue: 'cyan',
        title: 'Edit Metadata', desc: 'Ubah atau hapus judul, penulis, dan info tersembunyi lainnya.',
        keywords: 'properties author title judul penulis privasi',
        mount: mountMetadata,
    });
})();
