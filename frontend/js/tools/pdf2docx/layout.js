/**
 * PDF -> Word: mesin tata letak.
 *
 * Mengubah model geometri satu halaman (span teks + border + fill) menjadi
 * blok semantik yang bisa ditulis ke OOXML: baris -> sel -> paragraf, tabel
 * lattice dari garis border, dan urutan baca per kolom.
 *
 * Semua koordinat dalam point, sumbu y ke bawah (ruang display PDF).
 */
(function () {
    'use strict';

    const P2D = (window.P2D = window.P2D || {});

    // Ambang. Nilai rasio dikalikan ukuran font; satuan absolut dalam point.
    const OVERLAP = 0.5;      // tumpang tindih vertikal minimum agar dua span satu baris
    const BASE_TOL = 0.45;    // jarak baseline maksimum (x ukuran font) untuk satu baris
    const CELL_GAP = 0.55;    // celah (x fs) yang dianggap pindah sel/tab, bukan spasi
    const SPACE_GAP = 0.12;   // celah minimum yang perlu disisipi spasi
    const PARA_GAP = 1.14;    // rasio jarak antarbaris terhadap leading: > ini = paragraf baru
    const SHORT_LINE = 2;     // x fs: baris dianggap "pendek" (paragraf selesai)
    const BORDER_CLUSTER = 1.6;
    const MIN_CELL = 6;
    const MIN_BORDER_LEN = 12;

    const r1 = (v) => Math.round(v * 10) / 10;

    function modeOf(values, bucket) {
        const hist = new Map();
        for (const v of values) {
            if (!Number.isFinite(v)) continue;
            const k = Math.round(v / bucket) * bucket;
            hist.set(k, (hist.get(k) || 0) + 1);
        }
        let best = null;
        let bestN = 0;
        for (const [k, n] of hist) {
            if (n > bestN || (n === bestN && best !== null && k > best)) { bestN = n; best = k; }
        }
        return best;
    }

    function pct(values, p) {
        if (!values.length) return 0;
        const s = values.slice().sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
    }

    // ───────────────────────── Baris & sel ─────────────────────────

    function groupLines(spans) {
        const items = spans
            .filter((s) => s.text && s.text.trim() && s.size > 0.5 && s.bottom - s.top > 0.5)
            .map((s) => Object.assign({}, s, { h: s.bottom - s.top }))
            .sort((a, b) => a.top - b.top || a.x0 - b.x0);

        const lines = [];
        for (const it of items) {
            let hit = null;
            for (let k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--) {
                const ln = lines[k];
                const ov = Math.min(ln.bottom, it.bottom) - Math.max(ln.top, it.top);
                const baseD = Math.abs(ln.baseline - it.baseline);
                const tol = Math.min(ln.size, it.size);
                if (ov >= Math.min(ln.h, it.h) * OVERLAP || baseD <= tol * BASE_TOL) { hit = ln; break; }
            }
            if (hit) {
                hit.spans.push(it);
                hit.top = Math.min(hit.top, it.top);
                hit.bottom = Math.max(hit.bottom, it.bottom);
                hit.h = hit.bottom - hit.top;
            } else {
                lines.push({ top: it.top, bottom: it.bottom, h: it.h, baseline: it.baseline, size: it.size, spans: [it] });
            }
        }
        lines.forEach(finishLine);
        lines.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
        return lines;
    }

    function finishLine(ln) {
        ln.spans.sort((a, b) => a.x0 - b.x0);
        ln.x0 = ln.spans[0].x0;
        ln.x1 = ln.spans[ln.spans.length - 1].x1;
        for (const s of ln.spans) ln.x1 = Math.max(ln.x1, s.x1);
        ln.size = modeOf(ln.spans.map((s) => s.size), 0.5) || ln.spans[0].size;
        ln.baseline = pct(ln.spans.map((s) => s.baseline), 0.5);

        // Ambang pindah sel harus mengikuti lebar spasi baris ini: teks rata
        // kiri-kanan melebarkan spasi antar kata sampai > 0,5 em, dan itu bukan
        // batas kolom. Celah kolom sungguhan jauh di atas median celah kata.
        const gaps = [];
        for (let i = 1; i < ln.spans.length; i++) gaps.push(ln.spans[i].x0 - ln.spans[i - 1].x1);
        // Satu-dua celah saja tidak punya median yang bermakna: satu celah besar
        // (mis. "Ditetapkan di" lalu ": Padang") akan mengangkat ambangnya
        // sendiri sehingga tab tidak pernah terdeteksi. Pakai celah tersempit.
        const medGap = !gaps.length ? 0 : gaps.length >= 3 ? pct(gaps, 0.5) : Math.min(...gaps);
        // Satu celah saja tidak bisa dibandingkan dengan apa pun; ambangnya
        // dipersempit agar baris formulir "Ditetapkan di   : Padang" terpecah.
        const cap = gaps.length === 1 ? ln.size * 1.2 : ln.size * 3;
        ln.splitGap = Math.max(ln.size * CELL_GAP, 1.2, Math.min(medGap * 2.2, cap));

        const cells = [];
        let cur = null;
        for (const s of ln.spans) {
            if (cur) {
                const gap = s.x0 - cur.x1;
                if (gap <= ln.splitGap) {
                    cur.spans.push(s);
                    cur.x1 = Math.max(cur.x1, s.x1);
                    continue;
                }
            }
            cur = { x0: s.x0, x1: s.x1, spans: [s] };
            cells.push(cur);
        }
        ln.cells = cells;
        ln.text = cells.map((c) => c.spans.map((s) => s.text).join('')).join(' ');
    }

    // ───────────────────────── Geometri halaman ─────────────────────────

    /**
     * Tepi kanan kolom: persentil menahan baris liar, tetapi baris yang hanya
     * sedikit melewatinya (mis. tanggal pada baris formulir) justru menandai
     * margin sebenarnya.
     */
    function edgeRight(xs, pageW) {
        const hi = pct(xs, 0.98);
        const max = Math.max(...xs);
        const edge = max - hi <= 30 ? max : hi;
        return Math.min(pageW - 18, edge + 4);
    }

    function pageBox(lines, pg) {
        if (!lines.length) return { left: 0, right: pg.W, top: 0, bottom: pg.H };
        // Lebar kolom dari persentil (satu baris footer selebar halaman tidak
        // boleh melebarkan kolom), tetapi tinggi dari tepi terluar: kalau baris
        // pertama/terakhir dibuang, kolom menyusut dan isi meluber ke halaman
        // berikutnya saat ditulis ke Word.
        const box = {
            left: Math.max(0, pct(lines.map((l) => l.x0), 0.02)),
            right: Math.min(pg.W, edgeRight(lines.map((l) => l.x1), pg.W)),
            top: Math.max(0, Math.min(...lines.map((l) => l.top))),
            bottom: Math.min(pg.H, Math.max(...lines.map((l) => l.bottom))),
        };
        if (box.right - box.left < 100) { box.left = 72; box.right = pg.W - 72; }
        if (box.bottom - box.top < 100) { box.top = 72; box.bottom = pg.H - 72; }
        return box;
    }

    function modalStats(lines, box) {
        const deltas = [];
        for (let i = 1; i < lines.length; i++) {
            const d = lines[i].baseline - lines[i - 1].baseline;
            if (d > 1 && d < 40) deltas.push(r1(d));
        }
        const leading = modeOf(deltas, 0.5) || 14;

        const chars = new Map();
        for (const ln of lines) {
            for (const s of ln.spans) {
                const k = r1(s.size);
                chars.set(k, (chars.get(k) || 0) + s.text.length);
            }
        }
        let fs = 11;
        let best = 0;
        for (const [k, n] of chars) if (n > best) { best = n; fs = k; }

        const body = lines.filter((l) => Math.abs(l.size - fs) < 1);
        const full = body.filter((l) => l.x1 >= box.right - Math.max(SHORT_LINE * fs, 5));
        const justified = body.length > 4 && full.length / body.length > 0.5;
        return { leading, fs, justified };
    }

    function dividerOf(lines, box) {
        if (lines.length < 8) return null;
        const span = box.right - box.left;
        const lo = box.left + span * 0.3;
        const hi = box.left + span * 0.72;

        const ends = [];
        const starts = [];
        for (const ln of lines) {
            for (const c of ln.cells) {
                if (c.x1 > lo && c.x1 < hi) ends.push(c.x1);
                if (c.x0 > lo && c.x0 < hi + 40) starts.push(c.x0);
            }
        }
        if (ends.length < 8) return null;
        const peak = modeOf(ends, 3);
        if (peak == null) return null;
        const nearPeak = ends.filter((x) => Math.abs(x - peak) <= 3).length;
        if (nearPeak < lines.length * 0.2) return null;
        const after = starts.filter((x) => x > peak && x < peak + 40).length;
        if (after < lines.length * 0.12) return null;
        return peak;
    }

    /** Urutan baca: baris selebar halaman memotong "band", tiap band dibaca kiri lalu kanan. */
    function readingOrder(lines, div) {
        if (!div) return lines.slice();
        const out = [];
        let band = [];
        const flush = () => {
            if (!band.length) return;
            const left = [];
            const right = [];
            const other = [];
            for (const ln of band) {
                if (ln.x1 <= div + 2) left.push(ln);
                else if (ln.x0 >= div - 2) right.push(ln);
                else other.push(ln);
            }
            const byY = (a, b) => a.baseline - b.baseline;
            out.push(...left.sort(byY), ...right.sort(byY), ...other.sort(byY));
            band = [];
        };
        for (const ln of lines) {
            if (ln.x1 <= div + 2 || ln.x0 >= div - 2) band.push(ln);
            else { flush(); out.push(ln); }
        }
        flush();
        return out;
    }

    // ───────────────────────── Tabel lattice ─────────────────────────

    function clusterLines(list, valOf) {
        const sorted = list.slice().sort((a, b) => valOf(a) - valOf(b));
        const groups = [];
        for (const b of sorted) {
            const v = valOf(b);
            const g = groups[groups.length - 1];
            if (g && Math.abs(g.v - v) <= BORDER_CLUSTER) {
                g.items.push(b);
                g.v = (g.v * (g.items.length - 1) + v) / g.items.length;
                g.t = Math.max(g.t, b.t);
            } else {
                groups.push({ v, t: b.t, color: b.color, items: [b] });
            }
        }
        return groups;
    }

    /** Rentang garis per klaster pada sumbu panjangnya (h: x, v: y). */
    function clusterExtent(g, horizontal) {
        const lo = horizontal ? 'x0' : 'y0';
        const hi = horizontal ? 'x1' : 'y1';
        return {
            lo: Math.min(...g.items.map((b) => b[lo])),
            hi: Math.max(...g.items.map((b) => b[hi])),
        };
    }

    function buildCells(rowTop, rowBot, cols) {
        const cells = [];
        for (let j = 0; j + 1 < cols.length; j++) {
            cells.push({
                x0: cols[j].v, x1: cols[j + 1].v,
                y0: rowTop, y1: rowBot,
                spans: [],
            });
        }
        return cells;
    }

    /**
     * Tabel lattice: baris tabel = pasangan garis horizontal berurutan yang
     * disilang minimal dua garis vertikal. Tanpa garis, teks tetap mengalir
     * sebagai paragraf bertab.
     */
    function detectTables(borders, fills, box) {
        const hs = clusterLines(borders.h, (b) => b.y)
            .map((g) => Object.assign(g, clusterExtent(g, true)))
            .filter((g) => g.hi - g.lo >= MIN_BORDER_LEN);
        const vs = clusterLines(borders.v, (b) => b.x)
            .map((g) => Object.assign(g, clusterExtent(g, false)))
            .filter((g) => g.hi - g.lo >= MIN_BORDER_LEN);
        if (hs.length < 2 || vs.length < 2) return [];

        const colsAt = (top, bot) => {
            const lx = Math.min(top.lo, bot.lo) - 1;
            const rx = Math.max(top.hi, bot.hi) + 1;
            return vs
                .filter((v) => v.v >= lx && v.v <= rx && v.lo <= top.v + 2.5 && v.hi >= bot.v - 2.5)
                .map((v) => v.v)
                .sort((a, b) => a - b);
        };

        const bands = [];
        for (let i = 0; i + 1 < hs.length; i++) {
            const top = hs[i];
            const bot = hs[i + 1];
            const height = bot.v - top.v;
            if (height < MIN_CELL || height > 140) continue;

            const cols = colsAt(top, bot);
            if (cols.length < 2) continue;
            if (cols[cols.length - 1] - cols[0] < MIN_BORDER_LEN) continue;

            bands.push({ y0: top.v, y1: bot.v, cols, t: Math.max(top.t, bot.t), color: top.color });
        }
        if (bands.length < 2) return [];

        // Gabungkan band berurutan yang kolomnya sama menjadi satu tabel.
        const tables = [];
        let cur = null;
        for (const band of bands) {
            const same = cur && band.cols.length === cur.cols.length
                && band.cols.every((x, k) => Math.abs(x - cur.cols[k]) <= 3)
                && band.y0 - cur.y1 < 2.5;
            if (same) {
                cur.rows.push(band);
                cur.y1 = band.y1;
            } else {
                cur = { type: 'table', y0: band.y0, y1: band.y1, cols: band.cols.slice(), rows: [band], borders: { t: band.t, color: band.color } };
                tables.push(cur);
            }
        }

        const kept = tables.filter((t) => t.rows.length >= 2 && t.cols.length >= 2);
        for (const t of kept) {
            t.x0 = t.cols[0];
            t.x1 = t.cols[t.cols.length - 1];
            t.grid = t.rows.map((r) => {
                const cells = buildCells(r.y0, r.y1, t.cols.map((x) => ({ v: x })));
                cells[0].openLeft = true;
                cells[cells.length - 1].openRight = true;
                return cells;
            });
            // shading per sel dari blok warna yang menutupinya >=90%
            for (const row of t.grid) {
                for (const cell of row) {
                    const area = (cell.x1 - cell.x0) * (cell.y1 - cell.y0);
                    let best = null;
                    let bestArea = 0;
                    for (const f of fills) {
                        const w = Math.min(cell.x1, f.x1) - Math.max(cell.x0, f.x0);
                        const h = Math.min(cell.y1, f.y1) - Math.max(cell.y0, f.y0);
                        if (w <= 0 || h <= 0) continue;
                        const a = w * h;
                        if (a > bestArea) { bestArea = a; best = f; }
                    }
                    if (best && bestArea >= area * 0.9) cell.shade = best.color;
                }
            }
        }
        return kept;
    }

    /** Isi span ke dalam sel tabel berdasarkan titik tengah. */
    function fillTableText(table, lines, used) {
        for (const ln of lines) {
            for (const s of ln.spans) {
                const cx = (s.x0 + s.x1) / 2;
                const cy = s.baseline;
                if (cx < table.x0 - 2 || cx > table.x1 + 2 || cy < table.y0 - 2 || cy > table.y1 + 2) continue;
                for (const row of table.grid) {
                    if (row.length && (cy < row[0].y0 - 1 || cy > row[0].y1 + 1)) continue;
                    for (const cell of row) {
                        if (cx < cell.x0 - 1 || cx > cell.x1 + 1) continue;
                        cell.spans.push(s);
                        used.add(s);
                    }
                }
            }
        }
        // Kumpulkan span per baris sel agar urutan teks tetap kiri->kanan.
        for (const row of table.grid) {
            for (const cell of row) cell.spans.sort((a, b) => (a.baseline - b.baseline) || (a.x0 - b.x0));
        }
    }

    // ───────────────────────── Paragraf ─────────────────────────

    const sameStyle = (a, b) =>
        a.bold === b.bold && a.italic === b.italic && a.family === b.family
        && Math.abs(a.size - b.size) < 0.6
        && a.color === b.color
        && Math.abs((a.rise || 0) - (b.rise || 0)) < 0.5
        && Math.abs((a.charSpacing || 0) - (b.charSpacing || 0)) < 0.3;

    const runOf = (s) => ({
        text: s.text,
        size: s.size,
        family: s.family,
        bold: s.bold,
        italic: s.italic,
        color: s.color,
        rise: s.risePt,
        charSpacing: s.charSpacingPt,
    });

    /** Spasi yang hilang di antara dua span kata (PDF sering memecah per kata). */
    const wordGap = (a, b) =>
        b.x0 - a.x1 > Math.max(b.size * 0.15, 0.7)
        && !/\s$/.test(a.text) && !/^\s/.test(b.text);

    function buildRuns(blockLines, box) {
        const runs = [];
        const tabPos = new Map();
        const pushRun = (r) => {
            const last = runs[runs.length - 1];
            if (last && last.type === 'text' && r.type === 'text' && sameStyle(last, r)) {
                last.text += r.text;
            } else {
                runs.push(r);
            }
        };
        const spaceRun = (s) => ({ type: 'text', text: ' ', size: s.size, family: s.family, bold: false, italic: false, color: '#000000', rise: 0, charSpacing: 0 });

        for (let li = 0; li < blockLines.length; li++) {
            const ln = blockLines[li];
            if (li > 0) {
                const prevRun = runs[runs.length - 1];
                const prevLine = blockLines[li - 1];
                const firstText = ln.cells[0].spans[0];
                // Baris yang berhenti jauh sebelum tepi kolom adalah pemenggalan
                // tetap dari sumber (judul berbaris-baris, "Yulia" lalu NIP);
                // tanpa <w:br/> Word akan menyambungnya menjadi satu baris baru
                // dan mengubah pemenggalan aslinya.
                const prevShort = (prevLine.x1 - prevLine.x0) < 4 * prevLine.size
                    || prevLine.x1 < box.right - Math.max(prevLine.size * 2, 6);
                const joinHyphen = prevRun && prevRun.type === 'text' && /[A-Za-z]-$/.test(prevRun.text) && /^[a-z]/.test(firstText.text);
                if (prevShort && !joinHyphen) pushRun({ type: 'break' });
                else if (joinHyphen) prevRun.text = prevRun.text.slice(0, -1);
                else if (prevRun && prevRun.type === 'text' && !/\s$/.test(prevRun.text)) pushRun(spaceRun(firstText));
            }
            for (let ci = 0; ci < ln.cells.length; ci++) {
                const cell = ln.cells[ci];
                if (ci > 0) {
                    const prevCell = ln.cells[ci - 1];
                    const gap = cell.x0 - prevCell.x1;
                    if (gap > Math.max(ln.size * SPACE_GAP, 0.8)) {
                        pushRun({ type: 'tab' });
                        // Sel terakhir yang berhenti di tepi kolom adalah kolom
                        // rata kanan (tanggal pada kepala surat). Tab kanan
                        // menjaga teks tetap satu baris walau lebarnya pas.
                        // Hanya untuk sel pendek di paruh kanan: sel panjang
                        // yang kebetulan menyentuh margin adalah lanjutan kalimat.
                        const avail = box.right - box.left;
                        const atEdge = ci === ln.cells.length - 1
                            && cell.x1 >= box.right - Math.max(ln.size, 6)
                            && cell.x0 > box.left + avail * 0.5
                            && (cell.x1 - cell.x0) < avail * 0.45;
                        const pos = Math.round(((atEdge ? cell.x1 : cell.x0) - box.left) * 2) / 2;
                        const need = prevCell.x1 - box.left;
                        if (pos > need + 2) {
                            const was = tabPos.get(pos);
                            tabPos.set(pos, {
                                need: Math.max(was ? was.need : 0, need),
                                right: atEdge || !!(was && was.right),
                            });
                        }
                    }
                }
                let prevSpan = null;
                for (const s of cell.spans) {
                    if (prevSpan && wordGap(prevSpan, s)) pushRun(spaceRun(s));
                    pushRun(Object.assign({ type: 'text' }, runOf(s)));
                    prevSpan = s;
                }
            }
        }
        // Tab yang posisinya bisa tertabrak teks sebelumnya dibuang agar tidak
        // mendorong isi sel keluar margin.
        const tabs = [...tabPos]
            .sort((a, b) => a[0] - b[0])
            .filter(([p, v]) => p > 4 && v.need <= p)
            .map(([pos, v]) => ({ pos, right: v.right }));
        while (runs.length && runs[runs.length - 1].type === 'tab') runs.pop();
        return { runs, tabs };
    }

    function alignmentOf(blockLines, box, fs) {
        const n = blockLines.length;
        const first = blockLines[0];
        const xs = blockLines.map((l) => l.x0);
        const xe = blockLines.map((l) => l.x1);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xe);
        const avail = Math.max(1, box.right - box.left);

        if (n === 1) {
            const leftDist = minX - box.left;
            const rightDist = box.right - maxX;
            const width = maxX - minX;
            if (Math.abs(leftDist - rightDist) < fs * 1.5 && leftDist > fs * 1.5 && width < avail * 0.8) return 'center';
            // Baris selebar kolom yang berakhir tepat di margin kanan adalah
            // baris rata kiri ber-indentasi, bukan teks rata kanan.
            if (rightDist < 3 && leftDist > 40 && width < avail * 0.6) return 'right';
            return 'left';
        }

        const centers = blockLines.map((l) => (l.x0 + l.x1) / 2);
        const avg = centers.reduce((a, b) => a + b, 0) / n;
        const centered = centers.every((c) => Math.abs(c - avg) < fs * 1.2)
            && Math.abs(avg - (box.left + box.right) / 2) < fs * 3
            && blockLines.every((l) => l.x0 > box.left + fs * 1.5);
        if (centered) return 'center';

        const body = blockLines.slice(0, -1);
        // Rata kanan-kiri dilihat dari keseragaman tepi kanan blok itu sendiri,
        // bukan dari margin halaman: indentasi dan margin kanan per halaman
        // sering berbeda beberapa poin dari perkiraan kotak teks.
        const endMax = body.length ? Math.max(...body.map((l) => l.x1)) : 0;
        const full = body.filter((l) => l.x1 >= endMax - Math.max(fs * 1.5, 6)).length;
        if (body.length && full >= 2 && full / body.length > 0.6 && endMax - box.left >= avail * 0.55) return 'both';
        return 'left';
    }

    function formatBlock(blockLines, box, modal, prev) {
        const first = blockLines[0];
        const last = blockLines[blockLines.length - 1];
        const fs = modal.fs;
        const maxX = Math.max(...blockLines.map((l) => l.x1));

        const jc = alignmentOf(blockLines, box, fs);
        const avail = Math.max(1, box.right - box.left);
        // Indentasi dihitung dari baris isi, bukan dari baris pertama: butir
        // daftar ("b.  bahwa") menggantung di kiri, sedangkan baris lanjutannya
        // sejajar dengan teks butir sebelumnya.
        const bodyMin = blockLines.length > 1
            ? Math.min(...blockLines.slice(1).map((l) => l.x0))
            : first.x0;
        let left = Math.max(0, bodyMin - box.left);
        let delta = first.x0 - bodyMin;
        // Baris pendek berakhir jauh sebelum margin kanan, tetapi itu bukan
        // indentasi: sisa ruang pada satu baris bukan batas kolom. Indentasi
        // kanan hanya dipakai bila blok benar-benar berhenti di tepi kanan
        // yang konsisten. Tanpa ini paragraf pendek menyusut jadi ~1 karakter.
        const ends = blockLines.map((l) => l.x1);
        const solid = ends.filter((x) => x >= maxX - Math.max(fs * 2, 6)).length;
        const rightEdge = maxX >= box.right - Math.max(fs * 2, 8)
            || (blockLines.length > 1 && solid / blockLines.length > 0.6);
        let right = rightEdge ? Math.max(0, box.right - maxX) : 0;
        // Satu-dua baris tidak perlu batas kanan: indentasi kanan hanya
        // mengatur pemenggalan, dan justru mempersempit baris-baris itu.
        if (blockLines.length < 3) right = 0;
        // Untuk teks tengah/kanan, posisi sudah ditentukan perataan: indent
        // hanya akan mempersempit kolom dan memaksa baris terpotong.
        if (jc === 'center' || jc === 'right') { left = 0; right = 0; delta = 0; }
        // Indentasi selebar kolom membuat paragraf tidak punya ruang tersisa;
        // dalam kasus itu posisi cukup diatur oleh perataan.
        else if (avail - left - right < Math.max(2 * fs, 12)) { left = 0; right = 0; delta = 0; }
        const firstLine = delta > 2 ? delta : 0;
        const hanging = delta < -2 ? -delta : 0;

        const text = blockLines.map((l) => l.text).join(' ');
        const isList = /^\s*([\u2022\u25cf\u25aa\u25e6\-–—]|\d{1,3}[.)]|[a-z][.)]|[ivxlc]+[.)])\s/i.test(text);

        const headingFs = blockLines.length === 1 && !isList && text.length < 140
            ? (first.size >= modal.fs * 1.55 ? 1 : first.size >= modal.fs * 1.25 ? 2 : 0)
            : 0;

        // Jarak baris diambil dari jarak baseline asli agar tinggi halaman sama
        // dengan sumber; 'auto' Word memberi ~13,2 pt untuk 11 pt, lebih tinggi
        // daripada leading PDF sehingga isi meluber ke halaman berikutnya.
        let linePt = 0;
        if (blockLines.length > 1) {
            const ds = [];
            for (let i = 1; i < blockLines.length; i++) ds.push(blockLines[i].baseline - blockLines[i - 1].baseline);
            const m = modeOf(ds, 0.5);
            if (m > 1) linePt = m;
        }
        const maxSize = Math.max(...blockLines.map((l) => l.size));
        // Baris tunggal tidak punya jarak antarbaris sendiri: pakai tinggi
        // alaminya. Teks kecil (mis. footer lembaga 7 pt) akan menggelembung
        // kalau dipaksa setinggi leading badan teks.
        if (!(linePt > 0)) linePt = Math.min(modal.leading, maxSize * 1.3);
        linePt = Math.max(linePt, maxSize * 1.12);

        // Sisa jarak setelah satu baris penuh menjadi spasi 'before'. Dihitung
        // dari tinggi baris paragraf ini, bukan leading umum, agar judul kecil
        // dan judul besar tetap berada di baseline sumber.
        let before = 0;
        if (prev) {
            before = Math.max(0, first.baseline - prev.lastBaseline - linePt);
            if (before > modal.leading * 3) before = modal.leading * 3;
        }

        const { runs, tabs } = buildRuns(blockLines, box);
        return {
            type: 'p',
            y0: first.top,
            y1: last.bottom,
            firstBaseline: first.baseline,
            lastBaseline: last.baseline,
            size: first.size,
            text,
            runs,
            fmt: {
                jc, left, right, firstLine, hanging, before,
                linePt, tabs, isList, heading: headingFs,
            },
        };
    }

    /** Pecah baris menjadi paragraf berdasarkan jarak, ukuran, indentasi, dan panjang baris. */
    function buildBlocks(lines, box, modal) {
        const blocks = [];
        let cur = null;
        let prev = null;

        const flush = () => {
            if (!cur) return;
            const b = formatBlock(cur.lines, box, modal, prev);
            if (b.runs.length) {
                blocks.push(b);
                prev = { block: b, lastBaseline: cur.lines[cur.lines.length - 1].baseline };
            }
            cur = null;
        };

        for (const ln of lines) {
            if (!cur) { cur = { lines: [ln] }; continue; }
            const p = cur.lines[cur.lines.length - 1];
            const gap = ln.baseline - p.baseline;
            const sameSize = Math.abs(ln.size - p.size) < 0.8;
            const prevShort = p.x1 < box.right - Math.max(SHORT_LINE * p.size, 6) || !modal.justified;
            const prevFull = p.x1 >= box.right - Math.max(SHORT_LINE * p.size, 6);
            // Hanging indent daftar ("b.  " selebar ~1,6 em) bukan kolom baru.
            const indentJump = ln.x0 > Math.min(...cur.lines.map((l) => l.x0)) + ln.size * 2.2;
            const endsSentence = /[.:;!?)\]]$/.test(p.text.trim());
            const startsList = /^\s*([\u2022\u25cf\u25aa\u25e6\-–—]|\d{1,3}[.)]|[a-z][.)])\s/.test(ln.text);
            const bigGap = gap > modal.leading * PARA_GAP;
            const sameColumn = ln.cells.length <= 1 && p.cells.length <= 1;
            // Baris formulir sesudah baris pendek ("Lamp : -" lalu
            // "Perihal : ...") bukan lanjutan kalimat meski jaraknya rapat.
            const startsField = !prevFull && /^[A-Z][A-Za-z./ ]{1,20}\s*:/.test(ln.text);
            // Blok yang turun kembali ke kolom kiri (mis. "Tembusan Yth;"
            // sesudah blok tanda tangan di kanan) bukan lanjutan baris.
            const columnBack = ln.x0 < Math.min(...cur.lines.map((l) => l.x0)) - Math.max(ln.size * 6, 8);

            let cont = sameSize && gap > 0 && gap <= modal.leading * PARA_GAP && !startsList;
            if (cont) {
                // Baris yang jelas pendek menutup paragraf; baris penuh berarti
                // teks terpotong oleh lebar kolom dan lanjut. Baris berkolom
                // (tab) selalu menjadi paragraf sendiri walau penuh.
                if (prevFull) cont = sameColumn && !indentJump;
                else if (modal.justified) cont = false;
                else cont = !indentJump && !endsSentence && sameColumn;
            }
            if (bigGap) cont = false;
            if (cont && startsField) cont = false;
            if (cont && columnBack) cont = false;

            if (cont) cur.lines.push(ln);
            else { flush(); cur = { lines: [ln] }; }
        }
        flush();
        return blocks;
    }

    // ───────────────────────── Halaman ─────────────────────────

    // Sisa glyph font simbol (tanpa ToUnicode) muncul sebagai satu-dua karakter
    // acak dan bukan isi dokumen; jangan sampai menggeser tata letak.
    const ARTIFACT_CHARS = /^[`^$#@~]+$/;
    const isRealLine = (ln) =>
        !(ln.spans.length === 1 && ln.text.trim().length <= 2 && ARTIFACT_CHARS.test(ln.text.trim()));

    // ───────────────────────── Footer halaman ─────────────────────────

    /**
     * Stempel tanda tangan elektronik selalu dicetak di dasar setiap halaman
     * dan bukan bagian alur teks. Baris identik di dasar mayoritas halaman
     * diangkat menjadi footer Word supaya tidak memakan ruang isi.
     */
    P2D.pageFooter = function (layouts) {
        if (layouts.length < 2) return null;
        const found = new Map();
        for (const layout of layouts) {
            const limit = layout.H * 0.9;
            for (const ln of layout.lines) {
                if (ln.top < limit) continue;
                const t = ln.text.trim();
                if (!t) continue;
                const rec = found.get(t) || { pages: new Set(), lines: [] };
                rec.pages.add(layout.page);
                rec.lines.push(ln);
                found.set(t, rec);
            }
        }
        const need = Math.max(2, Math.ceil(layouts.length * 0.6));
        const texts = [...found].filter(([, r]) => r.pages.size >= need).map(([t]) => t);
        if (!texts.length) return null;

        const wanted = new Set(texts);
        const host = layouts.find((l) => texts.every((t) => l.lines.some((ln) => ln.text.trim() === t)));
        const lines = (host ? host.lines : found.get(texts[0]).lines)
            .filter((ln) => wanted.has(ln.text.trim()))
            .sort((a, b) => a.baseline - b.baseline);

        const runs = [];
        const ds = [];
        for (let i = 0; i < lines.length; i++) {
            if (i) {
                runs.push({ type: 'break' });
                ds.push(lines[i].baseline - lines[i - 1].baseline);
            }
            let prevSpan = null;
            for (const s of lines[i].spans) {
                if (prevSpan && wordGap(prevSpan, s)) {
                    runs.push({ type: 'text', text: ' ', size: s.size, family: s.family, bold: false, italic: false, color: '#000000', rise: 0, charSpacing: 0 });
                }
                runs.push(Object.assign({ type: 'text' }, runOf(s)));
                prevSpan = s;
            }
        }
        const size = Math.max(...lines.map((l) => l.size));
        return {
            runs,
            texts: wanted,
            text: texts.join(' ').replace(/\s+/g, ' ').trim(),
            linePt: Math.max(modeOf(ds, 0.5) || 0, size * 1.2),
            x0: Math.min(...lines.map((l) => l.x0)),
            x1: Math.max(...lines.map((l) => l.x1)),
            top: Math.min(...lines.map((l) => l.top)),
            bottom: Math.max(...lines.map((l) => l.bottom)),
        };
    };

    /**
     * Susun blok dari baris: tabel pada posisinya, sisanya jadi paragraf,
     * gambar ditempel sesuai koordinat vertikalnya.
     */
    function composeBlocks(lines, box, modal, tables, images) {
        const tableByLine = new Map();
        for (const t of tables) {
            t.emitted = false;
            const tl = [...t.lines];
            t.firstBaseline = tl.length ? Math.min(...tl.map((l) => l.baseline)) : null;
            t.lastBaseline = tl.length ? Math.max(...tl.map((l) => l.baseline)) : null;
            for (const ln of t.lines) tableByLine.set(ln, t);
        }
        const blocks = [];
        let pending = [];
        const flush = () => {
            if (!pending.length) return;
            for (const p of buildBlocks(pending, box, modal)) blocks.push(p);
            pending = [];
        };
        for (const ln of lines) {
            const t = tableByLine.get(ln);
            if (!t) { pending.push(ln); continue; }
            flush();
            if (!t.emitted) { t.emitted = true; blocks.push(t); }
        }
        flush();
        for (const img of images) blocks.push({ type: 'image', y0: img.y0, y1: img.y1, img });
        blocks.sort((a, b) => a.y0 - b.y0);
        // Gambar Word melayang, jadi ruang di bawahnya tidak otomatis dipesan.
        // Paragraf sesudah gambar (mis. nama di bawah QR tanda tangan) butuh
        // jarak sebelum sebesar posisi aslinya, melebihi batas jarak antarbaris.
        let lastText = null;
        let imageSince = false;
        let prevBlock = null;
        for (const b of blocks) {
            if (b.type === 'image') { imageSince = true; prevBlock = b; continue; }
            if (b.type === 'table') {
                // Baris kosong antara paragraf dan tabel (mis. sebelum daftar
                // tim penguji) tidak terbaca sebagai baris teks, jadi jaraknya
                // dipindahkan ke spasi sesudah paragraf.
                if (prevBlock && prevBlock.type === 'p' && b.firstBaseline != null
                    && prevBlock.lastBaseline != null) {
                    const raw = b.firstBaseline - prevBlock.lastBaseline - modal.leading;
                    if (raw > 0.5) prevBlock.fmt.after = Math.min(raw, modal.leading * 6);
                }
                imageSince = false;
                lastText = null;
                prevBlock = b;
                continue;
            }
            if (imageSince && lastText && b.firstBaseline != null) {
                const raw = b.firstBaseline - lastText.lastBaseline - modal.leading;
                if (raw > b.fmt.before) b.fmt.before = Math.min(raw, modal.leading * 8);
            } else if (prevBlock && prevBlock.type === 'table' && b.firstBaseline != null
                && prevBlock.lastBaseline != null) {
                // Paragraf sesudah tabel: jarak baris kosong di sumber ikut
                // dipesan agar tabel tidak menempel pada teks berikutnya.
                const raw = b.firstBaseline - prevBlock.lastBaseline - modal.leading;
                if (raw > b.fmt.before) b.fmt.before = Math.min(raw, modal.leading * 6);
            }
            imageSince = false;
            lastText = b;
            prevBlock = b;
        }
        return blocks;
    }

    /** Buang paragraf yang isinya semata baris footer yang sudah diangkat. */
    P2D.dropFooter = function (layout, footer) {
        const norm = (t) => t.replace(/\s+/g, ' ').trim();
        const lines = layout.lines.filter((ln) => !footer.texts.has(norm(ln.text)));
        if (!lines.length) return;
        layout.lines = lines;
        // Stempel yang lebih lebar dari isi sempat melebarkan kotak halaman;
        // margin section dihitung ulang dari baris isi saja. Batas bawah area
        // teks adalah puncak footer, bukan baris isi terakhir: halaman yang
        // isinya pendek tetap punya ruang sampai atas stempel.
        const box = pageBox(lines, { W: layout.W, H: layout.H });
        const floor = Math.min(layout.H, footer.top - 2);
        if (floor > box.bottom) box.bottom = floor;
        const modal = modalStats(lines, box);
        layout.box = box;
        layout.modal = modal;
        // Paragraf disusun ulang terhadap kotak final: indentasi yang dihitung
        // dari kotak lama akan menggeser seluruh isi terhadap margin section.
        layout.blocks = composeBlocks(lines, box, modal, layout.tables || [], layout.images || []);
    };

    /**
     * Model tata letak satu halaman:
     * { W, H, box, modal, divider, blocks[] }
     * blocks: paragraf (type 'p'), tabel (type 'table'), gambar (type 'image').
     */
    P2D.layoutPage = function (pg) {
        const rawLines = groupLines(pg.spans).filter(isRealLine);
        const box = pageBox(rawLines, pg);
        const modal = modalStats(rawLines, box);
        const div = dividerOf(rawLines, box);
        const lines = readingOrder(rawLines, div);

        const borders = P2D.bordersOf(pg.shapes);
        const fills = P2D.fillsOf(pg.shapes);
        const tables = detectTables(borders, fills, box);

        const used = new Set();
        tables.forEach((t) => fillTableText(t, lines, used));

        for (const t of tables) {
            t.lines = new Set();
            for (const ln of lines) {
                if (ln.spans.every((s) => used.has(s))) t.lines.add(ln);
            }
        }

        // Gambar ditempatkan sebagai blok tersendiri pada posisi vertikalnya.
        const images = pg.images.filter((img) =>
            !(img.alpha != null && img.alpha < 0.05) && img.w >= 4 && img.h >= 4);

        const blocks = composeBlocks(lines, box, modal, tables, images);

        return {
            W: pg.W, H: pg.H, rotate: pg.rotate, box, modal, divider: div, blocks, lines,
            tables, images, page: pg.page,
        };
    };
})();
