/**
 * Page-based tools sharing one visual editor:
 *   organize (reorder / rotate / delete), rotate, remove, extract.
 */
(function () {
    'use strict';

    const BOX_W = 140;
    const BOX_H = 184;

    const MODES = {
        organize: {
            suffix: 'diatur', summary: 'Seret halaman untuk mengubah urutan, putar, atau tandai untuk dihapus.',
            label: 'Terapkan & Buat PDF', icon: 'fa-check',
        },
        rotate: {
            suffix: 'diputar', summary: 'Putar halaman satu per satu atau sekaligus.',
            label: 'Terapkan Rotasi', icon: 'fa-rotate-right',
        },
        remove: {
            suffix: 'tanpa_halaman', summary: 'Klik halaman yang ingin dihapus, atau ketik rentangnya.',
            label: 'Hapus Halaman Terpilih', icon: 'fa-trash-can',
        },
        extract: {
            suffix: 'ekstrak', summary: 'Klik halaman yang ingin diambil, atau ketik rentangnya.',
            label: 'Ekstrak Halaman Terpilih', icon: 'fa-file-export',
        },
    };

    function mountEditor(root, ctx, mode) {
        const cfg = MODES[mode];
        const canReorder = mode === 'organize';
        const canRotate = mode === 'organize' || mode === 'rotate';
        const hasMove = canReorder;
        const clickToggles = mode === 'remove' || mode === 'extract';
        const hasTrashBtn = mode === 'organize';

        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        const drop = SP.dropzone({
            accept: '.pdf,application/pdf',
            title: 'Tarik & lepaskan file PDF di sini',
            spec: `Format PDF | Maksimal ${SP.MAX_MB} MB`,
            filter: SP.isPdf,
            onFiles: async ([file]) => {
                const doc = await SP.run('Membuka PDF...', () => SP.loadPdf(file)).catch(() => null);
                if (doc) start(doc);
            },
        });
        stage.appendChild(drop);

        function start(doc) {
            stage.innerHTML = '';
            stage.appendChild(SP.fileBar({
                name: doc.file.name, size: doc.file.size, pages: doc.numPages, onChange: ctx.reset,
            }));

            // --- toolbar ---
            const bar = SP.h(`<div class="skeuo-card tool-options"><p class="opt-hint"></p><div class="opt-row"></div></div>`);
            bar.querySelector('.opt-hint').textContent = cfg.summary;
            const row = bar.querySelector('.opt-row');
            const btn = (icon, text, fn, cls = '') => {
                const b = SP.h(`<button type="button" class="skeuo-btn ${cls}"><i class="fa-solid ${icon}"></i> ${text}</button>`);
                b.addEventListener('click', fn);
                row.appendChild(b);
                return b;
            };

            let rangeInput = null;
            if (clickToggles) {
                const wrap = SP.h(`
                    <div class="range-field">
                        <label>Rentang halaman</label>
                        <div class="range-line">
                            <input type="text" class="text-input" placeholder="contoh: 1-3, 5, 8-" autocomplete="off">
                            <button type="button" class="skeuo-btn">Terapkan</button>
                        </div>
                    </div>`);
                rangeInput = wrap.querySelector('input');
                wrap.querySelector('button').addEventListener('click', applyRange);
                rangeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyRange(); });
                bar.insertBefore(wrap, row);
                btn('fa-square-check', 'Pilih semua', () => setAll(true));
                btn('fa-square', 'Kosongkan', () => setAll(false));
                btn('fa-arrows-rotate', 'Balik pilihan', () => tiles().forEach((t) => setMark(t, !t._marked)));
            }
            if (canRotate) {
                btn('fa-rotate-left', 'Putar semua ke kiri', () => rotateAll(-90));
                btn('fa-rotate-right', 'Putar semua ke kanan', () => rotateAll(90));
                btn('fa-arrows-up-down', 'Putar semua 180°', () => rotateAll(180));
            }
            if (canReorder) {
                btn('fa-arrow-down-9-1', 'Balik urutan', () => {
                    tiles().reverse().forEach((t) => grid.appendChild(t));
                    refresh();
                });
                btn('fa-arrow-down-1-9', 'Urut ulang', () => {
                    tiles().sort((a, b) => a._orig - b._orig).forEach((t) => grid.appendChild(t));
                    refresh();
                });
            }
            if (canRotate || canReorder) {
                btn('fa-rotate-left', 'Reset', () => {
                    tiles().sort((a, b) => a._orig - b._orig).forEach((t) => {
                        grid.appendChild(t); t._rot = 0; setMark(t, false, true); layout(t);
                    });
                    refresh();
                }, 'ghost');
            }
            stage.appendChild(bar);

            // --- grid ---
            const grid = SP.h(`<div class="page-grid mode-${mode} ${clickToggles ? 'selectable' : ''}"></div>`);
            stage.appendChild(grid);
            const tiles = () => Array.from(grid.children);

            for (let i = 0; i < doc.numPages; i++) {
                const t = SP.h(`
                    <div class="page-tile" ${canReorder ? 'draggable="true"' : ''}>
                        <div class="tile-stage" style="height:${BOX_H}px"><canvas></canvas></div>
                        <div class="tile-mark"><i class="fa-solid"></i></div>
                        <div class="tile-foot"><span class="tile-num">Hal ${i + 1}</span><div class="tile-btns"></div></div>
                    </div>`);
                t._orig = i; t._rot = 0; t._marked = false;
                const btns = t.querySelector('.tile-btns');
                const add = (icon, title, fn) => {
                    const b = SP.h(`<button type="button" class="tile-btn" title="${title}" aria-label="${title}"><i class="fa-solid ${icon}"></i></button>`);
                    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
                    btns.appendChild(b);
                };
                if (hasMove) {
                    add('fa-chevron-left', 'Geser ke depan', () => { if (SP.moveItem(t, -1)) refresh(); });
                    add('fa-chevron-right', 'Geser ke belakang', () => { if (SP.moveItem(t, 1)) refresh(); });
                }
                if (canRotate) {
                    add('fa-rotate-left', 'Putar ke kiri', () => { t._rot -= 90; layout(t); refresh(); });
                    add('fa-rotate-right', 'Putar ke kanan', () => { t._rot += 90; layout(t); refresh(); });
                }
                if (hasTrashBtn) add('fa-trash-can', 'Hapus / pulihkan halaman', () => setMark(t, !t._marked));
                if (clickToggles) t.addEventListener('click', () => setMark(t, !t._marked));
                grid.appendChild(t);
                SP.thumb.observe(t.querySelector('canvas'), doc.pdf, i + 1, { maxW: BOX_W * 1.3, onDone: () => layout(t) });
            }

            if (canReorder) SP.sortable(grid, { itemSelector: '.page-tile', axis: 'x', onReorder: refresh });

            // --- action bar ---
            const action = SP.actionBar({ label: cfg.label, icon: cfg.icon, onClick: process });
            stage.appendChild(action.el);

            function layout(t) {
                const c = t.querySelector('canvas');
                const aw = +c.dataset.aw; const ah = +c.dataset.ah;
                const rot = ((t._rot % 360) + 360) % 360;
                if (aw) {
                    const swap = rot === 90 || rot === 270;
                    const s = Math.min(BOX_W / (swap ? ah : aw), BOX_H / (swap ? aw : ah));
                    c.style.width = (aw * s) + 'px';
                    c.style.height = (ah * s) + 'px';
                }
                c.style.transform = `rotate(${rot}deg)`;
                t.classList.toggle('is-rotated', rot !== 0);
            }

            function setMark(t, val, silent) {
                t._marked = val;
                t.classList.toggle('marked', val);
                t.querySelector('.tile-mark i').className = 'fa-solid ' + (mode === 'extract' ? 'fa-check' : 'fa-trash-can');
                if (!silent) refresh();
            }

            function setAll(val) { tiles().forEach((t) => setMark(t, val, true)); refresh(); }

            function rotateAll(d) { tiles().forEach((t) => { t._rot += d; layout(t); }); refresh(); }

            function applyRange() {
                try {
                    const idx = new Set(SP.rangesToIndices(SP.parseRanges(rangeInput.value, doc.numPages)));
                    tiles().forEach((t) => setMark(t, idx.has(t._orig), true));
                    refresh(true);
                } catch (e) { SP.toast(e.message, 'error'); }
            }

            function refresh(fromRange) {
                const ts = tiles();
                const marked = ts.filter((t) => t._marked);
                const rotated = ts.filter((t) => ((t._rot % 360) + 360) % 360 !== 0).length;
                const moved = canReorder && ts.some((t, i) => t._orig !== i);
                if (rangeInput && !fromRange) rangeInput.value = SP.formatRanges(marked.map((t) => t._orig + 1));

                let text; let ok = true;
                if (mode === 'remove') {
                    text = `<b>${marked.length}</b> halaman akan dihapus • sisa <b>${ts.length - marked.length}</b>`;
                    ok = marked.length > 0 && marked.length < ts.length;
                } else if (mode === 'extract') {
                    text = `<b>${marked.length}</b> halaman dipilih dari ${ts.length}`;
                    ok = marked.length > 0;
                } else if (mode === 'rotate') {
                    text = `<b>${rotated}</b> halaman diputar`;
                    ok = rotated > 0;
                } else {
                    text = `<b>${ts.length - marked.length}</b> halaman akan dipakai` +
                        (marked.length ? ` • ${marked.length} dihapus` : '') +
                        (rotated ? ` • ${rotated} diputar` : '') + (moved ? ' • urutan berubah' : '');
                    ok = marked.length < ts.length && (marked.length > 0 || rotated > 0 || moved);
                }
                action.setSummary(text);
                action.setDisabled(!ok);
            }
            refresh();

            async function process() {
                const out = await SP.run('Menyusun PDF...', async (progress) => {
                    const src = await SP.openPdfLib(doc.buffer, doc.file.name);
                    progress(20, 'Menyalin halaman...');
                    let order = tiles();
                    if (mode === 'remove') order = order.filter((t) => !t._marked);
                    if (mode === 'extract') order = order.filter((t) => t._marked);
                    if (mode === 'organize') order = order.filter((t) => !t._marked);
                    if (!order.length) throw new Error('Tidak ada halaman tersisa untuk dibuat.');

                    const dst = await SP.extractPages(src, order.map((t) => t._orig));
                    dst.getPages().forEach((p, i) => {
                        const d = order[i]._rot;
                        if (d) {
                            const cur = p.getRotation().angle;
                            p.setRotation(PDFLib.degrees((((cur + d) % 360) + 360) % 360));
                        }
                    });
                    progress(70, 'Menyimpan...');
                    const bytes = await dst.save();
                    return { bytes, count: order.length };
                });
                if (!out) return;
                const name = `${SP.baseName(doc.file.name)}_${cfg.suffix}.pdf`;
                stage.innerHTML = '';
                stage.appendChild(SP.resultCard({
                    blob: SP.pdfBlob(out.bytes), filename: name,
                    lines: [`PDF baru berisi <b>${out.count}</b> halaman.`],
                    onAgain: ctx.reset,
                }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }

    SP.register({
        id: 'organize', category: 'organize', icon: 'fa-table-cells-large', hue: 'blue',
        title: 'Atur Halaman', desc: 'Susun ulang urutan halaman, putar, atau hapus lewat tampilan visual.',
        keywords: 'urutkan reorder susun pindah',
        mount: (root, ctx) => mountEditor(root, ctx, 'organize'),
    });
    SP.register({
        id: 'rotate', category: 'organize', icon: 'fa-rotate-right', hue: 'blue',
        title: 'Putar PDF', desc: 'Putar semua atau sebagian halaman 90°, 180°, atau 270°.',
        keywords: 'rotasi miring landscape portrait',
        mount: (root, ctx) => mountEditor(root, ctx, 'rotate'),
    });
    SP.register({
        id: 'remove', category: 'organize', icon: 'fa-trash-can', hue: 'blue',
        title: 'Hapus Halaman', desc: 'Buang halaman yang tidak diperlukan dari dokumen PDF.',
        keywords: 'delete buang',
        mount: (root, ctx) => mountEditor(root, ctx, 'remove'),
    });
    SP.register({
        id: 'extract', category: 'organize', icon: 'fa-file-export', hue: 'blue',
        title: 'Ekstrak Halaman', desc: 'Ambil halaman tertentu saja menjadi file PDF baru.',
        keywords: 'ambil pilih halaman',
        mount: (root, ctx) => mountEditor(root, ctx, 'extract'),
    });
})();
