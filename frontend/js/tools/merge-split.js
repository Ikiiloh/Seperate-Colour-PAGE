/** Merge and Split tools. */
(function () {
    'use strict';

    // ====================================================================
    // MERGE
    // ====================================================================
    function mountMerge(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        let uid = 0;
        const items = new Map(); // id -> { file, buffer, pdf, numPages }
        let list = null;
        let action = null;
        let summary = null;

        const drop = SP.dropzone({
            accept: '.pdf,application/pdf', multiple: true,
            title: 'Tarik & lepaskan beberapa file PDF di sini',
            spec: `Pilih 2 file atau lebih | Maksimal ${SP.MAX_MB} MB per file`,
            filter: SP.isPdf,
            onFiles: (files) => addFiles(files),
        });
        stage.appendChild(drop);

        async function addFiles(files) {
            await SP.run('Membaca file PDF...', async (progress) => {
                let n = 0;
                for (const file of files) {
                    try {
                        const doc = await SP.loadPdf(file);
                        const id = ++uid;
                        items.set(id, doc);
                        ensureUi();
                        list.appendChild(buildItem(id, doc));
                    } catch (e) {
                        SP.toast(`${file.name}: ${e.message}`, 'error');
                    }
                    progress((++n / files.length) * 100);
                }
            });
            refresh();
        }

        function ensureUi() {
            if (list) return;
            drop.querySelector('h2').textContent = 'Tambah file PDF lainnya';
            drop.classList.add('compact');
            const head = SP.h(`
                <div class="skeuo-card tool-options">
                    <p class="opt-hint">Seret untuk mengubah urutan. File akan digabung sesuai urutan dari atas ke bawah.</p>
                    <div class="opt-row"></div>
                </div>`);
            const sortBtn = SP.h('<button type="button" class="skeuo-btn"><i class="fa-solid fa-arrow-down-a-z"></i> Urutkan A–Z</button>');
            sortBtn.addEventListener('click', () => {
                Array.from(list.children)
                    .sort((a, b) => items.get(+a.dataset.id).file.name.localeCompare(items.get(+b.dataset.id).file.name, undefined, { numeric: true }))
                    .forEach((el) => list.appendChild(el));
            });
            head.querySelector('.opt-row').appendChild(sortBtn);
            list = SP.h('<div class="file-list"></div>');
            SP.sortable(list, { itemSelector: '.file-item', axis: 'y', onReorder: () => {} });
            action = SP.actionBar({ label: 'Gabungkan PDF', icon: 'fa-object-group', onClick: process });
            stage.appendChild(head);
            stage.appendChild(list);
            stage.appendChild(action.el);
        }

        function buildItem(id, doc) {
            const el = SP.h(`
                <div class="file-item skeuo-inset-panel" draggable="true" data-id="${id}">
                    <i class="fa-solid fa-grip-vertical grip"></i>
                    <div class="file-thumb"><canvas></canvas></div>
                    <div class="file-meta"><strong></strong><small></small></div>
                    <div class="file-actions">
                        <button type="button" class="tile-btn" data-act="up" title="Naikkan"><i class="fa-solid fa-chevron-up"></i></button>
                        <button type="button" class="tile-btn" data-act="down" title="Turunkan"><i class="fa-solid fa-chevron-down"></i></button>
                        <button type="button" class="tile-btn danger" data-act="del" title="Hapus dari daftar"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>`);
            el.querySelector('strong').textContent = doc.file.name;
            el.querySelector('small').textContent = `${doc.numPages} halaman • ${SP.fmtSize(doc.file.size)}`;
            el.addEventListener('click', (e) => {
                const b = e.target.closest('button');
                if (!b) return;
                if (b.dataset.act === 'up') SP.moveItem(el, -1);
                if (b.dataset.act === 'down') SP.moveItem(el, 1);
                if (b.dataset.act === 'del') { items.delete(id); doc.pdf.destroy(); el.remove(); refresh(); }
            });
            const c = el.querySelector('canvas');
            SP.thumb.observe(c, doc.pdf, 1, {
                maxW: 90,
                onDone: () => {
                    const s = Math.min(54 / c.width, 70 / c.height);
                    c.style.width = c.width * s + 'px'; c.style.height = c.height * s + 'px';
                },
            });
            return el;
        }

        function refresh() {
            if (!action) return;
            const docs = Array.from(items.values());
            const pages = docs.reduce((s, d) => s + d.numPages, 0);
            action.setSummary(`<b>${docs.length}</b> file • total <b>${pages}</b> halaman`);
            action.setDisabled(docs.length < 2);
        }

        async function process() {
            const ordered = Array.from(list.children).map((el) => items.get(+el.dataset.id));
            const out = await SP.run('Menggabungkan PDF...', async (progress) => {
                const merged = await PDFLib.PDFDocument.create();
                let i = 0;
                for (const d of ordered) {
                    const src = await SP.openPdfLib(d.buffer, d.file.name);
                    const pages = await merged.copyPages(src, src.getPageIndices());
                    pages.forEach((p) => merged.addPage(p));
                    progress((++i / ordered.length) * 90, `Menggabungkan ${d.file.name}...`);
                    await SP.tick();
                }
                progress(95, 'Menyimpan...');
                return { bytes: await merged.save(), pages: merged.getPageCount() };
            });
            if (!out) return;
            stage.innerHTML = '';
            stage.appendChild(SP.resultCard({
                blob: SP.pdfBlob(out.bytes), filename: 'gabungan.pdf',
                lines: [`<b>${ordered.length}</b> file digabung menjadi <b>${out.pages}</b> halaman.`],
                onAgain: ctx.reset,
            }));
        }
    }

    // ====================================================================
    // SPLIT
    // ====================================================================
    function mountSplit(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        stage.appendChild(SP.dropzone({
            accept: '.pdf,application/pdf',
            title: 'Tarik & lepaskan file PDF di sini',
            spec: `Format PDF | Maksimal ${SP.MAX_MB} MB`,
            filter: SP.isPdf,
            onFiles: async ([file]) => {
                const doc = await SP.run('Membuka PDF...', () => SP.loadPdf(file));
                if (doc) start(doc);
            },
        }));

        function start(doc) {
            stage.innerHTML = '';
            stage.appendChild(SP.fileBar({ name: doc.file.name, size: doc.file.size, pages: doc.numPages, onChange: ctx.reset }));

            const panel = SP.h(`
                <div class="skeuo-card tool-options">
                    <div class="seg" role="tablist">
                        <button type="button" class="seg-btn active" data-mode="range">Berdasarkan rentang</button>
                        <button type="button" class="seg-btn" data-mode="every">Setiap N halaman</button>
                    </div>
                    <div class="mode-pane" data-pane="range">
                        <div class="field">
                            <label for="splitRanges">Rentang halaman <small>(pisahkan dengan koma)</small></label>
                            <input id="splitRanges" type="text" class="text-input" placeholder="contoh: 1-3, 5, 8-" autocomplete="off">
                            <small class="field-hint">Setiap rentang menjadi satu file PDF. Tanda "-" di akhir berarti sampai halaman terakhir.</small>
                        </div>
                        <label class="chk"><input type="checkbox" id="splitMerge"> <span>Gabungkan semua rentang menjadi <b>satu</b> file PDF</span></label>
                    </div>
                    <div class="mode-pane hidden" data-pane="every">
                        <div class="field">
                            <label for="splitN">Jumlah halaman per file</label>
                            <input id="splitN" type="number" min="1" max="${doc.numPages}" value="1" class="text-input narrow">
                            <small class="field-hint" id="splitNHint"></small>
                        </div>
                    </div>
                </div>`);
            stage.appendChild(panel);
            const action = SP.actionBar({ label: 'Pisahkan PDF', icon: 'fa-scissors', onClick: process });
            stage.appendChild(action.el);

            let mode = 'range';
            const rangeEl = panel.querySelector('#splitRanges');
            const mergeEl = panel.querySelector('#splitMerge');
            const nEl = panel.querySelector('#splitN');

            panel.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
                mode = b.dataset.mode;
                panel.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
                panel.querySelectorAll('.mode-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== mode));
                refresh();
            }));
            [rangeEl, mergeEl, nEl].forEach((e) => e.addEventListener('input', refresh));

            function plan() {
                if (mode === 'every') {
                    const n = Math.max(1, parseInt(nEl.value, 10) || 1);
                    const groups = [];
                    for (let s = 1; s <= doc.numPages; s += n) groups.push([s, Math.min(s + n - 1, doc.numPages)]);
                    return { groups, single: false };
                }
                const groups = SP.parseRanges(rangeEl.value, doc.numPages);
                return { groups, single: mergeEl.checked };
            }

            function refresh() {
                try {
                    const p = plan();
                    const files = p.single ? 1 : p.groups.length;
                    action.setSummary(`Akan menghasilkan <b>${files}</b> file PDF${files > 1 ? ' (dalam ZIP)' : ''}`);
                    action.setDisabled(false);
                } catch (e) {
                    action.setSummary(mode === 'range' && !rangeEl.value ? 'Isi rentang halaman' : `<span class="err">${SP.esc(e.message)}</span>`);
                    action.setDisabled(true);
                }
                panel.querySelector('#splitNHint').textContent =
                    `Menghasilkan ${Math.ceil(doc.numPages / Math.max(1, parseInt(nEl.value, 10) || 1))} file.`;
            }
            refresh();

            async function process() {
                let p;
                try { p = plan(); } catch (e) { SP.toast(e.message, 'error'); return; }
                const base = SP.baseName(doc.file.name);

                const out = await SP.run('Memisahkan PDF...', async (progress) => {
                    const src = await SP.openPdfLib(doc.buffer, doc.file.name);
                    const files = [];
                    if (p.single) {
                        const d = await SP.extractPages(src, SP.rangesToIndices(p.groups));
                        files.push({ name: `${base}_pilihan.pdf`, data: await d.save() });
                    } else {
                        let i = 0;
                        for (const [a, b] of p.groups) {
                            const idx = []; for (let k = a - 1; k < b; k++) idx.push(k);
                            const d = await SP.extractPages(src, idx);
                            const nm = a === b ? `${base}_hal_${a}.pdf` : `${base}_hal_${a}-${b}.pdf`;
                            files.push({ name: nm, data: await d.save() });
                            progress((++i / p.groups.length) * 85, `Membuat file ${i} dari ${p.groups.length}...`);
                            await SP.tick();
                        }
                    }
                    if (files.length === 1) return { blob: SP.pdfBlob(files[0].data), name: files[0].name, count: 1 };
                    progress(92, 'Membuat ZIP...');
                    return { blob: await SP.zip(files), name: `${base}_terpisah.zip`, count: files.length };
                });
                if (!out) return;
                stage.innerHTML = '';
                stage.appendChild(SP.resultCard({
                    blob: out.blob, filename: out.name,
                    lines: [`Menghasilkan <b>${out.count}</b> file PDF${out.count > 1 ? ' dalam satu ZIP' : ''}.`],
                    onAgain: ctx.reset,
                }));
            }
        }
    }

    SP.register({
        id: 'merge', category: 'organize', icon: 'fa-object-group', hue: 'orange',
        title: 'Gabung PDF', desc: 'Satukan beberapa file PDF menjadi satu dokumen dengan urutan sesukamu.',
        keywords: 'merge combine satukan',
        mount: mountMerge,
    });
    SP.register({
        id: 'split', category: 'organize', icon: 'fa-scissors', hue: 'orange',
        title: 'Pisah PDF', desc: 'Bagi satu PDF menjadi beberapa file berdasarkan rentang atau jumlah halaman.',
        keywords: 'split potong bagi',
        mount: mountSplit,
    });
})();
