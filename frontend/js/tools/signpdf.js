/** Sign PDF: gambar, ketik, atau unggah tanda tangan lalu tempel ke halaman. */
(function () {
    'use strict';

    const px = (n) => `${Math.round(n * 100) / 100}px`;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const PAD_W = 1000;
    const PAD_H = 300;
    const MAX_SIG_FILE = 20 * 1024 * 1024;

    const FONTS = [
        { value: "'Segoe Script', 'Brush Script MT', cursive", label: 'Segoe Script' },
        { value: "'Brush Script MT', 'Segoe Script', cursive", label: 'Brush Script' },
        { value: "'Lucida Handwriting', 'Segoe Script', cursive", label: 'Lucida Handwriting' },
        { value: "'Ink Free', 'Segoe Script', cursive", label: 'Ink Free' },
        { value: 'cursive', label: 'Cursive (bawaan sistem)' },
    ];

    const newCanvas = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    };

    const cloneCanvas = (src) => {
        const c = newCanvas(src.width, src.height);
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    };

    /** Buang area transparan di sekeliling tanda tangan. */
    function trimCanvas(src, pad = 4) {
        const w = src.width;
        const h = src.height;
        if (!w || !h) return null;
        const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        let x0 = w;
        let y0 = h;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] <= 6) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return null;
        const cw = x1 - x0 + 1;
        const ch = y1 - y0 + 1;
        const out = newCanvas(cw + pad * 2, ch + pad * 2);
        out.getContext('2d').drawImage(src, x0, y0, cw, ch, pad, pad, cw, ch);
        return out;
    }

    /** Jadikan piksel hampir putih transparan (untuk foto/scan tanda tangan). */
    function removeWhite(canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            if (!d[i + 3]) continue;
            const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            if (lum >= 238) d[i + 3] = 0;
            else if (lum >= 210) d[i + 3] = Math.round(d[i + 3] * ((238 - lum) / 28));
        }
        ctx.putImageData(img, 0, 0);
    }

    /** Tempel gambar PNG transparan ke halaman, mengikuti rotasi halaman. */
    function stampImage(page, image, rect) {
        const g = SP.pageGeometry(page);
        const p = g.toUser(rect.x * g.visW, (1 - rect.y - rect.h) * g.visH);
        page.drawImage(image, {
            x: p.x,
            y: p.y,
            width: rect.w * g.visW,
            height: rect.h * g.visH,
            rotate: PDFLib.degrees(g.angle),
        });
    }

    function mountSign(root, ctx) {
        SP.singlePdf(root, ctx, {
            title: 'Tarik & lepaskan file PDF yang akan ditandatangani',
            spec: 'Format PDF | Diproses 100% lokal & offline di browsermu',
            async start(doc, stage) {
                const shell = SP.h(`
                    <div>
                        <div class="sign-layout">
                            <aside class="sign-side skeuo-card">
                                <div class="pdfed-panel-head"><span><i class="fa-solid fa-signature"></i> Buat Tanda Tangan</span></div>
                                <div class="seg sign-modes">
                                    <button type="button" class="seg-btn active" data-mode="draw"><i class="fa-solid fa-pen"></i> Gambar</button>
                                    <button type="button" class="seg-btn" data-mode="type"><i class="fa-solid fa-font"></i> Ketik</button>
                                    <button type="button" class="seg-btn" data-mode="upload"><i class="fa-solid fa-image"></i> Unggah</button>
                                </div>
                                <div class="sign-pad-box">
                                    <canvas class="sign-pad" width="${PAD_W}" height="${PAD_H}" aria-label="Area tanda tangan"></canvas>
                                    <div class="sign-pad-empty">
                                        <i class="fa-solid fa-pen-nib"></i>
                                        <span>Gambar tanda tangan di sini</span>
                                    </div>
                                </div>
                                <div class="sign-controls">
                                    <div class="field"><label>Warna tinta</label>
                                        <input type="color" class="color-input" data-role="ink" value="#111827"></div>
                                    <div class="field draw-only"><label>Ketebalan <small data-role="penVal">3</small></label>
                                        <input type="range" class="skeuo-slider" min="1" max="8" step="0.5" value="3" data-role="pen"></div>
                                </div>
                                <div class="sign-draw-actions draw-only">
                                    <button type="button" class="skeuo-btn-sm" data-act="undo" disabled><i class="fa-solid fa-rotate-left"></i> Urungkan</button>
                                    <button type="button" class="skeuo-btn-sm" data-act="clear"><i class="fa-solid fa-eraser"></i> Bersihkan</button>
                                </div>
                                <div class="sign-pane sign-type" data-pane="type" hidden>
                                    <label class="field"><span>Nama / teks tanda tangan</span>
                                        <input type="text" class="text-input" data-role="typeText" maxlength="60" placeholder="Tulis nama lengkap" autocomplete="off" spellcheck="false"></label>
                                    <label class="field"><span>Gaya huruf</span>
                                        <select class="text-input" data-role="typeFont">
                                            ${FONTS.map((f) => `<option value="${SP.esc(f.value)}">${SP.esc(f.label)}</option>`).join('')}
                                        </select></label>
                                </div>
                                <div class="sign-pane sign-upload" data-pane="upload" hidden>
                                    <input type="file" class="file-input" accept="image/png,image/jpeg,image/webp" data-role="sigFile" hidden>
                                    <button type="button" class="skeuo-btn-sm sign-upload-btn" data-act="pick"><i class="fa-solid fa-image"></i> Pilih gambar tanda tangan</button>
                                    <p class="sign-file" data-role="fileName">PNG transparan paling rapi. JPG juga bisa.</p>
                                    <label class="chk"><input type="checkbox" data-role="rmbg" checked> <span>Hapus latar putih</span></label>
                                </div>
                                <p class="sign-status" data-role="sigStatus">Belum ada tanda tangan.</p>
                                <div class="sign-divider"></div>
                                <div class="field"><label>Terapkan ke</label>
                                    <select class="text-input" data-role="pages">
                                        <option value="all">Semua halaman (${doc.numPages})</option>
                                        <option value="some">Halaman tertentu</option>
                                    </select></div>
                                <div class="field" data-role="rangeWrap" hidden><label>Rentang halaman</label>
                                    <input type="text" class="text-input" data-role="range" placeholder="contoh: 1-3, 5" autocomplete="off">
                                    <small class="sign-range-err" data-role="rangeErr"></small></div>
                                <p class="opt-hint">Seret tanda tangan di halaman untuk memindahkan; tarik titik sudut kanan bawah untuk mengubah ukuran. Tanda tangan ditempel sebagai gambar transparan tanpa mengubah isi PDF.</p>
                                <button type="button" class="skeuo-btn-sm pdfed-danger sign-remove" data-act="remove"><i class="fa-solid fa-trash-can"></i> Hapus tanda tangan</button>
                            </aside>
                            <div class="pdfed-viewer sign-viewer skeuo-inset-panel"><div class="pdfed-pages"></div></div>
                        </div>
                    </div>`);
                stage.appendChild(shell);

                const viewer = shell.querySelector('.sign-viewer');
                const pagesBox = shell.querySelector('.pdfed-pages');
                const pad = shell.querySelector('.sign-pad');
                const padCtx = pad.getContext('2d');
                const padEmpty = shell.querySelector('.sign-pad-empty');
                const inkIn = shell.querySelector('[data-role="ink"]');
                const penIn = shell.querySelector('[data-role="pen"]');
                const penVal = shell.querySelector('[data-role="penVal"]');
                const typeText = shell.querySelector('[data-role="typeText"]');
                const typeFont = shell.querySelector('[data-role="typeFont"]');
                const sigFile = shell.querySelector('[data-role="sigFile"]');
                const fileName = shell.querySelector('[data-role="fileName"]');
                const rmbg = shell.querySelector('[data-role="rmbg"]');
                const sigStatus = shell.querySelector('[data-role="sigStatus"]');
                const pagesSel = shell.querySelector('[data-role="pages"]');
                const rangeWrap = shell.querySelector('[data-role="rangeWrap"]');
                const rangeIn = shell.querySelector('[data-role="range"]');
                const rangeErr = shell.querySelector('[data-role="rangeErr"]');
                const undoBtn = shell.querySelector('[data-act="undo"]');
                const removeBtn = shell.querySelector('[data-act="remove"]');
                const modeBtns = Array.from(shell.querySelectorAll('[data-mode]'));

                const state = {
                    mode: 'draw',
                    rect: { x: 0.62, y: 0.72, w: 0.3 },
                    allPages: true,
                    sig: null,
                    sigUrl: '',
                    aspect: 3,
                    uploadOriginal: null,
                    uploadRaw: null,
                };

                const drawCanvas = newCanvas(PAD_W, PAD_H);
                const drawCtx = drawCanvas.getContext('2d');
                drawCtx.lineCap = 'round';
                drawCtx.lineJoin = 'round';
                const undoStack = [];
                const meta = [];
                const refs = [];
                const measure = document.createElement('canvas').getContext('2d');
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                let zoom = 1;
                let io = null;
                let drag = null;
                let stroke = null;
                let last = null;

                const action = SP.actionBar({
                    label: 'Unduh PDF Bertanda Tangan',
                    icon: 'fa-signature',
                    onClick: process,
                });
                stage.appendChild(action.el);

                // ------------------------------------------------------
                // Persiapan halaman
                // ------------------------------------------------------
                const pages = await SP.run('Menyiapkan halaman...', async () => {
                    const list = [];
                    for (let i = 0; i < doc.numPages; i++) {
                        const page = await doc.pdf.getPage(i + 1);
                        const vp = page.getViewport({ scale: 1 });
                        list.push({ page, w: vp.width, h: vp.height });
                    }
                    return list;
                });
                if (!pages) return;
                meta.push(...pages);

                const maxW = Math.max(...meta.map((m) => m.w));
                const available = Math.max(320, (viewer.clientWidth || 720) - 36);
                zoom = clamp(available / maxW, 0.2, 1.4);

                meta.forEach((m, i) => {
                    const wrap = SP.h(`
                        <div class="pdfed-page sign-page">
                            <canvas></canvas>
                            <div class="pdfed-layer sign-layer"></div>
                            <div class="pdfed-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>
                        </div>`);
                    wrap.dataset.i = String(i);
                    const wpx = m.w * zoom;
                    const hpx = m.h * zoom;
                    wrap.style.width = px(wpx);
                    wrap.style.height = px(hpx);
                    const canvas = wrap.querySelector('canvas');
                    canvas.style.width = px(wpx);
                    canvas.style.height = px(hpx);
                    const ref = {
                        index: i,
                        wrap,
                        canvas,
                        layer: wrap.querySelector('.pdfed-layer'),
                        loading: wrap.querySelector('.pdfed-loading'),
                        rendered: false,
                        busy: false,
                        task: null,
                    };
                    refs.push(ref);
                    pagesBox.appendChild(wrap);
                });

                io = new IntersectionObserver((entries) => {
                    entries.forEach((en) => {
                        if (!en.isIntersecting) return;
                        const idx = Number(en.target.dataset.i);
                        io.unobserve(en.target);
                        renderPage(refs[idx]);
                    });
                }, { root: viewer, rootMargin: '600px 0px' });
                refs.forEach((ref) => io.observe(ref.wrap));

                function stopAll() {
                    if (io) { io.disconnect(); io = null; }
                    refs.forEach((ref) => {
                        if (ref.task) { try { ref.task.cancel(); } catch (e) { /* ignore */ } ref.task = null; }
                    });
                }
                SP.onCleanup(stopAll);

                async function renderPage(ref) {
                    if (!ref || ref.busy || ref.rendered) return;
                    ref.busy = true;
                    try {
                        const m = meta[ref.index];
                        const vp = m.page.getViewport({ scale: zoom * dpr });
                        ref.canvas.width = Math.max(1, Math.round(vp.width));
                        ref.canvas.height = Math.max(1, Math.round(vp.height));
                        const c2d = ref.canvas.getContext('2d');
                        c2d.fillStyle = '#fff';
                        c2d.fillRect(0, 0, ref.canvas.width, ref.canvas.height);
                        const task = m.page.render({ canvasContext: c2d, viewport: vp });
                        ref.task = task;
                        await task.promise;
                        ref.task = null;
                        ref.rendered = true;
                        ref.loading.classList.add('hidden');
                    } catch (e) {
                        if (!e || e.name !== 'RenderingCancelledException') {
                            console.error(e);
                            ref.loading.innerHTML = '<span style="font-size:.82rem;padding:12px;text-align:center">Halaman gagal dimuat</span>';
                        }
                    } finally {
                        ref.busy = false;
                    }
                }

                // ------------------------------------------------------
                // Tanda tangan
                // ------------------------------------------------------
                function buildTyped() {
                    const text = typeText.value.trim();
                    if (!text) return null;
                    const family = typeFont.value;
                    let size = 250;
                    measure.font = `${size}px ${family}`;
                    let tw = measure.measureText(text).width;
                    const limit = 3000;
                    if (tw + size * 0.4 > limit) {
                        size = Math.max(90, size * limit / (tw + size * 0.4));
                        measure.font = `${size}px ${family}`;
                        tw = measure.measureText(text).width;
                    }
                    const w = Math.ceil(tw + size * 0.4);
                    const h = Math.ceil(size * 2);
                    const c = newCanvas(w, h);
                    const c2d = c.getContext('2d');
                    c2d.font = `${size}px ${family}`;
                    c2d.fillStyle = inkIn.value;
                    c2d.textBaseline = 'alphabetic';
                    c2d.fillText(text, size * 0.2, size * 1.3);
                    return trimCanvas(c, 6);
                }

                function refreshSignature() {
                    let next = null;
                    if (state.mode === 'draw') {
                        next = trimCanvas(drawCanvas, 4);
                    } else if (state.mode === 'type') {
                        next = buildTyped();
                    } else if (state.mode === 'upload') {
                        next = state.uploadRaw;
                    }
                    state.sig = next;
                    state.sigUrl = next ? next.toDataURL('image/png') : '';
                    state.aspect = next ? next.width / next.height : 3;
                    paintPad();
                    paintOverlays();
                    updateAction();
                    sigStatus.innerHTML = next
                        ? `Siap ditempel • <b>${next.width}×${next.height} px</b>`
                        : 'Belum ada tanda tangan.';
                }

                function paintPad() {
                    padCtx.clearRect(0, 0, pad.width, pad.height);
                    const src = state.mode === 'draw' ? drawCanvas : state.sig;
                    if (src) {
                        if (state.mode === 'draw') {
                            padCtx.drawImage(src, 0, 0, pad.width, pad.height);
                        } else {
                            const padAr = pad.width / pad.height;
                            const ar = src.width / src.height;
                            let w = pad.width;
                            let h = pad.height;
                            if (ar > padAr) h = pad.width / ar;
                            else w = pad.height * ar;
                            padCtx.drawImage(src, (pad.width - w) / 2, (pad.height - h) / 2, w, h);
                        }
                    }
                    padEmpty.hidden = !!state.sig;
                    if (state.mode === 'upload') {
                        padEmpty.querySelector('span').textContent = 'Unggah gambar tanda tangan';
                    } else if (state.mode === 'type') {
                        padEmpty.querySelector('span').textContent = 'Ketik nama untuk membuat tanda tangan';
                    } else {
                        padEmpty.querySelector('span').textContent = 'Gambar tanda tangan di sini';
                    }
                    pad.classList.toggle('is-drawing', state.mode === 'draw');
                }

                function setMode(mode) {
                    state.mode = mode;
                    modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
                    shell.querySelectorAll('.sign-pane').forEach((el) => {
                        el.hidden = el.dataset.pane !== mode;
                    });
                    shell.querySelectorAll('.draw-only').forEach((el) => { el.hidden = mode !== 'draw'; });
                    refreshSignature();
                }

                modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

                function padPoint(ev) {
                    const r = pad.getBoundingClientRect();
                    return {
                        x: (ev.clientX - r.left) * (pad.width / r.width),
                        y: (ev.clientY - r.top) * (pad.height / r.height),
                    };
                }

                function penWidth() {
                    const display = pad.getBoundingClientRect().width || 500;
                    return parseFloat(penIn.value) * (pad.width / display);
                }

                function pushUndo() {
                    undoStack.push(drawCtx.getImageData(0, 0, pad.width, pad.height));
                    if (undoStack.length > 12) undoStack.shift();
                    undoBtn.disabled = false;
                }

                pad.addEventListener('pointerdown', (ev) => {
                    if (state.mode !== 'draw' || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
                    ev.preventDefault();
                    pushUndo();
                    last = padPoint(ev);
                    drawCtx.strokeStyle = inkIn.value;
                    drawCtx.lineWidth = penWidth();
                    drawCtx.beginPath();
                    drawCtx.moveTo(last.x, last.y);
                    drawCtx.lineTo(last.x + 0.1, last.y);
                    drawCtx.stroke();
                    stroke = ev.pointerId;
                    paintPad();
                    try { pad.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
                });

                pad.addEventListener('pointermove', (ev) => {
                    if (stroke == null || state.mode !== 'draw') return;
                    const pt = padPoint(ev);
                    drawCtx.beginPath();
                    drawCtx.moveTo(last.x, last.y);
                    drawCtx.lineTo(pt.x, pt.y);
                    drawCtx.stroke();
                    last = pt;
                    paintPad();
                    ev.preventDefault();
                });

                const endStroke = () => {
                    if (stroke == null) return;
                    stroke = null;
                    last = null;
                    refreshSignature();
                };
                pad.addEventListener('pointerup', endStroke);
                pad.addEventListener('pointercancel', endStroke);

                undoBtn.addEventListener('click', () => {
                    const prev = undoStack.pop();
                    if (!prev) return;
                    drawCtx.putImageData(prev, 0, 0);
                    undoBtn.disabled = !undoStack.length;
                    refreshSignature();
                });

                shell.querySelector('[data-act="clear"]').addEventListener('click', () => {
                    if (state.mode !== 'draw') return;
                    pushUndo();
                    drawCtx.clearRect(0, 0, pad.width, pad.height);
                    refreshSignature();
                });

                [typeText, typeFont].forEach((el) => el.addEventListener('input', () => {
                    if (state.mode === 'type') refreshSignature();
                }));

                inkIn.addEventListener('input', () => {
                    if (state.mode === 'type') refreshSignature();
                });

                penIn.addEventListener('input', () => { penVal.textContent = penIn.value; });

                shell.querySelector('[data-act="pick"]').addEventListener('click', () => sigFile.click());

                sigFile.addEventListener('change', async () => {
                    const file = sigFile.files && sigFile.files[0];
                    sigFile.value = '';
                    if (!file) return;
                    try {
                        if (!/^image\//.test(file.type) && !SP.isImage(file)) {
                            throw new Error('Pilih file gambar (PNG/JPG) untuk tanda tangan.');
                        }
                        if (file.size > MAX_SIG_FILE) {
                            throw new Error('Gambar tanda tangan maksimal 20 MB.');
                        }
                        const bmp = await createImageBitmap(file);
                        const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
                        const c = newCanvas(bmp.width * scale, bmp.height * scale);
                        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
                        if (bmp.close) bmp.close();
                        state.uploadOriginal = c;
                        fileName.textContent = file.name;
                        processUpload();
                    } catch (e) {
                        console.error(e);
                        SP.toast(e.message || 'Gambar tidak dapat dibaca.', 'error');
                    }
                });

                rmbg.addEventListener('change', processUpload);

                function processUpload() {
                    if (!state.uploadOriginal) return;
                    const c = cloneCanvas(state.uploadOriginal);
                    if (rmbg.checked) removeWhite(c);
                    state.uploadRaw = trimCanvas(c, 6);
                    if (state.mode === 'upload') refreshSignature();
                    if (state.uploadOriginal && state.mode === 'upload' && !state.uploadRaw) {
                        SP.toast('Tanda tangan tidak terdeteksi pada gambar. Coba matikan "Hapus latar putih".', 'error');
                    }
                }

                removeBtn.addEventListener('click', () => {
                    if (!state.sig && !state.uploadOriginal && !typeText.value.trim() && !undoStack.length) return;
                    drawCtx.clearRect(0, 0, pad.width, pad.height);
                    undoStack.length = 0;
                    undoBtn.disabled = true;
                    state.uploadOriginal = null;
                    state.uploadRaw = null;
                    state.sig = null;
                    state.sigUrl = '';
                    state.rect = { x: 0.62, y: 0.72, w: 0.3 };
                    typeText.value = '';
                    fileName.textContent = 'PNG transparan paling rapi. JPG juga bisa.';
                    refreshSignature();
                });

                // ------------------------------------------------------
                // Penempatan di halaman
                // ------------------------------------------------------
                function rectFor(m, wOverride) {
                    const ar = m.w / m.h;
                    let w = clamp(wOverride == null ? state.rect.w : wOverride, 0.06, 0.98);
                    let h = w * ar / state.aspect;
                    if (h > 0.98) {
                        const k = 0.98 / h;
                        h *= k;
                        w *= k;
                    }
                    return {
                        x: clamp(state.rect.x, 0, 0.98 - w),
                        y: clamp(state.rect.y, 0, 0.98 - h),
                        w,
                        h,
                    };
                }

                function targetInfo() {
                    if (state.allPages) {
                        return { set: new Set(refs.map((r) => r.index)), err: '' };
                    }
                    try {
                        const ranges = SP.parseRanges(rangeIn.value, doc.numPages);
                        return { set: new Set(SP.rangesToIndices(ranges)), err: '' };
                    } catch (e) {
                        return { set: null, err: e.message };
                    }
                }

                function paintOverlays() {
                    const info = targetInfo();
                    refs.forEach((ref) => {
                        const show = state.sig && info.set && info.set.has(ref.index);
                        if (!show) {
                            if (ref.stamp) { ref.stamp.remove(); ref.stamp = null; ref.stampImg = null; }
                            return;
                        }
                        if (!ref.stamp) {
                            const el = document.createElement('div');
                            el.className = 'sign-stamp';
                            const img = document.createElement('img');
                            img.alt = 'Tanda tangan';
                            img.draggable = false;
                            const handle = document.createElement('span');
                            handle.className = 'sign-handle';
                            el.append(img, handle);
                            ref.layer.appendChild(el);
                            ref.stamp = el;
                            ref.stampImg = img;
                        }
                        if (ref.stampImg.getAttribute('src') !== state.sigUrl) ref.stampImg.src = state.sigUrl;
                        const r = rectFor(meta[ref.index]);
                        const m = meta[ref.index];
                        ref.stamp.style.left = px(r.x * m.w * zoom);
                        ref.stamp.style.top = px(r.y * m.h * zoom);
                        ref.stamp.style.width = px(r.w * m.w * zoom);
                        ref.stamp.style.height = px(r.h * m.h * zoom);
                        ref.stamp.classList.toggle('dragging', !!drag && drag.idx === ref.index);
                    });
                }

                function updateAction() {
                    const info = targetInfo();
                    rangeErr.textContent = info.err || '';
                    const n = info.set ? info.set.size : 0;
                    if (!state.sig) {
                        action.setSummary('<b>Buat tanda tangan</b> lalu atur posisinya di halaman');
                    } else if (info.err) {
                        action.setSummary('<span class="err">Periksa rentang halaman</span>');
                    } else {
                        action.setSummary(`Tanda tangan siap • <b>${n}</b> halaman`);
                    }
                    action.setDisabled(!state.sig || !n || !!info.err);
                }

                function endDrag(ev) {
                    if (!drag) return;
                    try { pagesBox.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
                    drag = null;
                    paintOverlays();
                }

                pagesBox.addEventListener('pointerdown', (ev) => {
                    const el = ev.target.closest('.sign-stamp');
                    if (!el || !state.sig || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
                    const pageEl = el.closest('.pdfed-page');
                    if (!pageEl) return;
                    const idx = Number(pageEl.dataset.i);
                    drag = {
                        pointerId: ev.pointerId,
                        el,
                        pageEl,
                        idx,
                        resize: !!ev.target.closest('.sign-handle'),
                        sx: ev.clientX,
                        sy: ev.clientY,
                        start: rectFor(meta[idx]),
                    };
                    el.classList.add('dragging');
                    try { pagesBox.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
                    ev.preventDefault();
                });

                pagesBox.addEventListener('pointermove', (ev) => {
                    if (!drag || ev.pointerId !== drag.pointerId) return;
                    const w = drag.pageEl.clientWidth || 1;
                    const h = drag.pageEl.clientHeight || 1;
                    const dx = (ev.clientX - drag.sx) / w;
                    const dy = (ev.clientY - drag.sy) / h;
                    if (drag.resize) {
                        const nw = clamp(drag.start.w + dx, 0.06, 0.98 - drag.start.x);
                        state.rect.w = nw;
                        const nr = rectFor(meta[drag.idx]);
                        if (nr.y + nr.h > 0.98) state.rect.y = Math.max(0, 0.98 - nr.h);
                    } else {
                        const nr = rectFor(meta[drag.idx]);
                        state.rect.x = clamp(drag.start.x + dx, 0, 0.98 - nr.w);
                        state.rect.y = clamp(drag.start.y + dy, 0, 0.98 - nr.h);
                    }
                    paintOverlays();
                    ev.preventDefault();
                });

                pagesBox.addEventListener('pointerup', endDrag);
                pagesBox.addEventListener('pointercancel', endDrag);

                pagesSel.addEventListener('change', () => {
                    state.allPages = pagesSel.value === 'all';
                    rangeWrap.hidden = state.allPages;
                    if (state.allPages) {
                        rangeErr.textContent = '';
                    } else if (!rangeIn.value.trim()) {
                        rangeIn.value = '1';
                    }
                    paintOverlays();
                    updateAction();
                });

                rangeIn.addEventListener('input', () => {
                    paintOverlays();
                    updateAction();
                });

                // ------------------------------------------------------
                // Ekspor
                // ------------------------------------------------------
                async function process() {
                    const info = targetInfo();
                    if (!state.sig) { SP.toast('Buat tanda tangan terlebih dahulu.', 'error'); return; }
                    if (info.err) { SP.toast(info.err, 'error'); return; }
                    if (!info.set || !info.set.size) { SP.toast('Pilih setidaknya satu halaman.', 'error'); return; }
                    const targets = Array.from(info.set).sort((a, b) => a - b);
                    const png = state.sig;
                    const out = await SP.run('Menempelkan tanda tangan...', async (progress) => {
                        if (typeof PDFLib === 'undefined') throw new Error('Library pdf-lib belum termuat.');
                        const d = await SP.openPdfLib(doc.buffer, doc.file.name);
                        const blob = await SP.canvasToBlob(png, 'image/png');
                        const image = await d.embedPng(await blob.arrayBuffer());
                        const outPages = d.getPages();
                        targets.forEach((idx, k) => {
                            stampImage(outPages[idx], image, rectFor(meta[idx]));
                            if (k % 10 === 0) progress((k / targets.length) * 90);
                        });
                        return { bytes: await d.save(), n: targets.length };
                    });
                    if (!out) return;
                    stage.innerHTML = '';
                    stage.appendChild(SP.resultCard({
                        blob: SP.pdfBlob(out.bytes),
                        filename: `${SP.baseName(doc.file.name)}_ttd.pdf`,
                        lines: [
                            `Tanda tangan ditempel di <b>${out.n}</b> halaman.`,
                            'Ukuran dan posisi mengikuti pratinjau; isi PDF tidak diubah.',
                        ],
                        onAgain: ctx.reset,
                    }));
                }

                setMode('draw');
            },
        });
    }

    SP.register({
        id: 'sign',
        category: 'edit',
        icon: 'fa-signature',
        hue: 'violet',
        title: 'Tanda Tangani PDF',
        desc: 'Gambar, ketik, atau unggah tanda tangan lalu tempel ke halaman PDF tanpa upload.',
        keywords: 'sign tanda tangan ttd signature paraf legalisasi',
        mount: mountSign,
    });
})();
