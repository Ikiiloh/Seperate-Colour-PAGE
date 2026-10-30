/**
 * PDF -> Word: lapisan ekstraksi geometri.
 *
 * Mengubah satu halaman PDF menjadi model geometris (span teks, garis border,
 * blok warna, gambar) dalam koordinat display berpuncak kiri-atas, dalam point.
 * Lapisan ini hanya membaca PDF, tidak memutuskan apa pun soal tata letak.
 *
 * Semua berjalan di browser memakai pdf.js; tidak ada server.
 */
(function () {
    'use strict';

    const P2D = (window.P2D = window.P2D || {});

    const U = () => window.pdfjsLib.Util;

    /** Matriks display: user space PDF (y ke atas) -> canvas space (y ke bawah). */
    const displayM = (vp, ctm) => U().transform(vp.transform, ctm || [1, 0, 0, 1, 0, 0]);

    /** Titik tunggal melalui matriks. */
    function mpt(m, x, y) {
        return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    }

    /** Bounding box axis-aligned dari sebuah quad setelah matriks. */
    function quadBox(m, x0, y0, x1, y1) {
        const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [
            m[0] * x + m[2] * y + m[4],
            m[1] * x + m[3] * y + m[5],
        ]);
        const xs = p.map(v => v[0]);
        const ys = p.map(v => v[1]);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }

    // ───────────────────────── Warna ─────────────────────────

    const rgbToHex = (r, g, b) => '#' + [r, g, b]
        .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
        .join('').toUpperCase();

    const grayToHex = (g) => rgbToHex(g * 255, g * 255, g * 255);

    /** pdf.js mengirim komponen RGB baik sebagai 0..1 maupun 0..255; dua-duanya sah. */
    const to255 = (v) => (Number.isFinite(v) && v <= 1 ? v * 255 : v);

    const rgbOpToHex = (r, g, b) => rgbToHex(to255(r), to255(g), to255(b));

    const cmykToHex = (c, m, y, k) =>
        rgbToHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));

    /** setFillColorN / setStrokeColorN: args[0] indeks ruang warna, sisanya komponen. */
    const colorNToHex = (args) => {
        const c = (args || []).slice(1).map(Number).filter(Number.isFinite);
        if (c.length === 1) return grayToHex(c[0]);
        if (c.length === 3) return rgbOpToHex(c[0], c[1], c[2]);
        if (c.length >= 4) return cmykToHex(c[0], c[1], c[2], c[3]);
        return '#000000';
    };

    const isWhite = (hex) => !hex || /^#(F[c-f][c-f]|[fF][fF][fF]){2,3}$/i.test(hex) || /^#FFFFFF$/i.test(hex);

    P2D.isWhite = isWhite;
    P2D.rgbToHex = rgbToHex;

    // ───────────────────────── Pemetaan font ─────────────────────────

    /**
     * Nama font PDF -> keluarga font Word. Subset tanpa nama bermakna
     * (mis. "TERRSU+CIDFont+F1" hasil FPDF) tidak memberi petunjuk apa pun,
     * jadi `fallbackName` dari pdf.js (sans-serif/serif/monospace) dipakai.
     * Bila keduanya gagal, hasilnya null dan pemanggil memakai fallback
     * tingkat dokumen.
     */
    function mapFontFamily(name, fallback) {
        const n = (name || '').replace(/^[A-Z]{6}\+/, '');
        if (n && !/CIDFont|Type3|Unknown|^Font\d+$/i.test(n)) {
            if (/helvet|arial|liberation.*sans|dejavu.*sans|nimbus.*san/i.test(n)) return 'Arial';
            if (/times|nimbus.*roman|liberation.*serif|tinos/i.test(n)) return 'Times New Roman';
            if (/calibri/i.test(n)) return 'Calibri';
            if (/cambria|georgia/i.test(n)) return 'Cambria';
            if (/courier|mono|consol/i.test(n)) return 'Courier New';
            if (/verdana|tahoma/i.test(n)) return 'Verdana';
            if (/garamond/i.test(n)) return 'Garamond';
            if (/book.*man/i.test(n)) return 'Bookman Old Style';
            if (/sans/i.test(n)) return 'Arial';
            if (/serif/i.test(n)) return 'Times New Roman';
            return n.split(/[-,_]/)[0].replace(/\d+$/, '') || null;
        }
        const fb = String(fallback || '');
        if (/mono|courier/i.test(fb)) return 'Courier New';
        if (/serif/i.test(fb) && !/sans/i.test(fb)) return 'Times New Roman';
        if (/sans/i.test(fb)) return 'Arial';
        return null;
    }

    const flagsFromName = (n) => ({
        bold: /bold|black|heavy/i.test(n || ''),
        italic: /italic|oblique/i.test(n || ''),
    });

    const UNKNOWN_FONT = Object.freeze({
        family: null, rawName: '', bold: false, italic: false, ascent: 0.8, descent: -0.2, type3: false,
    });

    /**
     * Metrik ascent/descent pada font subset rusak (mis. font dot-leader FPDF
     * melaporkan ascent 0.18) membuat box span kolaps. Nilai di luar rentang
     * waras dibuang agar kotak garis tetap mewakili em-square.
     */
    function saneAscent(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) && n > 0.3 && n <= 1.6 ? n : fallback;
    }

    function saneDescent(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) && n < -0.02 && n >= -1.0 ? n : fallback;
    }

    /**
     * Objek Font pdf.js ada di commonObjs dan baru tersedia setelah worker
     * mengirimnya, jadi bentuk callback wajib dipakai (get() sinkron melempar).
     */
    async function resolveFont(page, id) {
        if (!id) return UNKNOWN_FONT;
        const cache = page._p2dFonts || (page._p2dFonts = Object.create(null));
        if (cache[id]) return cache[id];
        const info = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 4000);
            const finish = (f) => {
                clearTimeout(timer);
                if (!f) return resolve(null);
                const name = String(f.name || f.loadedName || '');
                const nf = flagsFromName(name);
                resolve({
                    family: mapFontFamily(name, f.fallbackName),
                    rawName: name,
                    bold: !!f.bold || nf.bold,
                    italic: !!f.italic || nf.italic,
                    ascent: saneAscent(f.ascent, 0.8),
                    descent: saneDescent(f.descent, -0.2),
                    type3: !!f.isType3Font,
                });
            };
            try {
                page.commonObjs.get(id, finish);
            } catch (e) {
                clearTimeout(timer);
                resolve(null);
            }
        });
        cache[id] = info || UNKNOWN_FONT;
        return cache[id];
    }

    // ───────────────────────── Operator stream walker ─────────────────────────

    const nums = (a) => (ArrayBuffer.isView(a) ? Array.from(a) : a);

    /**
     * Mengunjungi operator list halaman dan mengumpulkan shape terisi/distrok,
     * penempatan gambar, serta satu catatan per operasi teks (posisi, warna
     * isian, rise, font, ukuran, char-spacing) untuk dicocokkan dengan
     * TextContent.
     */
    function walkOperators(page, ops) {
        const OPS = window.pdfjsLib.OPS;
        const vp = page.getViewport({ scale: 1 });

        let ctm = [1, 0, 0, 1, 0, 0];
        const stack = [];
        const st = {
            fill: '#000000', stroke: '#000000', lineWidth: 1,
            fillAlpha: 1, strokeAlpha: 1,
            rise: 0, charSpacing: 0, wordSpacing: 0, hScale: 1,
            fontId: null, fontSize: 10, leading: 0,
        };
        let tm = [1, 0, 0, 1, 0, 0];
        let tlm = [1, 0, 0, 1, 0, 0];

        const shapes = [];
        const images = [];
        const textRuns = [];

        const toDisp = () => U().transform(vp.transform, ctm);

        // pdf.js tidak memanggil beginPath() untuk tiap operator "re": beberapa
        // constructPath berturut-turut membangun SATU path yang baru dieksekusi
        // oleh op paint berikutnya. Karena itu path harus diakumulasi, bukan
        // ditimpa, dan bbox args[2] tidak dipakai (ruangnya tidak konsisten).
        let path = null;
        const newPath = () => (path || (path = { rects: [], segs: [], curveCount: 0 }));

        function emitPath(kind) {
            if (!path) return;
            const p = path;
            path = null;
            if (!p.rects.length && !p.segs.length) return;
            const m = toDisp();
            const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            const eat = (b) => {
                if (!Number.isFinite(b.x0) || !Number.isFinite(b.y0)) return;
                box.x0 = Math.min(box.x0, b.x0); box.y0 = Math.min(box.y0, b.y0);
                box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1);
            };
            const rects = [];
            for (const r of p.rects) {
                const b = quadBox(m, r[0], r[1], r[0] + r[2], r[1] + r[3]);
                b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
                if (!(b.w > 0) || !(b.h > 0)) continue;
                b.line = Math.min(b.w, b.h) <= 6 && Math.max(b.w, b.h) > Math.min(b.w, b.h) * 2;
                rects.push(b);
                eat(b);
            }
            const segs = [];
            for (const s of p.segs) {
                const a = mpt(m, s[0], s[1]);
                const b = mpt(m, s[2], s[3]);
                segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1] });
                eat({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });
            }
            if (!Number.isFinite(box.x0)) return;
            const w = box.x1 - box.x0;
            const h = box.y1 - box.y0;
            const scaledLw = st.lineWidth * Math.hypot(m[0], m[1]);
            shapes.push({
                kind,
                isLine: rects.length ? rects.every((r) => r.line) : Math.min(w, h) <= 6 && Math.max(w, h) > Math.min(w, h) * 2,
                rects, segs,
                curveCount: p.curveCount,
                color: kind === 'stroke' ? st.stroke : st.fill,
                strokeColor: st.stroke,
                alpha: kind === 'stroke' ? st.strokeAlpha : st.fillAlpha,
                lineWidth: scaledLw,
                x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, w, h,
                clip: kind === 'clip',
            });
        }

        const recordTextRun = () => {
            const m = U().transform(toDisp(), tm);
            textRuns.push({
                x: m[4], y: m[5],
                sizeX: Math.hypot(m[0], m[1]),
                color: st.fill, rise: st.rise,
                charSpacing: st.charSpacing, wordSpacing: st.wordSpacing, hScale: st.hScale,
                fontId: st.fontId, fontSize: st.fontSize,
            });
        };

        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            const args = ops.argsArray[i];

            if (fn === OPS.save) { stack.push(ctm.slice()); continue; }
            if (fn === OPS.restore) { ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; continue; }
            if (fn === OPS.transform) { ctm = U().transform(ctm, nums(args)); continue; }
            if (fn === OPS.paintFormXObjectBegin) {
                if (args && args[0]) { stack.push(ctm.slice()); ctm = U().transform(ctm, nums(args[0])); }
                continue;
            }
            if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); continue; }
            // Tampilan anotasi (mis. stempel tanda tangan elektronik) dirender
            // pdf.js pada ruang halaman, bukan ruang isi yang sedang aktif.
            if (fn === OPS.beginAnnotation) {
                stack.push(ctm.slice());
                const am = args && args[2];
                ctm = Array.isArray(am) && am.length === 6 ? nums(am) : [1, 0, 0, 1, 0, 0];
                continue;
            }
            if (fn === OPS.endAnnotation) { if (stack.length) ctm = stack.pop(); continue; }

            switch (fn) {
                case OPS.setLineWidth: st.lineWidth = args[0]; break;
                case OPS.setStrokeRGBColor: st.stroke = rgbOpToHex(...args); break;
                case OPS.setFillRGBColor: st.fill = rgbOpToHex(...args); break;
                case OPS.setStrokeGray: st.stroke = grayToHex(args[0]); break;
                case OPS.setFillGray: st.fill = grayToHex(args[0]); break;
                case OPS.setStrokeCMYKColor: st.stroke = cmykToHex(...args); break;
                case OPS.setFillCMYKColor: st.fill = cmykToHex(...args); break;
                case OPS.setFillColorN: st.fill = colorNToHex(args); break;
                case OPS.setStrokeColorN: st.stroke = colorNToHex(args); break;
                case OPS.setStrokeColorSpace: case OPS.setFillColorSpace: break;
                case OPS.setGState: {
                    const pairs = args && args[0];
                    if (Array.isArray(pairs)) {
                        for (const pr of pairs) {
                            if (!Array.isArray(pr)) continue;
                            if (pr[0] === 'ca') st.fillAlpha = pr[1];
                            else if (pr[0] === 'CA') st.strokeAlpha = pr[1];
                            else if (pr[0] === 'LW') st.lineWidth = pr[1];
                        }
                    }
                    break;
                }
                case OPS.setTextRise: st.rise = args[0]; break;
                case OPS.setCharSpacing: st.charSpacing = args[0]; break;
                case OPS.setWordSpacing: st.wordSpacing = args[0]; break;
                case OPS.setHScale: st.hScale = args[0]; break;
                case OPS.setFont: st.fontId = args[0]; st.fontSize = args[1]; break;

                case OPS.constructPath: {
                    const subops = nums(args[0]);
                    const coords = nums(args[1]);
                    const p = newPath();
                    let k = 0;
                    let px = 0;
                    let py = 0;
                    let startX = 0;
                    let startY = 0;
                    for (const so of subops) {
                        if (so === OPS.rectangle) {
                            p.rects.push([coords[k], coords[k + 1], coords[k + 2], coords[k + 3]]);
                            k += 4;
                        } else if (so === OPS.moveTo) {
                            px = startX = coords[k]; py = startY = coords[k + 1]; k += 2;
                        } else if (so === OPS.lineTo) {
                            p.segs.push([px, py, coords[k], coords[k + 1]]);
                            px = coords[k]; py = coords[k + 1]; k += 2;
                        } else if (so === OPS.curveTo) {
                            p.segs.push([px, py, coords[k + 4], coords[k + 5]]);
                            px = coords[k + 4]; py = coords[k + 5]; k += 6; p.curveCount++;
                        } else if (so === OPS.curveTo2) {
                            p.segs.push([px, py, coords[k + 2], coords[k + 3]]);
                            px = coords[k + 2]; py = coords[k + 3]; k += 4; p.curveCount++;
                        } else if (so === OPS.curveTo3) {
                            p.segs.push([px, py, coords[k], coords[k + 1]]);
                            px = coords[k]; py = coords[k + 1]; k += 4; p.curveCount++;
                        } else if (so === OPS.closePath) {
                            if (px !== startX || py !== startY) p.segs.push([px, py, startX, startY]);
                            px = startX; py = startY;
                        }
                    }
                    break;
                }

                case OPS.stroke: case OPS.closeStroke: emitPath('stroke'); break;
                case OPS.fill: case OPS.eoFill: emitPath('fill'); break;
                case OPS.fillStroke: case OPS.eoFillStroke:
                case OPS.closeFillStroke: case OPS.closeEOFillStroke: emitPath('fillStroke'); break;
                case OPS.clip: case OPS.eoClip: emitPath('clip'); break;
                case OPS.endPath: path = null; break;

                case OPS.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
                case OPS.setTextMatrix: { const m = nums(args); tm = m; tlm = m.slice(); break; }
                case OPS.moveText: {
                    const [tx, ty] = args;
                    tlm = [tlm[0], tlm[1], tlm[2], tlm[3],
                        tlm[0] * tx + tlm[2] * ty + tlm[4],
                        tlm[1] * tx + tlm[3] * ty + tlm[5]];
                    tm = tlm.slice();
                    break;
                }
                case OPS.setLeadingMoveText: {
                    const [tx, ty, le] = args;
                    st.leading = Number.isFinite(le) ? le : st.leading;
                    tlm = [tlm[0], tlm[1], tlm[2], tlm[3],
                        tlm[0] * tx + tlm[2] * (ty - st.leading) + tlm[4],
                        tlm[1] * tx + tlm[3] * (ty - st.leading) + tlm[5]];
                    tm = tlm.slice();
                    break;
                }
                case OPS.nextLine:
                    tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[2] * -st.leading + tlm[4], tlm[3] * -st.leading + tlm[5]];
                    tm = tlm.slice();
                    break;

                case OPS.showText: case OPS.showSpacedText:
                case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText:
                    recordTextRun();
                    break;

                case OPS.paintImageXObject: {
                    const m = toDisp();
                    const box = quadBox(m, 0, 0, 1, 1);
                    images.push({
                        name: args[0], px: args[1] || 0, py: args[2] || 0,
                        alpha: st.fillAlpha,
                        x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1,
                        w: box.x1 - box.x0, h: box.y1 - box.y0,
                    });
                    break;
                }
                case OPS.paintInlineImageXObject: {
                    const d = args && args[0];
                    const m = toDisp();
                    const box = quadBox(m, 0, 0, (d && d.width) || 1, (d && d.height) || 1);
                    images.push({
                        name: null, inline: d, alpha: st.fillAlpha,
                        x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1,
                        w: box.x1 - box.x0, h: box.y1 - box.y0,
                    });
                    break;
                }
                case OPS.shadingFill: {
                    shapes.push({ kind: 'shading', isLine: false, thin: false, color: st.fill, alpha: st.fillAlpha, lineWidth: 0, x0: 0, y0: 0, x1: vp.width, y1: vp.height, w: vp.width, h: vp.height, rects: [], curveCount: 0, clip: false });
                    break;
                }
                default: break;
            }
        }

        return { shapes, images, textRuns, vp };
    }

    // ───────────────────────── Gambar XObject -> PNG ─────────────────────────

    P2D.imageToPng = async function (page, name) {
        if (!name) return null;
        const store = /^g_/.test(name) ? page.commonObjs : page.objs;
        const obj = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 5000);
            const finish = (o) => { clearTimeout(timer); resolve(o || null); };
            try {
                if (store.has && store.has(name)) {
                    try { finish(store.get(name)); return; } catch (e) { /* belum siap */ }
                }
                store.get(name, finish);
            } catch (e) { clearTimeout(timer); resolve(null); }
        });
        if (!obj || !(obj.width > 0) || !(obj.height > 0)) return null;

        const canvas = document.createElement('canvas');
        canvas.width = obj.width;
        canvas.height = obj.height;
        const g = canvas.getContext('2d');
        try {
            if (obj.bitmap) {
                g.drawImage(obj.bitmap, 0, 0);
            } else if (obj.data) {
                const n = obj.width * obj.height;
                const d = obj.data;
                const rgba = new Uint8ClampedArray(n * 4);
                if (d.length === n * 4) rgba.set(d);
                else if (d.length === n * 3) {
                    for (let i = 0; i < n; i++) {
                        rgba[i * 4] = d[i * 3]; rgba[i * 4 + 1] = d[i * 3 + 1]; rgba[i * 4 + 2] = d[i * 3 + 2]; rgba[i * 4 + 3] = 255;
                    }
                } else if (d.length === n) {
                    for (let i = 0; i < n; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = d[i]; rgba[i * 4 + 3] = 255; }
                } else return null;
                g.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0);
            } else return null;
            const blob = await SP.canvasToBlob(canvas, 'image/png');
            return { buffer: await blob.arrayBuffer(), px: obj.width, py: obj.height };
        } finally {
            SP.freeCanvas(canvas);
        }
    };

    // ───────────────────────── Gaya font dari file sumber ─────────────────────────

    /**
     * pdf.js menebak tebal/miring dari nama font, tetapi PDF dari FPDF
     * menamai subset-nya "CIDFont+F3" tanpa jejak ketebalan. Berkas TrueType
     * yang tertanam masih menyimpan bit macStyle di tabel 'head', jadi
     * deskriptor font dibaca langsung dari byte PDF.
     */
    let styleSource = { buffer: null, styles: Object.create(null) };

    async function inflateBytes(u8) {
        if (typeof DecompressionStream === 'undefined') return null;
        // PDF sering menyisakan EOL sebelum "endstream"; zlib menolaknya.
        let end = u8.length;
        while (end > 0 && (u8[end - 1] === 0x0a || u8[end - 1] === 0x0d)) end--;
        try {
            const ds = new DecompressionStream('deflate');
            const writer = ds.writable.getWriter();
            const collect = new Response(ds.readable).arrayBuffer();
            await writer.write(u8.subarray(0, end));
            await writer.close();
            return new Uint8Array(await collect);
        } catch (e) {
            return null;
        }
    }

    function ttfStyle(u8) {
        if (!u8 || u8.length < 12) return null;
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const num = dv.getUint16(4);
        const tags = Object.create(null);
        for (let i = 0; i < num; i++) {
            const off = 12 + i * 16;
            if (off + 16 > u8.length) break;
            const tag = String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
            tags[tag] = dv.getUint32(off + 8);
        }
        let bold = false;
        let italic = false;
        if (tags.head != null && tags.head + 46 <= u8.length) {
            const mac = dv.getUint16(tags.head + 44);
            bold = !!(mac & 1);
            italic = !!(mac & 2);
        }
        if (tags['OS/2'] != null && tags['OS/2'] + 64 <= u8.length) {
            const fs = dv.getUint16(tags['OS/2'] + 62);
            bold = bold || !!(fs & 0x20);
            italic = italic || !!(fs & 0x01);
        }
        return { bold, italic };
    }

    async function readFontStyles(buffer) {
        const styles = Object.create(null);
        if (!buffer) return styles;
        const bytes = new Uint8Array(buffer);
        // Dekode 1:1 latin1 supaya offset string sama dengan offset byte.
        const text = new TextDecoder('latin1').decode(bytes);
        const objAt = new Map();
        const objRe = /(\d+)\s+\d+\s+obj\b/g;
        let m;
        while ((m = objRe.exec(text))) objAt.set(+m[1], m.index);

        const seen = new Set();
        const descRe = /\/FontDescriptor\s+(\d+)\s+\d+\s+R/g;
        while ((m = descRe.exec(text))) {
            const num = +m[1];
            if (seen.has(num)) continue;
            seen.add(num);
            const start = objAt.get(num);
            if (start == null) continue;
            let end = text.indexOf('endobj', start);
            if (end < 0) end = Math.min(text.length, start + 8192);
            const body = text.slice(start, end);
            const fn = /\/FontName\s*\/([^\s/<>\[\]()]+)/.exec(body);
            const ff = /\/FontFile2\s+(\d+)\s+\d+\s+R/.exec(body);
            if (!fn || !ff) continue;
            const inner = objAt.get(+ff[1]);
            if (inner == null) continue;
            const sStart = text.indexOf('stream', inner);
            if (sStart < 0) continue;
            const dict = text.slice(inner, sStart);
            let dataStart = sStart + 6;
            if (text[dataStart] === '\r') dataStart++;
            if (text[dataStart] === '\n') dataStart++;
            const sEnd = text.indexOf('endstream', dataStart);
            if (sEnd < 0) continue;
            const raw = bytes.subarray(dataStart, sEnd);
            const data = /FlateDecode/.test(dict) ? await inflateBytes(raw) : raw;
            const st = ttfStyle(data);
            if (st) styles[fn[1]] = st;
        }
        return styles;
    }

    function styleOf(name) {
        const styles = styleSource.styles;
        if (!name) return null;
        if (styles[name]) return styles[name];
        const bare = name.replace(/^[A-Z]{6}\+/, '');
        if (styles[bare]) return styles[bare];
        for (const k of Object.keys(styles)) {
            if (k.replace(/^[A-Z]{6}\+/, '') === bare) return styles[k];
        }
        return null;
    }

    // ───────────────────────── Assembling satu halaman ─────────────────────────

    /**
     * TextContent tidak membawa warna, rise, atau char-spacing, jadi catatan per
     * showText dari operator stream dicocokkan ke item berdasarkan posisi asal.
     */
    function matchRuns(items, runs) {
        const DEFAULT = { color: '#000000', rise: 0, charSpacing: 0, wordSpacing: 0, hScale: 1, fontId: null, fontSize: 0, sizeX: 0 };
        if (!runs.length) return () => DEFAULT;
        let ptr = 0;
        return (x, y) => {
            let best = null;
            let bestD = Infinity;
            for (let k = Math.max(0, ptr - 1); k < Math.min(runs.length, ptr + 8); k++) {
                const r = runs[k];
                const d = Math.abs(r.x - x) + Math.abs(r.y - y);
                if (d < bestD) { bestD = d; best = k; }
            }
            // Tanpa kecocokan, jangan warisi run tetangga: itu membocorkan warna
            // dan char-spacing dari operasi vektor/teks lain ke span ini.
            if (best == null || bestD > 3) return DEFAULT;
            ptr = best;
            return runs[best];
        };
    }

    /**
     * Model halaman:
     * { W, H, rotate, spans[], shapes[], images[] }
     * span = { text, x0, x1, top, bottom, baseline, size, family, bold, italic,
     *          color, risePt, charSpacingPt, hasEOL }
     */
    P2D.extractPage = async function (page, buffer) {
        if (buffer && styleSource.buffer !== buffer) {
            styleSource = { buffer, styles: await readFontStyles(buffer) };
        }
        const vp = page.getViewport({ scale: 1 });
        const [ops, tc] = await Promise.all([
            page.getOperatorList(),
            page.getTextContent({ includeMarkedContent: false }),
        ]);
        const walked = walkOperators(page, ops);
        const lookup = matchRuns(tc.items, walked.textRuns);

        const fonts = Object.create(null);
        const spans = [];
        for (const it of tc.items) {
            const text = it.str;
            if (!text || !text.trim()) continue;
            const m = U().transform(vp.transform, it.transform);
            const run = lookup(m[4], m[5]);
            const size = Math.hypot(it.transform[0], it.transform[1]) || it.height || run.fontSize || 10;
            const fontId = run.fontId || it.fontName;
            if (!(fontId in fonts)) {
                const rf = await resolveFont(page, fontId);
                const st = styleOf(rf.rawName);
                fonts[fontId] = st
                    ? Object.assign({}, rf, { bold: rf.bold || st.bold, italic: rf.italic || st.italic })
                    : rf;
            }
            const f = fonts[fontId] || UNKNOWN_FONT;
            const asc = saneAscent(f.ascent, 0.8);
            const desc = saneDescent(f.descent, -0.2);

            spans.push({
                text,
                x0: Math.min(m[4], m[4] + it.width),
                x1: Math.max(m[4], m[4] + it.width),
                baseline: m[5],
                top: m[5] - size * asc,
                bottom: m[5] + size * -desc,
                w: Math.abs(it.width),
                size,
                family: f.family,
                rawName: f.rawName,
                bold: f.bold,
                italic: f.italic,
                ascent: asc,
                descent: desc,
                color: run.color,
                // Tc/Trise berada di ruang teks; dikali skala matriks teks untuk
                // mendapat nilai point yang bisa langsung dipakai w:spacing/w:vertAlign.
                risePt: (run.rise || 0) * (run.sizeX || 1),
                charSpacingPt: (run.charSpacing || 0) * (run.sizeX || 1),
                wordSpacingPt: (run.wordSpacing || 0) * (run.sizeX || 1),
                hScale: run.hScale || 1,
                hasEOL: !!it.hasEOL,
            });
        }

        const shapes = walked.shapes.filter(s => !s.clip);
        const clips = walked.shapes.filter(s => s.clip);

        return {
            W: vp.width,
            H: vp.height,
            rotate: page.rotate || 0,
            spans,
            shapes,
            clips,
            images: walked.images,
            fonts,
            page,
        };
    };

    /** Panjang minimum sebuah segmen agar layak dianggap border tabel (pt). */
    const MIN_BORDER_LEN = 12;

    /**
     * Garis border horizontal & vertikal dari shape.
     *
     * Sumber ada dua: rect terisi setipis <=6pt (gaya FPDF: border tabel digambar
     * sebagai "re 0.48 549 f", bukan stroke) dan segmen garis hasil stroke.
     * Klasifikasi per-rect, bukan per-path, karena satu path bisa mencampur blok
     * besar dan garis tipis.
     */
    P2D.bordersOf = function (shapes) {
        const h = [];
        const v = [];
        const addH = (x0, x1, y, t, color) => {
            if (!(x1 > x0) || !(t > 0) || t > 6 || x1 - x0 < MIN_BORDER_LEN) return;
            h.push({ x0, x1, y, t, color });
        };
        const addV = (y0, y1, x, t, color) => {
            if (!(y1 > y0) || !(t > 0) || t > 6 || y1 - y0 < MIN_BORDER_LEN) return;
            v.push({ y0, y1, x, t, color });
        };

        for (const s of shapes) {
            if (s.kind === 'shading' || s.clip || s.alpha < 0.05) continue;
            for (const r of s.rects) {
                if (!r.line) continue;
                if (r.w >= r.h) addH(r.x0, r.x1, (r.y0 + r.y1) / 2, r.h, s.color);
                else addV(r.y0, r.y1, (r.x0 + r.x1) / 2, r.w, s.color);
            }
            if (s.kind !== 'stroke' && s.kind !== 'fillStroke') continue;
            const lw = Math.max(s.lineWidth, 0.25);
            for (const g of s.segs) {
                if (Math.abs(g.ay - g.by) <= 1.2) addH(Math.min(g.ax, g.bx), Math.max(g.ax, g.bx), (g.ay + g.by) / 2, lw, s.strokeColor || s.color);
                else if (Math.abs(g.ax - g.bx) <= 1.2) addV(Math.min(g.ay, g.by), Math.max(g.ay, g.by), (g.ax + g.bx) / 2, lw, s.strokeColor || s.color);
            }
        }
        return { h, v };
    };

    /** Blok warna penuh (bukan garis): shading sel atau background. */
    P2D.fillsOf = function (shapes) {
        const out = [];
        for (const s of shapes) {
            if (s.kind === 'shading' || s.clip || s.kind === 'stroke') continue;
            if (s.alpha < 0.05 || isWhite(s.color)) continue;
            for (const r of s.rects) {
                if (r.line || r.w < 3 || r.h < 3) continue;
                out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, w: r.w, h: r.h, color: s.color });
            }
        }
        return out;
    };
})();
