/**
 * NoPDF - Core utilities shared by every tool.
 *
 * Everything runs in the browser (no upload). Tools register themselves via
 * SP.register({...}) and are mounted by the router in app.js.
 */
(function () {
    'use strict';

    const SP = (window.SP = { tools: [], MAX_MB: 200, cleanups: [] });

    SP.register = (tool) => SP.tools.push(tool);
    SP.onCleanup = (fn) => SP.cleanups.push(fn);
    SP.runCleanups = () => {
        const fns = SP.cleanups.splice(0);
        fns.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    };

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------
    SP.h = (html) => {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    };

    SP.esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    SP.fmtSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };

    SP.baseName = (name) => name.replace(/\.[^.]+$/, '');
    SP.tick = () => new Promise((r) => setTimeout(r, 0));
    SP.isPdf = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
    SP.isImage = (f) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name) || /^image\//.test(f.type);

    // ------------------------------------------------------------------
    // Toast & busy overlay
    // ------------------------------------------------------------------
    let toastBox = null;
    SP.toast = (msg, type = 'info') => {
        if (!toastBox) {
            toastBox = SP.h('<div class="toast-box" role="status" aria-live="polite"></div>');
            document.body.appendChild(toastBox);
        }
        const icon = { info: 'fa-circle-info', error: 'fa-circle-exclamation', ok: 'fa-circle-check' }[type];
        const el = SP.h(`<div class="toast ${type}"><i class="fa-solid ${icon}"></i><span></span></div>`);
        el.querySelector('span').textContent = msg;
        toastBox.appendChild(el);
        setTimeout(() => el.classList.add('out'), type === 'error' ? 6000 : 3500);
        setTimeout(() => el.remove(), type === 'error' ? 6400 : 3900);
    };

    let busyEl = null;
    const ensureBusy = () => {
        if (busyEl) return busyEl;
        busyEl = SP.h(`
            <div class="busy-overlay hidden" role="alertdialog" aria-live="assertive">
                <div class="skeuo-card busy-box">
                    <div class="spinner-container skeuo-meter-dial"><i class="fa-solid fa-gear fa-spin scanner-icon"></i></div>
                    <h3 class="busy-title">Memproses...</h3>
                    <div class="skeuo-inset-bar"><div class="skeuo-bar-fill busy-bar"></div></div>
                    <div class="skeuo-lcd-text busy-text">&nbsp;</div>
                </div>
            </div>`);
        document.body.appendChild(busyEl);
        return busyEl;
    };

    SP.busy = {
        show(title, text) {
            const el = ensureBusy();
            el.querySelector('.busy-title').textContent = title || 'Memproses...';
            el.querySelector('.busy-text').textContent = text || '';
            el.querySelector('.busy-bar').style.width = '4%';
            el.classList.remove('hidden');
        },
        set(pct, text) {
            const el = ensureBusy();
            el.querySelector('.busy-bar').style.width = Math.max(4, Math.min(100, pct)) + '%';
            if (text != null) el.querySelector('.busy-text').textContent = text;
        },
        hide() { if (busyEl) busyEl.classList.add('hidden'); },
    };

    /** Run an async job behind the busy overlay and surface errors as toasts. */
    SP.run = async (title, job) => {
        SP.busy.show(title);
        try {
            return await job((pct, text) => SP.busy.set(pct, text));
        } catch (err) {
            console.error(err);
            SP.toast(err && err.message ? err.message : 'Terjadi kesalahan tak terduga.', 'error');
            return undefined;
        } finally {
            SP.busy.hide();
        }
    };

    // ------------------------------------------------------------------
    // Files, downloads, ZIP
    // ------------------------------------------------------------------
    SP.download = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    SP.pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });

    SP.zip = async (entries, onProgress) => {
        if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum termuat.');
        const zip = new JSZip();
        entries.forEach((e) => zip.file(e.name, e.data));
        return zip.generateAsync({ type: 'blob', compression: 'STORE' },
            onProgress ? (m) => onProgress(m.percent) : undefined);
    };

    SP.checkSize = (file) => {
        if (file.size > SP.MAX_MB * 1024 * 1024) {
            throw new Error(`"${file.name}" melebihi batas ${SP.MAX_MB} MB.`);
        }
    };

    /** Dropzone built on the existing "sunken tray" style. */
    SP.dropzone = ({ accept, multiple = false, title, hint, spec, icon = 'fa-cloud-arrow-up', filter, onFiles }) => {
        const el = SP.h(`
            <div class="skeuo-card upload-card tool-drop">
                <div class="upload-zone skeuo-inset-panel">
                    <input type="file" class="file-input" accept="${accept}" ${multiple ? 'multiple' : ''}>
                    <div class="upload-content">
                        <div class="upload-icon-wrapper skeuo-icon-btn"><i class="fa-solid ${icon} upload-icon"></i></div>
                        <h2>${title}</h2>
                        <p class="upload-hint">atau <span class="browse-btn">pilih file dari perangkat</span></p>
                        <span class="upload-specs skeuo-inset-badge"><i class="fa-solid fa-circle-info"></i> ${spec || ''}</span>
                    </div>
                </div>
            </div>`);
        if (hint) el.querySelector('.upload-hint').innerHTML = hint;
        const zone = el.querySelector('.upload-zone');
        const input = el.querySelector('input');

        const handle = (fileList) => {
            let files = Array.from(fileList || []);
            if (filter) files = files.filter(filter);
            if (!files.length) {
                SP.toast('Tipe file tidak sesuai untuk alat ini.', 'error');
                return;
            }
            try { files.forEach(SP.checkSize); } catch (e) { SP.toast(e.message, 'error'); return; }
            onFiles(multiple ? files : [files[0]]);
        };
        input.addEventListener('change', () => { handle(input.files); input.value = ''; });
        ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
            e.preventDefault(); zone.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
            e.preventDefault(); zone.classList.remove('drag-over');
        }));
        zone.addEventListener('drop', (e) => { if (e.dataTransfer) handle(e.dataTransfer.files); });
        return el;
    };

    /** Bar showing the loaded file with a "change file" button. */
    SP.fileBar = ({ name, size, pages, onChange }) => {
        const el = SP.h(`
            <div class="file-bar skeuo-inset-panel">
                <i class="fa-solid fa-file-pdf file-bar-icon"></i>
                <div class="file-bar-info">
                    <strong class="file-bar-name"></strong>
                    <small></small>
                </div>
                <button type="button" class="skeuo-btn-sm"><i class="fa-solid fa-rotate"></i> Ganti file</button>
            </div>`);
        el.querySelector('strong').textContent = name;
        el.querySelector('small').textContent =
            [pages != null ? `${pages} halaman` : null, SP.fmtSize(size)].filter(Boolean).join(' • ');
        el.querySelector('button').addEventListener('click', onChange);
        return el;
    };

    /** Result card with a download button. */
    SP.resultCard = ({ blob, filename, title = 'Selesai!', lines = [], onAgain }) => {
        const el = SP.h(`
            <div class="skeuo-card result-card">
                <div class="result-check"><i class="fa-solid fa-circle-check"></i></div>
                <h2 class="result-title"></h2>
                <div class="result-lines"></div>
                <div class="result-actions">
                    <button type="button" class="btn skeuo-push-btn btn-zip-skeuo result-dl">
                        <i class="fa-solid fa-file-arrow-down"></i>
                        <div class="btn-text"><span>UNDUH HASIL</span><small></small></div>
                    </button>
                    <button type="button" class="skeuo-btn-sm result-again"><i class="fa-solid fa-arrow-rotate-left"></i> Proses file lain</button>
                </div>
            </div>`);
        el.querySelector('.result-title').textContent = title;
        el.querySelector('.btn-text small').textContent = `${filename} • ${SP.fmtSize(blob.size)}`;
        const linesBox = el.querySelector('.result-lines');
        lines.forEach((l) => {
            const p = document.createElement('p');
            p.innerHTML = l;
            linesBox.appendChild(p);
        });
        el.querySelector('.result-dl').addEventListener('click', () => SP.download(blob, filename));
        el.querySelector('.result-again').addEventListener('click', () => onAgain && onAgain());
        return el;
    };

    /** Sticky bottom bar with a summary line and the main action button. */
    SP.actionBar = ({ label = 'Proses & Unduh', icon = 'fa-wand-magic-sparkles', onClick }) => {
        const el = SP.h(`
            <div class="action-bar skeuo-card">
                <div class="action-summary"></div>
                <button type="button" class="btn skeuo-push-btn btn-color-skeuo">
                    <i class="fa-solid ${icon}"></i>
                    <div class="btn-text"><span>${label}</span></div>
                </button>
            </div>`);
        const btn = el.querySelector('button');
        const sum = el.querySelector('.action-summary');
        btn.addEventListener('click', () => onClick());
        return {
            el,
            setSummary: (html) => { sum.innerHTML = html; },
            setDisabled: (b) => { btn.disabled = !!b; },
        };
    };

    /**
     * Standard "pick one PDF" flow: dropzone -> load -> file bar, then hands
     * control to start(doc, stage). Returns the stage element.
     */
    SP.singlePdf = (root, ctx, { start, title, spec }) => {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);
        stage.appendChild(SP.dropzone({
            accept: '.pdf,application/pdf',
            title: title || 'Tarik & lepaskan file PDF di sini',
            spec: spec || `Format PDF | Maksimal ${SP.MAX_MB} MB`,
            filter: SP.isPdf,
            onFiles: async ([file]) => {
                const doc = await SP.run('Membuka PDF...', () => SP.loadPdf(file));
                if (!doc) return;
                stage.innerHTML = '';
                stage.appendChild(SP.fileBar({ name: doc.file.name, size: doc.file.size, pages: doc.numPages, onChange: ctx.reset }));
                start(doc, stage);
            },
        }));
        return stage;
    };

    // ------------------------------------------------------------------
    // PDF engines & Offline Worker Setup
    // ------------------------------------------------------------------
    let workerBlobPromise = null;
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
        // Convert worker script into a local in-memory Blob URL to prevent offline network errors on mobile
        workerBlobPromise = fetch('./vendor/pdf.worker.min.js')
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.blob();
            })
            .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;
                return blobUrl;
            })
            .catch((err) => {
                console.warn('Fallback to standard worker path:', err);
                return './vendor/pdf.worker.min.js';
            });
    }

    SP.openPdfjs = async (buffer) => {
        if (typeof pdfjsLib === 'undefined') throw new Error('Library pdf.js belum termuat.');
        if (workerBlobPromise) {
            await workerBlobPromise.catch(() => {});
        }
        try {
            const doc = await pdfjsLib.getDocument({
                data: new Uint8Array(buffer.slice(0)),
                isEvalSupported: false,
            }).promise;
            SP.onCleanup(() => doc.destroy());
            return doc;
        } catch (e) {
            console.error('PDF.js open error:', e);
            if (e && e.name === 'PasswordException') {
                throw new Error('PDF ini diproteksi password. Buka proteksinya terlebih dahulu.');
            }
            throw new Error(e && e.message ? `Gagal membaca PDF: ${e.message}` : 'File PDF tidak bisa dibaca (rusak atau tidak valid).');
        }
    };

    SP.openPdfLib = async (buffer, name = 'PDF', opts = {}) => {
        if (typeof PDFLib === 'undefined') throw new Error('Library pdf-lib belum termuat.');
        try {
            return await PDFLib.PDFDocument.load(buffer, opts);
        } catch (e) {
            if (/encrypt/i.test(e.message || '')) {
                throw new Error(`"${name}" diproteksi password dan tidak bisa diubah.`);
            }
            throw new Error(`"${name}" tidak bisa dibaca: ${e.message}`);
        }
    };

    /** Read a PDF fully: both an ArrayBuffer and a pdf.js document. */
    SP.loadPdf = async (file) => {
        const buffer = await file.arrayBuffer();
        const pdf = await SP.openPdfjs(buffer);
        return { file, buffer, pdf, numPages: pdf.numPages };
    };

    /** Render a pdf.js page to a canvas with a white background. */
    SP.renderPage = async (page, scale, { gray = false, maxPixels = 16e6 } = {}) => {
        let vp = page.getViewport({ scale });
        const px = vp.width * vp.height;
        if (px > maxPixels) vp = page.getViewport({ scale: scale * Math.sqrt(maxPixels / px) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(vp.width));
        canvas.height = Math.max(1, Math.ceil(vp.height));
        const ctx = canvas.getContext('2d', { willReadFrequently: gray });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (gray) {
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
                d[i] = d[i + 1] = d[i + 2] = y;
            }
            ctx.putImageData(img, 0, 0);
        }
        return canvas;
    };

    SP.canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.8) =>
        new Promise((resolve, reject) => canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Gagal mengubah halaman menjadi gambar.'))), type, quality));

    SP.freeCanvas = (c) => { c.width = 1; c.height = 1; };

    // ------------------------------------------------------------------
    // Image re-encoding (preserves text/vector, only compresses images)
    // ------------------------------------------------------------------
    const PDFName = PDFLib.PDFName;
    const PDFNumber = PDFLib.PDFNumber;

    /** Collect all unique image XObject references in the document. */
    const collectImageXObjects = (doc) => {
        const seen = new Set();
        const list = [];
        const walk = (resources) => {
            if (!resources || !resources.lookup) return;
            try {
                const xobj = resources.lookup(PDFName.of('XObject'));
                if (!xobj || !xobj.entries) return;
                const entries = xobj.entries();
                for (const [, ref] of entries) {
                    const stream = doc.context.lookup(ref);
                    // Image XObjects are PDFStreams with /Subtype /Image.
                    const dict = stream && stream.dict;
                    if (!dict || !dict.lookup) continue;
                    const subtype = dict.lookup(PDFName.of('Subtype'));
                    if (subtype && String(subtype) === '/Image') {
                        const num = ref.objectNumber;
                        if (!seen.has(num)) { seen.add(num); list.push(stream); }
                    }
                }
            } catch (e) { /* skip malformed xobjects */ }
        };
        for (const page of doc.getPages()) walk(page.node.Resources());
        return list;
    };

    /**
     * Re-encode every embedded image in the PDF as JPEG at the given quality.
     * Text, vector shapes and layout are left untouched — so text-heavy PDFs
     * never get bloated (unlike full-page rasterization).
     * Returns the number of images processed.
     */
    SP.compressImages = async (doc, { quality = 0.6, maxDim = Infinity, onProgress } = {}) => {
        const images = collectImageXObjects(doc);
        const total = images.length;
        for (let i = 0; i < total; i++) {
            await reencodeImage(images[i], quality, maxDim);
            if (onProgress) onProgress(i + 1, total);
            await SP.tick();
        }
        return total;
    };

    async function reencodeImage(stream, quality, maxDim) {
        const dict = stream.dict;
        const width = dict.lookup(PDFName.of('Width')).number;
        const height = dict.lookup(PDFName.of('Height')).number;
        const bpcObj = dict.lookup(PDFName.of('BitsPerComponent'));
        const bpc = bpcObj ? bpcObj.number : 8;
        const filter = dict.lookup(PDFName.of('Filter'));
        const csObj = dict.lookup(PDFName.of('ColorSpace'));

        // Decide filter chain (pdf-lib minified: use String() instead of .name)
        const filterStr = filter ? String(filter) : '';
        const isJpeg = filterStr.includes('DCTDecode');

        // Decide color space
        const csStr = csObj ? String(csObj) : '/DeviceRGB';
        let comps;
        if (csStr.includes('Gray')) comps = 1;
        else if (csStr.includes('CMYK')) comps = 4;
        else comps = 3; // DeviceRGB / default

        let canvas = document.createElement('canvas');

        try {
            if (isJpeg) {
                // Already JPEG: decode via browser, then re-encode.
                const raw = stream.contents;
                const blob = new Blob([raw], { type: 'image/jpeg' });
                const bmp = await createImageBitmap(blob);
                let w = bmp.width; let h = bmp.height;
                if (Math.max(w, h) > maxDim) {
                    const s = maxDim / Math.max(w, h);
                    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
                bmp.close();
            } else {
                // Raw pixels (e.g. FlateDecode). Only 8-bit is supported.
                if (bpc !== 8) return;
                const bytes = stream.getBytes();

                const expected = width * height * comps;
                if (bytes.length < expected) return; // can't decode reliably

                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                const imgData = ctx.createImageData(width, height);
                const d = imgData.data;

                if (comps === 1) {
                    for (let p = 0, q = 0; p < bytes.length && q < d.length; p++, q += 4) {
                        d[q] = d[q + 1] = d[q + 2] = bytes[p]; d[q + 3] = 255;
                    }
                } else if (comps === 4) {
                    for (let p = 0, q = 0; p + 3 < bytes.length && q < d.length; p += 4, q += 4) {
                        const c = bytes[p], m = bytes[p + 1], y = bytes[p + 2], k = bytes[p + 3];
                        d[q] = 255 - Math.min(255, c + k);
                        d[q + 1] = 255 - Math.min(255, m + k);
                        d[q + 2] = 255 - Math.min(255, y + k);
                        d[q + 3] = 255;
                    }
                } else {
                    for (let p = 0, q = 0; p + 2 < bytes.length && q < d.length; p += 3, q += 4) {
                        d[q] = bytes[p]; d[q + 1] = bytes[p + 1]; d[q + 2] = bytes[p + 2]; d[q + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);

                // Downscale if larger than maxDim
                if (Math.max(width, height) > maxDim) {
                    const s = maxDim / Math.max(width, height);
                    const w = Math.max(1, Math.round(width * s));
                    const h = Math.max(1, Math.round(height * s));
                    const tmp = document.createElement('canvas');
                    tmp.width = w; tmp.height = h;
                    tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
                    SP.freeCanvas(canvas);
                    canvas = tmp;
                }
            }

            // Encode canvas back to JPEG and replace the stream.
            const blob = await SP.canvasToBlob(canvas, 'image/jpeg', quality);
            const jpgBytes = new Uint8Array(await blob.arrayBuffer());

            // Update the image dictionary for JPEG storage.
            dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            dict.set(PDFName.of('Width'), PDFNumber.of(canvas.width));
            dict.set(PDFName.of('Height'), PDFNumber.of(canvas.height));
            dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            dict.delete(PDFName.of('DecodeParms'));
            dict.delete(PDFName.of('Predictor'));
            dict.delete(PDFName.of('SMask'));
            dict.delete(PDFName.of('Mask'));

            // Replace raw stream bytes with the new JPEG.
            stream.contents = jpgBytes;
        } catch (e) {
            // Skip images we can't decode — better to leave them untouched.
        } finally {
            SP.freeCanvas(canvas);
        }
    }

    /**
     * Rebuild a PDF as one image per page (used by compress & grayscale).
     * Text becomes part of the image, so it is no longer selectable.
     */
    SP.rasterizePdf = async (pdf, { dpi, quality, gray = false, onProgress }) => {
        const out = await PDFLib.PDFDocument.create();
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const canvas = await SP.renderPage(page, dpi / 72, { gray });
            const blob = await SP.canvasToBlob(canvas, 'image/jpeg', quality);
            const img = await out.embedJpg(await blob.arrayBuffer());
            const p = out.addPage([base.width, base.height]);
            p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
            SP.freeCanvas(canvas);
            page.cleanup();
            if (onProgress) onProgress(i, pdf.numPages);
            await SP.tick();
        }
        return out.save({ useObjectStreams: true });
    };

    // ------------------------------------------------------------------
    // Page range parsing: "1-3, 5, 8-" -> [[1,3],[5,5],[8,total]]
    // ------------------------------------------------------------------
    SP.parseRanges = (str, total) => {
        const parts = String(str || '').split(/[,;\s]+/).filter(Boolean);
        if (!parts.length) throw new Error('Isi rentang halaman terlebih dahulu, contoh: 1-3, 5, 8-10.');
        return parts.map((p) => {
            let a; let b;
            let m = p.match(/^(\d*)-(\d*)$/);
            if (m && (m[1] || m[2])) {
                a = m[1] ? parseInt(m[1], 10) : 1;
                b = m[2] ? parseInt(m[2], 10) : total;
            } else if (/^\d+$/.test(p)) {
                a = b = parseInt(p, 10);
            } else {
                throw new Error(`Format rentang tidak valid: "${p}". Contoh: 1-3, 5, 8-10.`);
            }
            if (a < 1 || b > total || a > b) {
                throw new Error(`Rentang "${p}" di luar jangkauan (dokumen punya ${total} halaman).`);
            }
            return [a, b];
        });
    };

    /** Flatten ranges to zero-based page indices (keeps order & duplicates). */
    SP.rangesToIndices = (ranges) => {
        const idx = [];
        ranges.forEach(([a, b]) => { for (let i = a; i <= b; i++) idx.push(i - 1); });
        return idx;
    };

    /** Compact string for a list of 1-based page numbers: [1,2,3,5] -> "1-3, 5". */
    SP.formatRanges = (nums) => {
        const s = Array.from(new Set(nums)).sort((x, y) => x - y);
        const out = [];
        for (let i = 0; i < s.length; i++) {
            let j = i;
            while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
            out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
            i = j;
        }
        return out.join(', ');
    };

    /** Copy zero-based page indices of srcDoc into a brand-new PDF. */
    SP.extractPages = async (srcDoc, indices) => {
        const out = await PDFLib.PDFDocument.create();
        const pages = await out.copyPages(srcDoc, indices);
        pages.forEach((p) => out.addPage(p));
        return out;
    };

    // ------------------------------------------------------------------
    // Lazy thumbnails (pdf.js) rendered one at a time as they scroll in
    // ------------------------------------------------------------------
    const thumb = (SP.thumb = { queue: [], busy: false, io: null });

    thumb.reset = () => {
        thumb.queue = [];
        if (thumb.io) { thumb.io.disconnect(); thumb.io = null; }
    };

    const pump = async () => {
        if (thumb.busy) return;
        thumb.busy = true;
        while (thumb.queue.length) {
            const job = thumb.queue.shift();
            if (!job.canvas.isConnected) continue;
            try {
                const page = await job.pdf.getPage(job.pageNum);
                const vp1 = page.getViewport({ scale: 1 });
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const vp = page.getViewport({ scale: (job.maxW * dpr) / vp1.width });
                job.canvas.width = Math.ceil(vp.width);
                job.canvas.height = Math.ceil(vp.height);
                const ctx = job.canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, job.canvas.width, job.canvas.height);
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                page.cleanup();
                job.canvas.dataset.aw = job.canvas.width;
                job.canvas.dataset.ah = job.canvas.height;
                job.canvas.classList.add('ready');
                if (job.onDone) job.onDone(job.canvas);
            } catch (e) { /* document destroyed or page failed: leave blank */ }
        }
        thumb.busy = false;
    };

    thumb.observe = (canvas, pdf, pageNum, { maxW = 200, onDone } = {}) => {
        if (!thumb.io) {
            thumb.io = new IntersectionObserver((entries) => {
                entries.forEach((en) => {
                    if (!en.isIntersecting) return;
                    thumb.io.unobserve(en.target);
                    const job = en.target._thumbJob;
                    if (job) { thumb.queue.push(job); pump(); }
                });
            }, { rootMargin: '400px 0px' });
        }
        // Observe the (always visible) wrapper: the canvas itself is display:none until rendered.
        const target = canvas.parentElement;
        target._thumbJob = { canvas, pdf, pageNum, maxW, onDone };
        thumb.io.observe(target);
    };

    // ------------------------------------------------------------------
    // Drag-and-drop reordering (desktop). Touch users get move buttons.
    // ------------------------------------------------------------------
    SP.sortable = (container, { itemSelector, axis = 'x', onReorder }) => {
        let dragging = null;
        container.addEventListener('dragstart', (e) => {
            const item = e.target.closest && e.target.closest(itemSelector);
            if (!item || item.parentElement !== container) return;
            dragging = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', 'sp-sort'); } catch (err) { /* ignore */ }
        });
        container.addEventListener('dragover', (e) => {
            if (!dragging) return;
            e.preventDefault();
            const target = e.target.closest(itemSelector);
            if (!target || target === dragging || target.parentElement !== container) return;
            const r = target.getBoundingClientRect();
            const before = axis === 'x'
                ? e.clientX < r.left + r.width / 2
                : e.clientY < r.top + r.height / 2;
            container.insertBefore(dragging, before ? target : target.nextSibling);
        });
        container.addEventListener('drop', (e) => { if (dragging) e.preventDefault(); });
        container.addEventListener('dragend', () => {
            if (!dragging) return;
            dragging.classList.remove('dragging');
            dragging = null;
            if (onReorder) onReorder();
        });
    };

    SP.moveItem = (item, dir) => {
        const sib = dir < 0 ? item.previousElementSibling : item.nextElementSibling;
        if (!sib) return false;
        item.parentElement.insertBefore(item, dir < 0 ? sib : sib.nextSibling);
        return true;
    };

    // ------------------------------------------------------------------
    // Text placement helpers that respect a page's /Rotate (page numbers,
    // watermark). (vx,vy) is a point in the *displayed* page, origin at the
    // bottom-left; the result is the matching point in PDF user space.
    // ------------------------------------------------------------------
    SP.pageGeometry = (page) => {
        const mb = page.getMediaBox();
        const angle = ((page.getRotation().angle % 360) + 360) % 360;
        const W = mb.width;
        const H = mb.height;
        const swap = angle === 90 || angle === 270;
        const toUser = (vx, vy) => {
            let ux; let uy;
            if (angle === 0) { ux = vx; uy = vy; }
            else if (angle === 90) { ux = W - vy; uy = vx; }
            else if (angle === 180) { ux = W - vx; uy = H - vy; }
            else { ux = vy; uy = H - vx; }
            return { x: mb.x + ux, y: mb.y + uy };
        };
        return { angle, visW: swap ? H : W, visH: swap ? W : H, toUser };
    };
})();
