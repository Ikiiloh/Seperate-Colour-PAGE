/**
 * NoPDF - Lapisan teks untuk alat "Edit Teks PDF".
 *
 * Mengubah PDF secara langsung ("in-place edit") tidak mungkin dilakukan
 * tanpa menulis ulang content stream. Pendekatan yang dipakai di sini sama
 * dengan editor PDF berbasis web pada umumnya: teks asli ditutup dengan
 * kotak sewarna latar, lalu teks baru digambar di atasnya.
 *
 * Modul ini yang mengurus:
 *  - ekstraksi baris teks (posisi, ukuran, gaya) dari pdf.js
 *  - sampling warna tinta & latar dari canvas hasil render
 *  - penulisan teks pengganti ke PDF via pdf-lib (koordinat + rotasi)
 */
(function () {
    'use strict';

    const P2E = (window.P2E = {});

    const STACK = {
        sans: 'Arial, Helvetica, "Liberation Sans", sans-serif',
        serif: '"Times New Roman", Times, "Liberation Serif", serif',
        mono: '"Courier New", Courier, monospace',
    };
    P2E.fontStack = (family) => STACK[family] || STACK.sans;

    /**
     * Keluarga font untuk preview & ekspor. pdf.js mendaftarkan font asli PDF
     * sebagai FontFace dengan nama seperti "g_d0_f1"; memakai nama itu membuat
     * teks baru tampil dengan font yang sama persis, bukan pengganti generik.
     */
    P2E.cssFont = (run, family) => {
        const stack = STACK[family] || STACK.sans;
        const name = run && run.fontFamily;
        return name ? `"${name}", ${stack}` : stack;
    };

    /**
     * Gaya font efektif. Font asli PDF sudah memuat ketebalan/kemiringannya
     * sendiri (pdf.js mendaftarkannya sebagai weight normal), jadi jangan
     * ditimpa tebal/miring sintetis kecuali pengguna menambahkannya.
     */
    P2E.fontParts = (run, e) => {
        // Hanya glyph font tertanam ("g_<doc>_f<n>") yang sudah membawa
        // ketebalan aslinya; font standar/substitusi tetap butuh tebal sintetis.
        const own = !!(run && run.fontFamily) && /^g_.*_f\d+$/.test(run.fontFamily);
        return {
            weight: e && e.bold && (!own || !run.bold) ? '700' : '400',
            style: e && e.italic && (!own || !run.italic) ? 'italic' : 'normal',
        };
    };

    P2E.fontSpec = (sizePx, run, e, cssFont) => {
        const p = P2E.fontParts(run, e);
        return `${p.style === 'italic' ? 'italic ' : ''}${p.weight} ${sizePx}px ${cssFont}`;
    };

    const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const parseHex = (s) => {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s || '');
        if (!m) return { r: 0, g: 0, b: 0 };
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    };
    P2E.rgb = (s) => {
        const c = parseHex(s);
        return PDFLib.rgb(c.r / 255, c.g / 255, c.b / 255);
    };

    // ------------------------------------------------------------------
    // Ekstraksi baris teks
    // ------------------------------------------------------------------

    function fontOf(page, name) {
        try {
            if (page.commonObjs && page.commonObjs.has(name)) return page.commonObjs.get(name);
        } catch (e) { /* font belum ter-resolve */ }
        return null;
    }

    function styleOf(font, style, name) {
        const family = font && font.isMonospace ? 'mono'
            : font && font.isSerifFont ? 'serif'
                : /courier|mono|consol/i.test(name) ? 'mono'
                    : /times|serif|georgia|garamond|minion|book ant/i.test(name) ? 'serif'
                        : 'sans';
        const bold = Boolean(font && (font.bold || font.black)) || /bold|black|heavy|semibold|demi/i.test(name);
        const italic = Boolean(font && font.italic) || /italic|oblique/i.test(name);
        return {
            family, bold, italic,
            ascent: style && style.ascent > 0 ? style.ascent : 0.8,
            descent: style && style.descent < 0 ? style.descent : -0.21,
        };
    }

    function groupRuns(items) {
        items.sort((a, b) => (a.baseline - b.baseline) || (a.x0 - b.x0));
        const runs = [];
        let cur = null;
        for (const it of items) {
            if (cur) {
                const tol = Math.max(1, Math.max(cur.size, it.size) * 0.22);
                const gap = it.x0 - cur.x1;
                const near = gap >= -Math.max(cur.size, it.size) && gap <= Math.max(cur.size, it.size) * 1.35;
                if (Math.abs(it.baseline - cur.baseline) <= tol && near) {
                    if (gap > it.size * 0.18 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' ';
                    cur.text += it.str;
                    cur.x1 = Math.max(cur.x1, it.x1);
                    cur.size = Math.max(cur.size, it.size);
                    cur.ascent = Math.max(cur.ascent, it.ascent);
                    cur.descent = Math.min(cur.descent, it.descent);
                    continue;
                }
            }
            cur = {
                text: it.str, x0: it.x0, x1: it.x1, baseline: it.baseline,
                size: it.size, ascent: it.ascent, descent: it.descent,
                family: it.family, bold: it.bold, italic: it.italic,
                fontFamily: it.fontFamily,
            };
            runs.push(cur);
        }
        const out = [];
        for (const r of runs) {
            r.text = r.text.replace(/^\s+|\s+$/g, '');
            if (!r.text) continue;
            r.x1 = Math.max(r.x1, r.x0 + 1);
            r.y0 = r.baseline - r.size * Math.max(r.ascent, 0.78);
            r.y1 = r.baseline + r.size * Math.max(-r.descent, 0.22);
            r.w = r.x1 - r.x0;
            r.h = r.y1 - r.y0;
            out.push(r);
        }
        return out;
    }

    /** Baris-baris teks horizontal pada satu halaman (koordinat viewport skala 1). */
    P2E.collectRuns = async (page) => {
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent({ includeMarkedContent: false });
        const list = [];
        for (const it of tc.items) {
            if (typeof it.str !== 'string' || !it.str.trim()) continue;
            const m = pdfjsLib.Util.transform(vp.transform, it.transform);
            const size = Math.hypot(m[2], m[3]);
            if (!(size >= 0.8)) continue;
            // Teks miring/vertikal dilewati: kotak overlay tidak bisa mewakilinya.
            if (Math.abs(Math.atan2(m[1], m[0])) > 0.12) continue;
            const font = fontOf(page, it.fontName);
            const st = styleOf(font, tc.styles[it.fontName], String((font && font.name) || ''));
            list.push({
                str: it.str,
                x0: m[4],
                x1: m[4] + Math.max(0, Number(it.width) || 0),
                baseline: m[5],
                size,
                ascent: st.ascent,
                descent: st.descent,
                family: st.family,
                bold: st.bold,
                italic: st.italic,
                fontFamily: (font && font.loadedName) || null,
            });
        }
        return groupRuns(list);
    };

    // ------------------------------------------------------------------
    // Sampling warna
    // ------------------------------------------------------------------

    /** Ambil seluruh piksel canvas sekali (lebih cepat daripada per-baris). */
    P2E.readPixels = (canvas) => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
    };

    /**
     * Perkirakan warna tinta dan latar sebuah baris dari piksel di sekitarnya.
     * Latar = warna paling dominan; tinta = rata-rata berbobot piksel yang
     * kontrasnya paling tinggi terhadap latar.
     */
    P2E.sampleColors = (img, scale, run) => {
        const W = img.w;
        const H = img.h;
        if (!W || !H) return { ink: '#000000', bg: '#ffffff' };
        let x0 = Math.floor((run.x0 - 1) * scale);
        let y0 = Math.floor((run.y0 - 1) * scale);
        let x1 = Math.ceil((run.x1 + 1) * scale);
        let y1 = Math.ceil((run.y1 + 1) * scale);
        x0 = Math.max(0, Math.min(W - 1, x0));
        x1 = Math.max(x0 + 1, Math.min(W, x1));
        y0 = Math.max(0, Math.min(H - 1, y0));
        y1 = Math.max(y0 + 1, Math.min(H, y1));

        const area = (x1 - x0) * (y1 - y0);
        const step = Math.max(1, Math.round(area / 26000));
        const hist = new Map();
        let total = 0;
        for (let y = y0; y < y1; y += step) {
            for (let x = x0; x < x1; x += step) {
                const i = (y * W + x) * 4;
                const key = ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
                hist.set(key, (hist.get(key) || 0) + 1);
                total++;
            }
        }
        if (!total) return { ink: '#000000', bg: '#ffffff' };
        let bgKey = 0;
        let bgCount = -1;
        for (const [k, c] of hist) if (c > bgCount) { bgCount = c; bgKey = k; }
        const bg = {
            r: ((bgKey >> 10) & 31) * 8 + 4,
            g: ((bgKey >> 5) & 31) * 8 + 4,
            b: (bgKey & 31) * 8 + 4,
        };
        const bgLum = (bg.r * 0.299 + bg.g * 0.587 + bg.b * 0.114) / 255;
        const darkInk = bgLum > 0.5;

        // Ambil warna dari piksel paling kontras, bukan rata-rata seluruh
        // tepi antialias — kalau dirata-rata, teks hitam jadi abu-abu.
        const cands = [];
        for (let y = y0; y < y1; y += step) {
            for (let x = x0; x < x1; x += step) {
                const i = (y * W + x) * 4;
                const lum = (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114) / 255;
                const diff = darkInk ? bgLum - lum : lum - bgLum;
                if (diff < 0.25) continue;
                cands.push([img.data[i], img.data[i + 1], img.data[i + 2], lum]);
            }
        }
        let ink = darkInk ? '#000000' : '#ffffff';
        if (cands.length) {
            cands.sort((a, b) => (darkInk ? a[3] - b[3] : b[3] - a[3]));
            const n = Math.max(1, Math.floor(cands.length * 0.12));
            let sr = 0; let sg = 0; let sb = 0;
            for (let k = 0; k < n; k++) { sr += cands[k][0]; sg += cands[k][1]; sb += cands[k][2]; }
            ink = hex(sr / n, sg / n, sb / n);
        }
        // Latar yang hampir putih / hampir hitam dibulatkan, supaya tidak
        // menyisakan bercak abu-abu di sekitar kotak penutup.
        if (bg.r > 246 && bg.g > 246 && bg.b > 246) return { ink, bg: '#ffffff' };
        return { ink, bg: hex(bg.r, bg.g, bg.b) };
    };

    // ------------------------------------------------------------------
    // Menulis hasil edit ke PDF
    // ------------------------------------------------------------------

    const RASTER = 5;
    const measureCtx = document.createElement('canvas').getContext('2d');

    function measureWidth(text, sizePx, e, cssFont) {
        measureCtx.font = P2E.fontSpec(sizePx, e.run, e, cssFont);
        return measureCtx.measureText(text || ' ').width;
    }

    /** Render satu baris jadi PNG beresolusi tinggi, memakai font asli PDF. */
    async function rasterLine(text, size, e, cssFont) {
        const px = Math.max(2, size * RASTER);
        const spec = P2E.fontSpec(px, e.run, e, cssFont);
        try { await document.fonts.load(spec, text); } catch (err) { /* pakai fallback */ }

        const c = document.createElement('canvas');
        let ctx = c.getContext('2d');
        ctx.font = spec;
        const m = ctx.measureText(text || ' ');
        const asc = m.fontBoundingBoxAscent || px * 0.8;
        const desc = m.fontBoundingBoxDescent || px * 0.2;
        const padX = Math.max(2, Math.round(px * 0.07));
        const padY = Math.max(2, Math.round(px * 0.07));
        const w = Math.max(2, Math.ceil(m.width + padX * 2));
        const h = Math.max(2, Math.ceil(asc + desc + padY * 2));
        c.width = w;
        c.height = h;
        ctx = c.getContext('2d');
        ctx.font = spec;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = e.ink || '#000000';
        ctx.fillText(text, padX, padY + asc);

        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        return {
            blob,
            wPt: w / RASTER,
            hPt: h / RASTER,
            descPt: desc / RASTER,
            padXPt: padX / RASTER,
            padYPt: padY / RASTER,
            textW: m.width / RASTER,
        };
    }

    function extendRect(rect, down, extra) {
        const r = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
        if (!(extra > 0)) return r;
        if (down.x > 0.5) r.w += extra;
        else if (down.x < -0.5) { r.x -= extra; r.w += extra; }
        if (down.y > 0.5) r.h += extra;
        else if (down.y < -0.5) { r.y -= extra; r.h += extra; }
        return r;
    }

    /**
     * Gambar semua perubahan ke dokumen pdf-lib.
     * Teks pengganti digambar sebagai PNG (font asli hasil render pdf.js),
     * dengan offset geser, perataan, dan rotasi sesuai baris sumber.
     */
    P2E.drawEdits = async (pdoc, edits) => {
        if (!edits.length) return;
        const pages = pdoc.getPages();

        const plans = [];
        for (const e of edits) {
            const page = pages[e.pageIndex];
            if (!page) continue;
            const cssFont = P2E.cssFont(e.run, e.family);
            const lines = String(e.text == null ? '' : e.text).replace(/\r/g, '').split('\n');
            let size = Math.max(3, e.size);
            const avail = Math.max(4, (e.run && e.run.w ? e.run.w : e.geom.rect.w) - 0.5);
            if (e.fit === true) {
                const widest = lines.reduce((m, ln) => Math.max(m, ln ? measureWidth(ln, size, e, cssFont) : 0), 0);
                if (widest > avail) size *= Math.max(0.6, avail / widest);
            }
            plans.push({ edit: e, page, lines, size, lh: size * 1.16, cssFont });
        }

        // 1) Kotak penutup teks lama (posisi asli, tidak ikut tergeser)
        for (const p of plans) {
            const e = p.edit;
            const extra = e.deleted ? 0 : Math.max(0, p.lines.length - 1) * p.lh;
            const r = extendRect(e.geom.rect, e.geom.down, extra);
            p.page.drawRectangle({
                x: r.x, y: r.y, width: Math.max(0.2, r.w), height: Math.max(0.2, r.h),
                color: P2E.rgb(e.bg || '#ffffff'),
            });
        }

        // 2) Teks pengganti
        for (const p of plans) {
            const e = p.edit;
            if (e.deleted) continue;
            const g = e.geom;
            const off = g.offset || { x: 0, y: 0 };
            const u = { x: -g.down.y, y: g.down.x };
            const runW = e.run && e.run.w ? e.run.w : Math.max(4, g.rect.w - 3);
            for (let i = 0; i < p.lines.length; i++) {
                const ln = p.lines[i];
                if (!ln) continue;
                const r = await rasterLine(ln, p.size, e, p.cssFont);
                if (!r.blob) continue;
                const img = await pdoc.embedPng(await r.blob.arrayBuffer());
                const align = e.align || 'left';
                const shift = align === 'center' ? (runW - r.textW) / 2
                    : align === 'right' ? runW - r.textW : 0;
                const bx = g.base.x + off.x + u.x * shift + g.down.x * (p.lh * i);
                const by = g.base.y + off.y + u.y * shift + g.down.y * (p.lh * i);
                // Pdf-lib menempatkan gambar pada sudut kiri-bawah, jadi turun
                // sejauh descender + padding agar baseline gambar = baseline asli.
                p.page.drawImage(img, {
                    x: bx - u.x * r.padXPt + g.down.x * (r.descPt + r.padYPt),
                    y: by - u.y * r.padXPt + g.down.y * (r.descPt + r.padYPt),
                    width: r.wPt,
                    height: r.hPt,
                    rotate: PDFLib.degrees(e.rot || 0),
                });
            }
        }
    };
})();
