/**
 * NoPDF - "Edit Teks PDF": pilih teks di halaman, ubah langsung, simpan PDF.
 * 100% sisi klien (pdf.js untuk render & lapisan teks, pdf-lib untuk menulis).
 */
(function () {
    'use strict';

    const px = (n) => `${Math.round(n * 100) / 100}px`;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    function mountEditText(root, ctx) {
        SP.singlePdf(root, ctx, {
            async start(doc, stage) {
                const state = {
                    pdf: doc.pdf,
                    zoom: 1,
                    refs: [],
                    edits: new Map(),
                    undo: [],
                    redo: [],
                    sel: null,
                    draft: null,
                    dpr: Math.min(window.devicePixelRatio || 1, 2),
                    raf: 0,
                    zoomTimer: 0,
                };

                const shell = SP.h(`
                    <div class="pdfed">
                        <div class="pdfed-toolbar skeuo-card">
                            <button type="button" class="skeuo-btn-sm" data-act="out" title="Perkecil"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
                            <span class="pdfed-zoom">100%</span>
                            <button type="button" class="skeuo-btn-sm" data-act="in" title="Perbesar"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
                            <span class="pdfed-sep"></span>
                            <button type="button" class="skeuo-btn-sm" data-act="undo" disabled><i class="fa-solid fa-rotate-left"></i> Undo</button>
                            <button type="button" class="skeuo-btn-sm" data-act="redo" disabled><i class="fa-solid fa-rotate-right"></i> Redo</button>
                            <span class="pdfed-sep"></span>
                            <button type="button" class="skeuo-btn-sm" data-act="hl" title="Sorot area teks yang bisa diedit" aria-pressed="false"><i class="fa-solid fa-highlighter"></i> Sorot teks</button>
                            <span class="pdfed-status">Memuat halaman…</span>
                        </div>
                        <div class="pdfed-layout">
                            <div class="pdfed-viewer skeuo-inset-panel"><div class="pdfed-pages"></div></div>
                            <aside class="pdfed-side skeuo-card"></aside>
                        </div>
                    </div>`);
                stage.appendChild(shell);

                const viewer = shell.querySelector('.pdfed-viewer');
                const pagesBox = shell.querySelector('.pdfed-pages');
                const sideBox = shell.querySelector('.pdfed-side');
                const statusEl = shell.querySelector('.pdfed-status');
                const zoomEl = shell.querySelector('.pdfed-zoom');
                const btnUndo = shell.querySelector('[data-act="undo"]');
                const btnRedo = shell.querySelector('[data-act="redo"]');
                const action = SP.actionBar({ label: 'Simpan PDF', icon: 'fa-floppy-disk', onClick: save });
                action.setSummary('Belum ada perubahan');
                stage.appendChild(action.el);

                let io = null;
                let drag = null;
                let suppressClick = false;

                function stopAll() {
                    if (io) { io.disconnect(); io = null; }
                    clearTimeout(state.zoomTimer);
                    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
                    for (const ref of state.refs) {
                        if (ref.task) { try { ref.task.cancel(); } catch (e) { /* ignore */ } ref.task = null; }
                    }
                }
                SP.onCleanup(stopAll);

                const keyOf = (pageIndex, runId) => `${pageIndex}:${runId}`;
                const cloneEdits = () => new Map(Array.from(state.edits, ([k, v]) => [k, { ...v }]));

                // ----------------------------------------------------------
                // Tampilan halaman
                // ----------------------------------------------------------
                const first = await doc.pdf.getPage(1);
                const firstVp = first.getViewport({ scale: 1 });
                state.zoom = clamp((viewer.clientWidth - 40) / firstVp.width, 0.35, 1.5);

                for (let i = 0; i < doc.numPages; i++) {
                    const wrap = SP.h(`
                        <div class="pdfed-page">
                            <canvas></canvas>
                            <div class="pdfed-layer"></div>
                            <div class="pdfed-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>
                        </div>`);
                    wrap.dataset.i = i;
                    wrap.style.width = px(firstVp.width * state.zoom);
                    wrap.style.height = px(firstVp.height * state.zoom);
                    const ref = {
                        index: i, wrap,
                        canvas: wrap.querySelector('canvas'),
                        layer: wrap.querySelector('.pdfed-layer'),
                        loading: wrap.querySelector('.pdfed-loading'),
                        page: i === 0 ? first : null,
                        vp1: firstVp,
                        runs: null,
                        rendered: false,
                        busy: false,
                        again: false,
                        task: null,
                    };
                    state.refs.push(ref);
                    pagesBox.appendChild(wrap);
                }

                // Klik pada teks -> pilih baris
                pagesBox.addEventListener('click', (ev) => {
                    if (suppressClick) { suppressClick = false; return; }
                    const hit = ev.target.closest('.pdfed-hit');
                    if (!hit) return;
                    const [pi, ri] = hit.dataset.key.split(':').map(Number);
                    selectRun(pi, ri);
                });

                // Klik di luar teks (area kosong halaman) = selesaikan edit.
                viewer.addEventListener('click', (ev) => {
                    if (!state.draft || !state.draft.dirty) return;
                    if (ev.target.closest('.pdfed-hit')) return;
                    autoApply();
                });

                // Geser teks yang sedang dipilih (setelah panel terbuka).
                pagesBox.addEventListener('pointerdown', (ev) => {
                    const hit = ev.target.closest('.pdfed-hit');
                    if (!hit || !state.sel || !state.draft || hit.dataset.key !== state.sel.key) return;
                    const [pi] = hit.dataset.key.split(':').map(Number);
                    drag = {
                        pi, x: ev.clientX, y: ev.clientY,
                        dx0: state.draft.dx || 0, dy0: state.draft.dy || 0,
                        moved: false,
                    };
                    try { pagesBox.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
                });
                pagesBox.addEventListener('pointermove', (ev) => {
                    if (!drag) return;
                    const mx = (ev.clientX - drag.x) / state.zoom;
                    const my = (ev.clientY - drag.y) / state.zoom;
                    if (!drag.moved && Math.hypot(mx, my) < 3) return;
                    if (!drag.moved) record(true);
                    drag.moved = true;
                    state.draft.dx = Math.round((drag.dx0 + mx) * 10) / 10;
                    state.draft.dy = Math.round((drag.dy0 + my) * 10) / 10;
                    state.draft.dirty = true;
                    paintLayer(state.refs[drag.pi]);
                    ev.preventDefault();
                });
                const endDrag = () => {
                    if (drag && drag.moved) suppressClick = true;
                    drag = null;
                };
                pagesBox.addEventListener('pointerup', endDrag);
                pagesBox.addEventListener('pointercancel', endDrag);

                async function ensureRendered(idx) {
                    const ref = state.refs[idx];
                    if (!ref) return;
                    if (ref.busy) { ref.again = true; return; }
                    ref.busy = true;
                    try {
                        if (!ref.page) ref.page = await doc.pdf.getPage(idx + 1);
                        ref.vp1 = ref.page.getViewport({ scale: 1 });
                        await paintCanvas(ref);
                    } catch (e) {
                        if (!e || e.name !== 'RenderingCancelledException') {
                            console.error(e);
                            ref.loading.innerHTML = '<span style="font-size:.85rem;padding:12px;text-align:center">Halaman gagal dimuat</span>';
                        }
                    } finally {
                        ref.busy = false;
                        if (ref.again) { ref.again = false; ensureRendered(idx); }
                    }
                }

                async function paintCanvas(ref) {
                    const zoom = state.zoom;
                    const canvasScale = zoom * state.dpr;
                    const vp = ref.page.getViewport({ scale: canvasScale });
                    const cssW = ref.vp1.width * zoom;
                    const cssH = ref.vp1.height * zoom;
                    if (ref.task) { try { ref.task.cancel(); } catch (e) { /* ignore */ } ref.task = null; }
                    ref.wrap.style.width = px(cssW);
                    ref.wrap.style.height = px(cssH);
                    ref.canvas.style.width = px(cssW);
                    ref.canvas.style.height = px(cssH);
                    ref.canvas.width = Math.max(1, Math.round(vp.width));
                    ref.canvas.height = Math.max(1, Math.round(vp.height));
                    const c2d = ref.canvas.getContext('2d', { willReadFrequently: true });
                    c2d.fillStyle = '#fff';
                    c2d.fillRect(0, 0, ref.canvas.width, ref.canvas.height);
                    const task = ref.page.render({ canvasContext: c2d, viewport: vp });
                    ref.task = task;
                    try { await task.promise; } catch (e) {
                        if (e && e.name === 'RenderingCancelledException') return;
                        throw e;
                    }
                    ref.task = null;
                    // Font asli baru tersedia setelah halaman dirender, jadi
                    // ekstraksi baris dilakukan sesudah render.
                    if (!ref.runs) {
                        ref.runs = await P2E.collectRuns(ref.page);
                        ref.runs.forEach((r, i) => { r.id = i; });
                        for (const run of ref.runs) run.key = keyOf(ref.index, run.id);
                    }
                    const img = P2E.readPixels(ref.canvas);
                    for (const run of ref.runs) {
                        if (!run.bg) {
                            const c = P2E.sampleColors(img, canvasScale, run);
                            run.ink = c.ink;
                            run.bg = c.bg;
                        }
                    }
                    ref.rendered = true;
                    ref.loading.classList.add('hidden');
                    paintLayer(ref);
                    updateStatus();
                }

                /** Offset dari atas kotak baris ke baseline, memakai metrik font asli. */
                function textTop(run, size, cssFont, edit) {
                    const S = size * state.zoom;
                    measure.font = P2E.fontSpec(S, run, edit, cssFont);
                    const m = measure.measureText('Ag');
                    const asc = m.fontBoundingBoxAscent || S * 0.8;
                    const desc = m.fontBoundingBoxDescent || S * 0.2;
                    const baseFromTop = (S - (asc + desc)) / 2 + asc;
                    return (run.baseline - run.y0) * state.zoom - baseFromTop;
                }

                const measure = document.createElement('canvas').getContext('2d');

                /** Ukuran efektif setelah pengecilan otomatis (sama dengan ekspor). */
                function fittedSize(run, edit, lines) {
                    if (edit.fit !== true || !(edit.size > 0)) return edit.size;
                    const cssFont = P2E.cssFont(run, edit.family);
                    measure.font = P2E.fontSpec(edit.size * state.zoom, run, edit, cssFont);
                    let widest = 0;
                    for (const ln of lines) widest = Math.max(widest, measure.measureText(ln || ' ').width);
                    const avail = Math.max(4, run.w * state.zoom - 1);
                    return widest > avail ? edit.size * Math.max(0.6, avail / widest) : edit.size;
                }

                function measureLinePx(text, sizePx, run, edit, cssFont) {
                    measure.font = P2E.fontSpec(sizePx, run, edit, cssFont);
                    return measure.measureText(text || ' ').width;
                }

                function paintLayer(ref) {
                    const zoom = state.zoom;
                    const layer = ref.layer;
                    layer.innerHTML = '';
                    if (!ref.runs) return;
                    if (!ref.runs.length) {
                        const note = document.createElement('div');
                        note.className = 'pdfed-note';
                        note.textContent = 'Halaman ini tidak punya teks yang bisa diedit — kemungkinan hasil scan (gambar).';
                        layer.appendChild(note);
                        return;
                    }
                    let ring = null;
                    let ringKey = null;

                    for (const run of ref.runs) {
                        const edit = (state.draft && state.draft.key === run.key) ? state.draft : state.edits.get(run.key);
                        const el = document.createElement('div');
                        el.className = 'pdfed-hit';
                        el.dataset.key = run.key;
                        el.style.left = px(run.x0 * zoom);
                        el.style.top = px(run.y0 * zoom);
                        el.style.width = px(Math.max(4, run.w * zoom));
                        el.style.height = px(Math.max(6, run.h * zoom));

                        if (edit) {
                            el.classList.add('has-edit');
                            const lines = String(edit.text || '').split('\n');
                            const drawn = fittedSize(run, edit, lines);
                            const lh = drawn * 1.16;
                            const extra = edit.deleted ? 0 : Math.max(0, lines.length - 1) * lh * zoom;
                            const patch = document.createElement('div');
                            patch.className = 'pdfed-patch';
                            patch.style.background = edit.bg || '#ffffff';
                            el.appendChild(patch);
                            el.style.height = px(Math.max(6, run.h * zoom + extra));
                            if (!edit.deleted && edit.text) {
                                const cssFont = P2E.cssFont(run, edit.family);
                                const dx = (edit.dx || 0) * zoom;
                                const dy = (edit.dy || 0) * zoom;
                                const runW = Math.max(4, run.w);
                                const align = edit.align || 'left';
                                const parts = P2E.fontParts(run, edit);
                                lines.forEach((ln, i) => {
                                    if (!ln) return;
                                    const textW = measureLinePx(ln, drawn * zoom, run, edit, cssFont) / zoom;
                                    const shift = align === 'center' ? (runW - textW) / 2
                                        : align === 'right' ? runW - textW : 0;
                                    const txt = document.createElement('div');
                                    txt.className = 'pdfed-new';
                                    txt.textContent = ln;
                                    txt.dataset.key = run.key;
                                    txt.style.left = px(1 + (shift + (edit.dx || 0)) * zoom);
                                    txt.style.top = px(textTop(run, drawn, cssFont, edit) + i * lh * zoom + dy + 1);
                                    txt.style.fontSize = px(drawn * zoom);
                                    txt.style.lineHeight = '1';
                                    txt.style.fontFamily = cssFont;
                                    txt.style.fontWeight = parts.weight;
                                    txt.style.fontStyle = parts.style;
                                    txt.style.color = edit.ink || '#000000';
                                    el.appendChild(txt);
                                });
                            }
                        }

                        if (state.sel && state.sel.key === run.key) {
                            el.classList.add('is-sel');
                            ringKey = run.key;
                        }
                        layer.appendChild(el);
                    }

                    if (ringKey) {
                        const hit = layer.querySelector(`.pdfed-hit[data-key="${ringKey}"]`);
                        const lines = hit ? hit.querySelectorAll('.pdfed-new') : [];
                        if (lines.length) {
                            const first = lines[0];
                            const last = lines[lines.length - 1];
                            let w = 0;
                            for (const t of lines) w = Math.max(w, t.offsetWidth);
                            ring = {
                                left: hit.offsetLeft + first.offsetLeft,
                                top: hit.offsetTop + first.offsetTop,
                                width: w,
                                height: last.offsetTop + last.offsetHeight - first.offsetTop,
                            };
                        } else if (hit) {
                            ring = { left: hit.offsetLeft, top: hit.offsetTop, width: hit.offsetWidth, height: hit.offsetHeight };
                        }
                    }

                    if (ring) {
                        const r = document.createElement('div');
                        r.className = 'pdfed-ring';
                        r.style.left = px(ring.left - 2);
                        r.style.top = px(ring.top - 2);
                        r.style.width = px(ring.width + 4);
                        r.style.height = px(ring.height + 4);
                        layer.appendChild(r);
                    }
                }

                // ----------------------------------------------------------
                // Panel samping
                // ----------------------------------------------------------
                const familyLabel = (f) => (f === 'serif' ? 'Times / serif' : f === 'mono' ? 'Courier / monospace' : 'Arial / sans');

                function renderSideDefault() {
                    state.sel = null;
                    state.draft = null;
                    sideBox.innerHTML = '';
                    const panel = SP.h(`
                        <div class="pdfed-panel">
                            <div class="pdfed-panel-head"><span><i class="fa-solid fa-pen-to-square"></i> Edit Teks PDF</span></div>
                            <p class="opt-hint">Klik teks mana pun di halaman untuk mengubah isi, ukuran, warna, atau menghapusnya. Hasil disimpan sebagai PDF baru; file asli tidak diubah.</p>
                            <div class="pdfed-list"></div>
                            <button type="button" class="skeuo-btn-sm pdfed-danger" data-act="clear"><i class="fa-solid fa-trash-can"></i> Hapus semua perubahan</button>
                        </div>`);
                    sideBox.appendChild(panel);
                    const list = panel.querySelector('.pdfed-list');
                    const clearBtn = panel.querySelector('[data-act="clear"]');
                    clearBtn.disabled = !state.edits.size;
                    if (!state.edits.size) {
                        list.appendChild(SP.h('<p class="pdfed-empty"><i class="fa-regular fa-hand-pointer"></i> Belum ada teks diubah.</p>'));
                    } else {
                        const byPage = new Map();
                        for (const e of state.edits.values()) {
                            if (!byPage.has(e.pageIndex)) byPage.set(e.pageIndex, []);
                            byPage.get(e.pageIndex).push(e);
                        }
                        for (const [pi, arr] of Array.from(byPage).sort((a, b) => a[0] - b[0])) {
                            list.appendChild(SP.h(`<div class="pdfed-list-head">Halaman ${pi + 1}</div>`));
                            for (const e of arr) {
                                const row = SP.h(`<button type="button" class="pdfed-list-row"><i class="fa-solid ${e.deleted ? 'fa-eraser' : 'fa-pen'}"></i><span></span></button>`);
                                row.querySelector('span').textContent = e.deleted ? '(teks dihapus)' : e.text.split('\n')[0].slice(0, 70);
                                row.addEventListener('click', () => {
                                    state.refs[e.pageIndex].wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    setTimeout(() => selectRun(e.pageIndex, e.runId), 260);
                                });
                                list.appendChild(row);
                            }
                        }
                    }
                    clearBtn.addEventListener('click', () => {
                        if (!state.edits.size) return;
                        commitPoint();
                        state.edits.clear();
                        for (const ref of state.refs) if (ref.rendered) paintLayer(ref);
                        renderSideDefault();
                        refreshMeta();
                    });
                }

                function openPanel(focus) {
                    const d = state.draft;
                    if (!d) { renderSideDefault(); return; }
                    const run = state.sel.run;
                    sideBox.innerHTML = '';
                    const panel = SP.h(`
                        <div class="pdfed-panel">
                            <div class="pdfed-panel-head">
                                <span><i class="fa-solid fa-pen"></i> ${d.deleted ? 'Hapus teks' : 'Edit teks'} • Halaman ${d.pageIndex + 1}</span>
                                <button type="button" class="skeuo-btn-sm" data-act="close" title="Tutup"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                            <label class="field"><span>Teks</span>
                                <textarea class="text-input pdfed-textarea" rows="3" spellcheck="false"></textarea>
                            </label>
                            <div class="opt-grid two">
                                <div class="field"><label>Ukuran <small>pt</small></label>
                                    <input class="text-input" type="number" step="0.5" min="4" max="96" data-role="size">
                                </div>
                                <div class="field"><label>Warna teks</label>
                                    <input class="color-input" type="color" data-role="ink">
                                </div>
                            </div>
                            <div class="pdfed-style-row">
                                <button type="button" class="pdfed-style" data-role="bold" title="Tebal"><b>B</b></button>
                                <button type="button" class="pdfed-style" data-role="italic" title="Miring"><i>I</i></button>
                                <span class="pdfed-family"></span>
                            </div>
                            <div class="pdfed-align-row">
                                <span>Perataan</span>
                                <button type="button" class="pdfed-style" data-align="left" title="Rata kiri"><i class="fa-solid fa-align-left"></i></button>
                                <button type="button" class="pdfed-style" data-align="center" title="Rata tengah"><i class="fa-solid fa-align-center"></i></button>
                                <button type="button" class="pdfed-style" data-align="right" title="Rata kanan"><i class="fa-solid fa-align-right"></i></button>
                            </div>
                            <label class="chk pdfed-chk"><input type="checkbox" data-role="fit"> <span>Perkecil otomatis bila kepanjangan</span></label>
                            <label class="field"><span>Warna latar penutup</span>
                                <input class="color-input" type="color" data-role="bg">
                            </label>
                            <div class="pdfed-actions">
                                <button type="button" class="skeuo-btn-sm pdfed-primary" data-act="apply"><i class="fa-solid fa-check"></i> Terapkan</button>
                                <button type="button" class="skeuo-btn-sm" data-act="cancel">Batal</button>
                                <button type="button" class="skeuo-btn-sm pdfed-danger" data-act="delete"><i class="fa-solid fa-eraser"></i> Hapus</button>
                            </div>
                            <p class="opt-hint">Tarik teks di halaman untuk menggeser posisinya. Perubahan otomatis diterapkan saat kamu memilih teks lain atau mengeklik di luar teks. Ctrl+Enter menerapkan sekarang, Esc membatalkan. Teks baru memakai font asli PDF; teks lama ditutup kotak sewarna latar.</p>
                        </div>`);
                    sideBox.appendChild(panel);

                    const ta = panel.querySelector('.pdfed-textarea');
                    const sizeIn = panel.querySelector('[data-role="size"]');
                    const inkIn = panel.querySelector('[data-role="ink"]');
                    const bgIn = panel.querySelector('[data-role="bg"]');
                    const fitIn = panel.querySelector('[data-role="fit"]');
                    const boldBtn = panel.querySelector('[data-role="bold"]');
                    const italicBtn = panel.querySelector('[data-role="italic"]');
                    ta.value = d.text;
                    sizeIn.value = String(Math.round(d.size * 2) / 2);
                    inkIn.value = d.ink;
                    bgIn.value = d.bg;
                    fitIn.checked = d.fit === true;
                    boldBtn.classList.toggle('on', !!d.bold);
                    italicBtn.classList.toggle('on', !!d.italic);
                    const alignBtns = Array.from(panel.querySelectorAll('[data-align]'));
                    const syncAlign = () => alignBtns.forEach((b) => b.classList.toggle('on', b.dataset.align === (d.align || 'left')));
                    syncAlign();
                    panel.querySelector('.pdfed-family').textContent = run.fontFamily ? 'Font asli PDF' : familyLabel(run.family);

                    const repaint = () => paintLayer(state.refs[d.pageIndex]);
                    ta.addEventListener('input', () => { record(); d.text = ta.value; d.dirty = true; repaint(); });
                    ta.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyEdit(); }
                        else if (e.key === 'Escape') { e.preventDefault(); closePanel(true); }
                    });
                    sizeIn.addEventListener('input', () => {
                        const v = parseFloat(sizeIn.value);
                        if (v >= 3 && v <= 200) { record(); d.size = v; d.dirty = true; repaint(); }
                    });
                    inkIn.addEventListener('input', () => { record(); d.ink = inkIn.value; d.dirty = true; repaint(); });
                    bgIn.addEventListener('input', () => { record(); d.bg = bgIn.value; d.dirty = true; repaint(); });
                    fitIn.addEventListener('change', () => { record(true); d.fit = fitIn.checked; d.dirty = true; repaint(); });
                    boldBtn.addEventListener('click', () => { record(true); d.bold = !d.bold; d.dirty = true; boldBtn.classList.toggle('on', d.bold); repaint(); });
                    italicBtn.addEventListener('click', () => { record(true); d.italic = !d.italic; d.dirty = true; italicBtn.classList.toggle('on', d.italic); repaint(); });
                    alignBtns.forEach((b) => b.addEventListener('click', () => {
                        record(true);
                        d.align = b.dataset.align;
                        d.dirty = true;
                        syncAlign();
                        repaint();
                    }));
                    panel.querySelector('[data-act="close"]').addEventListener('click', () => closePanel());
                    panel.querySelector('[data-act="cancel"]').addEventListener('click', () => closePanel(true));
                    panel.querySelector('[data-act="apply"]').addEventListener('click', () => applyEdit());
                    panel.querySelector('[data-act="delete"]').addEventListener('click', () => {
                        record(true);
                        d.deleted = true;
                        d.text = '';
                        ta.value = '';
                        d.dirty = true;
                        repaint();
                        applyEdit({ keepHistory: false });
                    });
                    if (focus !== false) setTimeout(() => { ta.focus(); ta.select(); }, 30);
                }

                function closePanel(discard) {
                    const d = state.draft;
                    if (d && d.dirty) {
                        if (!discard) { autoApply(); return; }
                        SP.toast('Perubahan dibatalkan.', 'info');
                    }
                    state.draft = null;
                    state.sel = null;
                    for (const ref of state.refs) if (ref.rendered) paintLayer(ref);
                    renderSideDefault();
                }

                function selectRun(pageIndex, runId) {
                    const ref = state.refs[pageIndex];
                    if (!ref || !ref.runs || !ref.runs[runId]) return;
                    const key = keyOf(pageIndex, runId);
                    if (state.sel && state.sel.key === key) return;
                    // Pindah ke teks lain dianggap selesai: terapkan otomatis.
                    if (state.draft && state.draft.dirty) autoApply();
                    const run = ref.runs[runId];
                    const existing = state.edits.get(key);
                    state.sel = { key, pageIndex, runId, run, ref };
                    state.draft = existing
                        ? { ...existing, dirty: false }
                        : {
                            key, pageIndex, runId,
                            text: run.text,
                            size: Math.round(run.size * 2) / 2,
                            bold: run.bold,
                            italic: run.italic,
                            ink: run.ink || '#000000',
                            bg: run.bg || '#ffffff',
                            family: run.family,
                            deleted: false,
                            fit: false,
                            align: 'left',
                            dx: 0,
                            dy: 0,
                            dirty: false,
                        };
                    openPanel();
                    for (const r of state.refs) if (r.rendered) paintLayer(r);
                    if (window.innerWidth <= 860) sideBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                // ----------------------------------------------------------
                // Simpan perubahan & geometri
                // ----------------------------------------------------------
                // Riwayat menyimpan kondisi sebelum tiap perubahan — termasuk
                // draft yang sedang diketik/digeser — supaya tombol Urungkan
                // langsung bereaksi tanpa perlu menekan "Terapkan" dulu.
                let lastGesture = 0;

                function snapshot() {
                    return { edits: cloneEdits(), draft: state.draft ? { ...state.draft } : null };
                }

                function record(force) {
                    const now = performance.now();
                    if (!force && now - lastGesture < 700) { lastGesture = now; return; }
                    lastGesture = now;
                    state.undo.push(snapshot());
                    if (state.undo.length > 80) state.undo.shift();
                    state.redo.length = 0;
                    refreshMeta();
                }

                /** Titik simpan untuk perubahan yang diterapkan (panel ditutup). */
                function commitPoint() {
                    lastGesture = 0;
                    state.undo.push({ edits: cloneEdits(), draft: null });
                    if (state.undo.length > 80) state.undo.shift();
                    state.redo.length = 0;
                    refreshMeta();
                }

                function buildGeom(ref, run) {
                    const vp = ref.vp1;
                    const P = (x, y) => vp.convertToPdfPoint(x, y);
                    const [ax, ay] = P(run.x0 - 1.5, run.y0 - 1.5);
                    const [bx, by] = P(run.x1 + 1.5, run.y1 + 1.5);
                    const rect = {
                        x: Math.min(ax, bx), y: Math.min(ay, by),
                        w: Math.max(0.5, Math.abs(bx - ax)), h: Math.max(0.5, Math.abs(by - ay)),
                    };
                    const [px0, py0] = P(run.x0, run.baseline);
                    const [px1, py1] = P(run.x0 + 48, run.baseline);
                    const [qx, qy] = P(run.x0, run.baseline + 48);
                    let rot = Math.atan2(py1 - py0, px1 - px0) * 180 / Math.PI;
                    rot = Math.round(rot / 90) * 90;
                    return {
                        rect,
                        base: { x: px0, y: py0 },
                        down: { x: (qx - px0) / 48, y: (qy - py0) / 48 },
                        rot,
                    };
                }

                function applyEdit(opts) {
                    const { keepHistory = true, silent = false } = opts || {};
                    const d = state.draft;
                    if (!d) return;
                    const text = String(d.text || '').replace(/\r/g, '');
                    if (!d.deleted && !text.trim()) {
                        SP.toast('Teks tidak boleh kosong. Gunakan "Hapus" untuk menghapus teks.', 'error');
                        return;
                    }
                    const ref = state.refs[d.pageIndex];
                    const run = ref.runs[d.runId];
                    const geom = buildGeom(ref, run);
                    const [ox0, oy0] = ref.vp1.convertToPdfPoint(run.x0, run.baseline);
                    const [ox1, oy1] = ref.vp1.convertToPdfPoint(run.x0 + (d.dx || 0), run.baseline + (d.dy || 0));
                    geom.offset = { x: ox1 - ox0, y: oy1 - oy0 };
                    if (keepHistory) commitPoint();
                    state.edits.set(d.key, {
                        key: d.key,
                        pageIndex: d.pageIndex,
                        runId: d.runId,
                        text,
                        size: d.size,
                        bold: !!d.bold,
                        italic: !!d.italic,
                        ink: d.ink,
                        bg: d.bg,
                        family: run.family,
                        deleted: !!d.deleted,
                        fit: d.fit === true,
                        align: d.align || 'left',
                        dx: d.dx || 0,
                        dy: d.dy || 0,
                        geom,
                        run,
                    });
                    state.draft = null;
                    state.sel = null;
                    paintLayer(ref);
                    renderSideDefault();
                    refreshMeta();
                    if (!silent) SP.toast('Teks diperbarui. Klik "Simpan PDF" untuk mengunduh.', 'ok');
                }

                /**
                 * Terapkan draft yang sedang diedit tanpa menekan "Terapkan":
                 * dipakai saat pindah ke teks lain atau mengeklik di luar teks.
                 */
                function autoApply() {
                    const d = state.draft;
                    if (!d || !d.dirty) return;
                    if (!d.deleted && !String(d.text || '').trim()) {
                        state.draft = null;
                        state.sel = null;
                        for (const ref of state.refs) if (ref.rendered) paintLayer(ref);
                        renderSideDefault();
                        return;
                    }
                    applyEdit({ silent: true });
                }

                function refreshMeta() {
                    btnUndo.disabled = !state.undo.length;
                    btnRedo.disabled = !state.redo.length;
                    const n = state.edits.size;
                    const del = Array.from(state.edits.values()).filter((e) => e.deleted).length;
                    if (!n) action.setSummary('Belum ada perubahan');
                    else {
                        const parts = [];
                        if (n - del) parts.push(`<b>${n - del}</b> teks diubah`);
                        if (del) parts.push(`<b>${del}</b> dihapus`);
                        action.setSummary(parts.join(' • '));
                    }
                }

                function restore(s) {
                    state.edits = s.edits;
                    state.draft = s.draft ? { ...s.draft } : null;
                    state.sel = null;
                    if (state.draft) {
                        const ref = state.refs[state.draft.pageIndex];
                        const run = ref && ref.runs ? ref.runs[state.draft.runId] : null;
                        if (run) state.sel = { key: state.draft.key, pageIndex: state.draft.pageIndex, runId: state.draft.runId, run, ref };
                        else state.draft = null;
                    }
                    lastGesture = 0;
                    for (const ref of state.refs) if (ref.rendered) paintLayer(ref);
                    if (state.draft) openPanel(false);
                    else renderSideDefault();
                    refreshMeta();
                }

                // ----------------------------------------------------------
                // Simpan ke PDF
                // ----------------------------------------------------------
                async function save() {
                    if (state.draft && state.draft.dirty) applyEdit({ silent: true });
                    if (!state.edits.size) {
                        SP.toast('Belum ada perubahan. Klik teks di halaman untuk mulai mengedit.', 'info');
                        return;
                    }
                    const list = Array.from(state.edits.values());
                    const out = await SP.run('Menyimpan PDF...', async () => {
                        const pdoc = await SP.openPdfLib(doc.buffer, doc.file.name, { updateMetadata: false });
                        await P2E.drawEdits(pdoc, list);
                        return pdoc.save();
                    });
                    if (!out) return;
                    stopAll();
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out),
                        filename: `${SP.baseName(doc.file.name)}_edit.pdf`,
                        lines: [`${list.filter((e) => !e.deleted).length} teks diubah, ${list.filter((e) => e.deleted).length} dihapus.`],
                        onAgain: ctx.reset,
                    }));
                }

                // ----------------------------------------------------------
                // Toolbar
                // ----------------------------------------------------------
                function setZoom(z) {
                    state.zoom = clamp(z, 0.3, 2.5);
                    zoomEl.textContent = Math.round(state.zoom * 100) + '%';
                    for (const ref of state.refs) {
                        ref.wrap.style.width = px(ref.vp1.width * state.zoom);
                        ref.wrap.style.height = px(ref.vp1.height * state.zoom);
                        ref.canvas.style.width = px(ref.vp1.width * state.zoom);
                        ref.canvas.style.height = px(ref.vp1.height * state.zoom);
                        if (ref.rendered) paintLayer(ref);
                    }
                    clearTimeout(state.zoomTimer);
                    state.zoomTimer = setTimeout(() => {
                        for (const ref of state.refs) if (ref.rendered) ensureRendered(ref.index);
                    }, 220);
                }

                function updateStatus() {
                    if (!state.refs.length) return;
                    const mid = viewer.scrollTop + viewer.clientHeight / 2;
                    let best = 0;
                    let bestDist = Infinity;
                    for (const ref of state.refs) {
                        const c = ref.wrap.offsetTop + ref.wrap.offsetHeight / 2;
                        const d = Math.abs(c - mid);
                        if (d < bestDist) { bestDist = d; best = ref.index; }
                    }
                    const ref = state.refs[best];
                    const n = ref && ref.runs ? ref.runs.length : 0;
                    const tip = ref && ref.runs
                        ? (n ? `<span class="pdfed-tip">• ${n} baris teks bisa diedit</span>` : '<span class="pdfed-tip">• tidak ada teks di halaman ini</span>')
                        : '<span class="pdfed-tip">• klik teks untuk mengedit</span>';
                    statusEl.innerHTML = `Halaman <b>${best + 1}</b> / ${doc.numPages} ${tip}`;
                }

                shell.querySelector('.pdfed-toolbar').addEventListener('click', (ev) => {
                    const btn = ev.target.closest('[data-act]');
                    if (!btn) return;
                    const act = btn.dataset.act;
                    if (act === 'in') setZoom(state.zoom * 1.15);
                    else if (act === 'out') setZoom(state.zoom / 1.15);
                    else if (act === 'undo') { if (state.undo.length) { state.redo.push(snapshot()); restore(state.undo.pop()); } }
                    else if (act === 'redo') { if (state.redo.length) { state.undo.push(snapshot()); restore(state.redo.pop()); } }
                    else if (act === 'hl') {
                        const on = shell.classList.toggle('show-hits');
                        btn.classList.toggle('on', on);
                        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    }
                });

                viewer.addEventListener('scroll', () => {
                    if (state.raf) return;
                    state.raf = requestAnimationFrame(() => { state.raf = 0; updateStatus(); });
                }, { passive: true });

                io = new IntersectionObserver((entries) => {
                    for (const en of entries) {
                        if (en.isIntersecting) ensureRendered(Number(en.target.dataset.i));
                    }
                }, { root: viewer, rootMargin: '1000px 0px' });
                state.refs.forEach((r) => io.observe(r.wrap));

                zoomEl.textContent = Math.round(state.zoom * 100) + '%';
                renderSideDefault();
                refreshMeta();
                ensureRendered(0);
                setTimeout(updateStatus, 50);
            },
        });
    }

    SP.register({
        id: 'editteks',
        category: 'edit',
        icon: 'fa-pen-to-square',
        hue: 'gold',
        title: 'Edit Teks PDF',
        desc: 'Klik teks mana pun di halaman untuk mengubah isinya, ukuran, warna, atau menghapusnya — seperti editor PDF.',
        keywords: 'edit text teks tulis ubah ganti pdf editor adobe word langsung',
        mount: mountEditText,
    });
})();
