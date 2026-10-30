/**
 * PDF -> Word: penulis OOXML.
 *
 * Merangkai model tata letak menjadi .docx (Office Open XML) tanpa pustaka
 * pihak ketiga: document.xml, styles.xml, relationships, dan media gambar.
 * Satu section Word per halaman PDF, dengan margin dan ukuran kertas yang
 * diambil dari area teks asli.
 */
(function () {
    'use strict';

    const P2D = (window.P2D = window.P2D || {});

    const NS = {
        w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
        a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
        pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    };
    const REL = {
        office: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
        styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
        image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        link: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
        footer: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer',
    };
    const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

    const dxa = (pt) => Math.round(pt * 20);
    const emu = (pt) => Math.round(pt * 12700);

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
    ));
    const escAttr = esc;

    // ───────────────────────── Gaya dasar ─────────────────────────

    function stylesXml(defaultFont) {
        const f = escAttr(defaultFont);
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${NS.w}">
 <w:docDefaults>
  <w:rPrDefault><w:rPr>
   <w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>
   <w:sz w:val="22"/><w:szCs w:val="22"/>
   <w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>
  </w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
 </w:docDefaults>
 <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
 <w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style>
 <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:outlineLvl w:val="2"/></w:pPr></w:style>
 <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
 <w:style w:type="paragraph" w:styleId="TableParagraph"><w:name w:val="Table Paragraph"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
 <w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>
  <w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
    }

    // ───────────────────────── Run & paragraf ─────────────────────────

    const URL_RE = /^(https?:\/\/|mailto:|ftp:\/\/|www\.)[^\s]+$/i;
    const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const isLink = (t) => URL_RE.test(t) || MAIL_RE.test(t);

    function runXml(run, ctx) {
        if (run.type === 'tab') return '<w:r><w:tab/></w:r>';
        if (run.type === 'break') return '<w:r><w:br/></w:r>';
        const size = Math.max(2, Math.round(run.size * 2));
        const fam = escAttr(run.family || ctx.font);
        let rPr = `<w:rPr>${run.linked ? '<w:rStyle w:val="Hyperlink"/>' : ''}<w:rFonts w:ascii="${fam}" w:hAnsi="${fam}" w:cs="${fam}"/>`;
        if (run.bold) rPr += '<w:b/><w:bCs/>';
        if (run.italic) rPr += '<w:i/><w:iCs/>';
        if (run.color && run.color.toUpperCase() !== '#000000') rPr += `<w:color w:val="${run.color.slice(1).toUpperCase()}"/>`;
        rPr += `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`;
        if (run.charSpacing) rPr += `<w:spacing w:val="${Math.round(run.charSpacing * 20)}"/>`;
        if (run.rise) rPr += `<w:vertAlign w:val="${run.rise > 0 ? 'superscript' : 'subscript'}"/>`;
        rPr += '</w:rPr>';
        return `<w:r>${rPr}<w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
    }

    function runsXml(runs, ctx) {
        let out = '';
        for (const run of runs) {
            if (run.type !== 'text') { out += runXml(run, ctx); continue; }
            const t = run.text;
            if (t && !ctx.noLinks && isLink(t.trim())) {
                const target = t.trim();
                const id = ctx.addLink(target.startsWith('www.') ? 'http://' + target : target);
                out += `<w:hyperlink r:id="${id}">${runXml(Object.assign({}, run, { linked: true }), ctx)}</w:hyperlink>`;
            } else {
                out += runXml(run, ctx);
            }
        }
        return out;
    }

    function paragraphXml(block, ctx, sect) {
        const f = block.fmt;
        const style = f.heading ? `Heading${Math.min(3, f.heading)}` : (f.isList ? 'ListParagraph' : 'BodyText');

        let pPr = `<w:pPr><w:pStyle w:val="${style}"/>`;
        if (f.heading) pPr += '<w:keepNext/>';
        if (f.tabs && f.tabs.length) {
            pPr += '<w:tabs>' + f.tabs.map((p) => `<w:tab w:val="${p.right ? 'right' : 'left'}" w:pos="${dxa(p.pos)}"/>`).join('') + '</w:tabs>';
        }
        const line = f.linePt ? dxa(f.linePt) : 240;
        pPr += `<w:spacing w:before="${dxa(f.before)}" w:after="${dxa(f.after || 0)}" w:line="${line}" w:lineRule="${f.linePt ? 'exact' : 'auto'}"/>`;
        let ind = '';
        if (f.left > 0.5) ind += ` w:left="${dxa(f.left)}"`;
        if (f.right > 0.5) ind += ` w:right="${dxa(f.right)}"`;
        if (f.firstLine > 0.5) ind += ` w:firstLine="${dxa(f.firstLine)}"`;
        if (f.hanging > 0.5) ind += ` w:hanging="${dxa(f.hanging)}"`;
        if (ind) pPr += `<w:ind${ind}/>`;
        if (f.jc && f.jc !== 'left') pPr += `<w:jc w:val="${f.jc}"/>`;
        if (f.heading) pPr += `<w:outlineLvl w:val="${Math.min(3, f.heading) - 1}"/>`;
        if (sect) pPr += sect;
        pPr += '</w:pPr>';

        return `<w:p>${pPr}${runsXml(block.runs, ctx)}</w:p>`;
    }

    // ───────────────────────── Tabel ─────────────────────────

    function borderXml(t, color) {
        const sz = Math.max(4, Math.min(48, Math.round(t * 8)));
        return `<w:top w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/><w:left w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/><w:bottom w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/><w:right w:val="single" w:sz="${sz}" w:space="0" w:color="${color}"/>`;
    }

    function cellParagraph(spans, ctx) {
        if (!spans.length) return '<w:p><w:pPr><w:pStyle w:val="TableParagraph"/></w:pPr></w:p>';
        let runs = '';
        let prev = null;
        for (const s of spans) {
            if (prev && s.baseline - prev.baseline > s.size * 0.6) {
                runs += '<w:r><w:br/></w:r>';
            } else if (prev && s.x0 - prev.x1 > s.size * 0.2) {
                runs += '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
            }
            runs += runXml({
                type: 'text', text: s.text, size: s.size,
                family: s.family, bold: s.bold, italic: s.italic,
                color: s.color, rise: s.risePt, charSpacing: s.charSpacingPt,
            }, ctx);
            prev = s;
        }
        const ind = spans.length ? Math.max(0, Math.round((spans[0].x0 - spans[0].cellX0 || 0) * 20)) : 0;
        const pPr = `<w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${ind ? `<w:ind w:left="${ind}"/>` : ''}</w:pPr>`;
        return `<w:p>${pPr}${runs}</w:p>`;
    }

    function tableXml(tbl, ctx, box) {
        const widths = [];
        for (let i = 0; i + 1 < tbl.cols.length; i++) widths.push(tbl.cols[i + 1] - tbl.cols[i]);
        const total = widths.reduce((a, b) => a + b, 0);
        const color = (tbl.borders.color || '#000000').slice(1).toUpperCase();

        let x = '<w:tbl><w:tblPr>';
        x += `<w:tblW w:w="${dxa(total)}" w:type="dxa"/>`;
        x += `<w:tblInd w:w="${Math.max(0, dxa(tbl.x0 - box.left))}" w:type="dxa"/>`;
        x += `<w:tblBorders>${borderXml(tbl.borders.t, color)}</w:tblBorders>`;
        x += '<w:tblLayout w:type="fixed"/>';
        x += '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>';
        x += '<w:tblLook w:val="01E0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
        x += '</w:tblPr><w:tblGrid>';
        x += widths.map((w) => `<w:gridCol w:w="${dxa(w)}"/>`).join('');
        x += '</w:tblGrid>';

        for (let ri = 0; ri < tbl.grid.length; ri++) {
            const row = tbl.grid[ri];
            const h = row.length ? row[0].y1 - row[0].y0 : 0;
            x += `<w:tr><w:trHeight w:val="${dxa(h)}" w:hRule="atLeast"/>`;
            for (let ci = 0; ci < row.length; ci++) {
                const cell = row[ci];
                let tcPr = `<w:tcW w:w="${dxa(widths[ci])}" w:type="dxa"/>`;
                tcPr += `<w:tcBorders>${borderXml(tbl.borders.t, color)}</w:tcBorders>`;
                if (cell.shade) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${cell.shade.slice(1).toUpperCase()}"/>`;
                tcPr += '<w:vAlign w:val="center"/>';
                const spans = cell.spans.map((s) => Object.assign({ cellX0: cell.x0 }, s));
                x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${cellParagraph(spans, ctx)}</w:tc>`;
            }
            x += '</w:tr>';
        }
        return x + '</w:tbl>';
    }

    // ───────────────────────── Gambar ─────────────────────────

    function drawingXml(img, relId, id, anchored, behind) {
        const cx = emu(img.w);
        const cy = emu(img.h);
        const graphic = `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}"><pic:pic xmlns:pic="${NS.pic}">`
            + `<pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
            + `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
            + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
            + `</pic:pic></a:graphicData></a:graphic>`;

        if (!anchored) {
            return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
                + `<wp:docPr id="${id}" name="Picture ${id}"/>`
                + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
                + graphic + '</wp:inline></w:drawing>';
        }
        return '<w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0"'
            + ` relativeHeight="${251658240 - id}" behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`
            + '<wp:simplePos x="0" y="0"/>'
            + `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(img.x0)}</wp:posOffset></wp:positionH>`
            + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(img.y0)}</wp:posOffset></wp:positionV>`
            + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
            + `<wp:docPr id="${id}" name="Picture ${id}"/>`
            + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
            + graphic + '</wp:anchor></w:drawing>';
    }

    function imageParagraph(img, relId, id, behind) {
        return '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr>'
            + `<w:r>${drawingXml(img, relId, id, true, behind)}</w:r></w:p>`;
    }

    // ───────────────────────── Section ─────────────────────────

    function sectXml(layout, top, bottom, frel, footerDist) {
        const left = Math.max(0, layout.box.left);
        const right = Math.max(0, layout.W - layout.box.right);
        const topM = Math.max(0, Math.min(top, layout.box.top));
        const botM = Math.max(0, Math.min(bottom, layout.H - layout.box.bottom));
        const header = Math.max(0, Math.min(720, dxa(topM) - 180));
        const footer = footerDist != null
            ? Math.max(0, Math.min(1440, dxa(footerDist)))
            : Math.max(0, Math.min(720, dxa(botM) - 180));
        const orient = layout.W > layout.H ? ' w:orient="landscape"' : '';
        const ref = frel ? `<w:footerReference w:type="default" r:id="${frel.id}"/>` : '';
        return `<w:sectPr>${ref}<w:pgSz w:w="${dxa(layout.W)}" w:h="${dxa(layout.H)}"${orient}/>`
            + `<w:pgMar w:top="${dxa(topM)}" w:right="${dxa(right)}" w:bottom="${dxa(botM)}" w:left="${dxa(left)}"`
            + ` w:header="${header}" w:footer="${footer}" w:gutter="0"/>`
            + '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';
    }

    /** Footer dokumen: stempel e-sign yang berulang di dasar halaman. */
    function footerXml(footer, ctx, shift) {
        const line = dxa(footer.linePt);
        // Stempel bisa lebih lebar/lebih kiri dari area teks; selisihnya
        // dikompensasi indentasi agar posisi dan pemenggalan sama.
        let ind = '';
        if (Math.abs(shift.left) > 0.5) ind += ` w:left="${dxa(shift.left)}"`;
        if (Math.abs(shift.right) > 0.5) ind += ` w:right="${-dxa(shift.right)}"`;
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}">`
            + `<w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:before="0" w:after="0" w:line="${line}" w:lineRule="exact"/>${ind ? `<w:ind${ind}/>` : ''}</w:pPr>`
            + `${runsXml(footer.runs, Object.assign({}, ctx, { noLinks: true }))}</w:p></w:ftr>`;
    }

    // ───────────────────────── Dokumen ─────────────────────────

    /**
     * @param {Array} layouts hasil P2D.layoutPage per halaman
     * @param {Object} opts { onProgress, title }
     * @returns {Promise<Blob>}
     */
    P2D.buildDocx = async function (layouts, opts = {}) {
        if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum termuat.');
        const onProgress = opts.onProgress || (() => {});

        // Stempel e-sign berulang di dasar halaman dipindah ke footer Word.
        const footer = P2D.pageFooter ? P2D.pageFooter(layouts) : null;
        if (footer) layouts.forEach((l) => P2D.dropFooter(l, footer));

        // 1. Kumpulkan media unik.
        const media = [];
        const files = [];
        const mediaByName = new Map();
        const rels = [];
        const addRel = (type, target, external) => {
            const id = 'rId' + (rels.length + 1);
            rels.push({ id, type, target, external: !!external });
            return id;
        };
        const stylesRel = addRel(REL.styles, 'styles.xml');

        // Satu footer per kombinasi geser kiri/kanan: tiap section punya margin
        // sendiri, sedangkan posisi stempel di halaman tetap.
        const footerParts = [];
        const footerRelFor = (layout) => {
            if (!footer) return null;
            const left = footer.x0 - layout.box.left;
            // Sedikit kelonggaran kanan: lebar stempel di PDF hampir persis
            // selebar area teks, sehingga pembulatan Word memecah baris.
            const right = footer.x1 - layout.box.right + 8;
            const key = `${Math.round(left * 2)}:${Math.round(right * 2)}`;
            let v = footerParts.find((f) => f.key === key);
            if (!v) {
                const n = footerParts.length + 1;
                v = { key, left, right, file: `footer${n}.xml`, id: addRel(REL.footer, `footer${n}.xml`) };
                footerParts.push(v);
            }
            return v;
        };
        const footerDist = footer ? layouts[0].H - footer.bottom : null;

        const imageJobs = [];
        for (const layout of layouts) {
            for (const b of layout.blocks) {
                if (b.type !== 'image' || !b.img.name) continue;
                if (!mediaByName.has(b.img.name)) {
                    const entry = { name: b.img.name, file: null, relId: null, data: null };
                    media.push(entry);
                    mediaByName.set(b.img.name, entry);
                    imageJobs.push(entry);
                }
            }
        }

        /** @param {ArrayBuffer|Uint8Array} buf */
        const hashOf = (buf) => {
            const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            let h = 0x811c9dc5;
            for (let i = 0; i < bytes.length; i++) {
                h ^= bytes[i];
                h = Math.imul(h, 0x01000193);
            }
            return (h >>> 0).toString(36) + ':' + bytes.length;
        };

        let done = 0;
        const byHash = new Map();
        for (const entry of imageJobs) {
            const layout = layouts.find((l) => l.blocks.some((b) => b.type === 'image' && b.img.name === entry.name));
            const png = await P2D.imageToPng(layout.page, entry.name);
            done++;
            onProgress(Math.round((done / Math.max(1, imageJobs.length)) * 35), 'Menyiapkan gambar...');
            await new Promise((r) => setTimeout(r, 0));
            if (!png || !png.buffer) continue;

            const key = hashOf(png.buffer);
            const dup = byHash.get(key);
            if (dup) { entry.relId = dup.relId; continue; }

            entry.file = `image${files.length + 1}.png`;
            entry.data = png.buffer;
            entry.relId = addRel(REL.image, `media/${entry.file}`);
            byHash.set(key, entry);
            files.push(entry);
        }

        // 2. Font default dokumen: keluarga paling banyak dipakai.
        const familyCount = new Map();
        for (const layout of layouts) {
            for (const b of layout.blocks) {
                if (b.type !== 'p') continue;
                for (const r of b.runs) {
                    if (r.type !== 'text' || !r.family) continue;
                    familyCount.set(r.family, (familyCount.get(r.family) || 0) + r.text.length);
                }
            }
        }
        let defFont = opts.defaultFont || 'Arial';
        let bestN = 0;
        for (const [f, n] of familyCount) if (n > bestN) { bestN = n; defFont = f; }

        // 3. Body.
        let picId = 1;
        const body = [];
        const ctx = {
            font: defFont,
            addLink: (target) => addRel(REL.link, target, true),
        };
        let tailSect = '';

        for (let pi = 0; pi < layouts.length; pi++) {
            const layout = layouts[pi];

            // Gambar berposisi absolut (relatif halaman), jadi margin tidak perlu
            // diperlebar: gambar boleh berada di area margin.
            const sect = sectXml(layout, layout.box.top, layout.box.bottom, footerRelFor(layout), footerDist);

            const parts = [];
            for (const block of layout.blocks) {
                if (block.type === 'p') parts.push({ y0: block.y0, xml: paragraphXml(block, ctx, null), text: true });
                else if (block.type === 'table') parts.push({ y0: block.y0, xml: tableXml(block, ctx, layout.box) });
                else if (block.type === 'image') {
                    const entry = mediaByName.get(block.img.name);
                    if (!entry || !entry.relId) continue;
                    // Gambar yang menimpa teks dijadikan latar agar tidak menggeser baris.
                    const overlaps = layout.lines.some((ln) =>
                        ln.x1 > block.img.x0 && ln.x0 < block.img.x1
                        && ln.baseline > block.img.y0 && ln.top < block.img.y1);
                    parts.push({ y0: block.y0, xml: imageParagraph(block.img, entry.relId, picId++, overlaps) });
                }
            }
            parts.sort((a, b) => a.y0 - b.y0);

            if (pi === layouts.length - 1) {
                // Section terakhir ditutup sectPr tingkat body; menaruhnya di
                // paragraf akan memicu halaman kosong penutup.
                tailSect = sect;
            } else {
                // Section berakhir di paragraf terakhir section itu. Paragraf
                // pembawa sectPr harus benar-benar terakhir dalam urutan
                // dokumen, termasuk setelah paragraf gambar, agar gambar tidak
                // berpindah ke halaman berikutnya.
                let carrier = -1;
                for (let k = parts.length - 1; k >= 0; k--) if (parts[k].text) { carrier = k; break; }
                if (carrier < 0) {
                    parts.push({ y0: 1e9, xml: `<w:p><w:pPr>${sect}</w:pPr></w:p>`, text: true });
                } else {
                    const last = parts.splice(carrier, 1)[0];
                    last.xml = last.xml.replace('</w:pPr>', sect + '</w:pPr>');
                    parts.push(last);
                }
            }
            for (const part of parts) body.push(part.xml);

            onProgress(35 + Math.round(((pi + 1) / layouts.length) * 50), `Menulis halaman ${pi + 1}...`);
            await new Promise((r) => setTimeout(r, 0));
        }

        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"><w:body>${body.join('')}${tailSect}</w:body></w:document>`;

        // 4. Paket.
        const zip = new JSZip();
        const exts = new Set(files.map(() => 'png'));
        let ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`;
        for (const ext of exts) ct += `<Default Extension="${ext}" ContentType="image/png"/>`;
        ct += `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`;
        ct += `<Default Extension="xml" ContentType="application/xml"/>`;
        ct += `<Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/>`;
        ct += `<Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/>`;
        for (const f of footerParts) ct += `<Override PartName="/word/${f.file}" ContentType="${CT}.footer+xml"/>`;
        ct += '</Types>';

        const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL.office}" Target="word/document.xml"/></Relationships>`;

        const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
            + rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${escAttr(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')
            + '</Relationships>';

        zip.file('[Content_Types].xml', ct);
        zip.file('_rels/.rels', rootRels);
        zip.file('word/document.xml', documentXml);
        zip.file('word/styles.xml', stylesXml(defFont));
        zip.file('word/_rels/document.xml.rels', docRels);
        for (const f of footerParts) zip.file(`word/${f.file}`, footerXml(footer, { font: defFont }, f));
        for (const m of files) zip.file(`word/media/${m.file}`, m.data);

        onProgress(90, 'Mengemas dokumen...');
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        onProgress(100, 'Selesai.');
        return blob;
    };
})();
