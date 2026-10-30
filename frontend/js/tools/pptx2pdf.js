/**
 * NoPDF - PowerPoint (.pptx) ke PDF
 *
 * Membaca OOXML langsung dari file .pptx (JSZip + DOMParser), merender tiap
 * slide menjadi HTML, lalu mengekspornya ke PDF lewat html2canvas + pdf-lib.
 * 100% lokal di browser: file tidak pernah dikirim ke server.
 */
(function () {
    'use strict';

    const EMU_PER_PX = 9525; // 914400 EMU/inci / 96 px/inci
    const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const DEFAULT_SIZE = { cx: 12192000, cy: 6858000 };
    const DEFAULT_INSET = { l: 91440, t: 45720, r: 91440, b: 45720 };

    // ---------------------------------------------------------------- XML
    const kids = (el, name) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
    const kid = (el, name) => kids(el, name)[0] || null;
    const deep = (el, name) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
    const deepOne = (el, name) => deep(el, name)[0] || null;
    const num = (v, d) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : d;
    };
    const intAttr = (el, name, d) => (el ? num(el.getAttribute(name), d) : d);
    const strAttr = (el, name, d) => (el && el.getAttribute(name) != null ? el.getAttribute(name) : d);
    const relId = (el) => (el ? (el.getAttributeNS(R_NS, 'id') || el.getAttribute('r:id') || '') : '');
    const embedId = (el) => (el ? (el.getAttributeNS(R_NS, 'embed') || el.getAttribute('r:embed') || el.getAttributeNS(R_NS, 'link') || el.getAttribute('r:link') || '') : '');
    const px = (emu) => emu / EMU_PER_PX;
    const pt = (emu) => emu / 12700;

    function parseXml(text) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (!doc || doc.getElementsByTagName('parsererror').length) {
            throw new Error('Struktur XML di dalam file tidak valid.');
        }
        return doc;
    }

    function dirOf(path) {
        const i = path.lastIndexOf('/');
        return i < 0 ? '' : path.slice(0, i);
    }

    function resolvePath(baseDir, target) {
        if (!target) return '';
        if (target[0] === '/') return target.slice(1);
        const out = baseDir ? baseDir.split('/') : [];
        for (const seg of target.split('/')) {
            if (!seg || seg === '.') continue;
            if (seg === '..') out.pop();
            else out.push(seg);
        }
        return out.join('/');
    }

    function relsPath(part) {
        const name = part.slice(part.lastIndexOf('/') + 1);
        const dir = dirOf(part);
        return (dir ? dir + '/' : '') + '_rels/' + name + '.rels';
    }

    // --------------------------------------------------------------- warna
    const PRST = {
        black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#00FF00', blue: '#0000FF',
        yellow: '#FFFF00', gray: '#808080', grey: '#808080', orange: '#FFA500', purple: '#800080',
    };

    function rgbOf(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length !== 6) return [0, 0, 0];
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    function hslOf(rgb) {
        const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return [h / 6, s, l];
    }

    function rgbFromHsl(hsl) {
        const [h, s, l] = hsl;
        if (s === 0) {
            const v = Math.round(l * 255);
            return [v, v, v];
        }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const f = (t) => {
            let x = t;
            if (x < 0) x += 1;
            if (x > 1) x -= 1;
            if (x < 1 / 6) return p + (q - p) * 6 * x;
            if (x < 1 / 2) return q;
            if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
            return p;
        };
        return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
    }

    const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    function colorHexOf(el) {
        if (!el) return null;
        const tag = el.localName;
        if (tag === 'srgbClr') return '#' + strAttr(el, 'val', '000000');
        if (tag === 'sysClr') return '#' + strAttr(el, 'lastClr', '000000');
        if (tag === 'prstClr') return PRST[strAttr(el, 'val', 'black')] || '#000000';
        return null;
    }

    function resolveColor(el, props, fallback) {
        if (!el) return fallback;
        let hex = colorHexOf(el);
        if (el.localName === 'schemeClr') {
            let v = strAttr(el, 'val', '');
            if (props.clrMap && props.clrMap[v]) v = props.clrMap[v];
            hex = props.theme.colors[v] || props.theme.colors[v.replace(/\d+$/, '')] || null;
        }
        if (!hex) return fallback;
        let rgb = rgbOf(hex);
        let alpha = 1;
        for (const mod of Array.from(el.children)) {
            const v = num(mod.getAttribute('val'), 0);
            if (mod.localName === 'alpha') alpha = clamp01(v / 100000);
            else if (mod.localName === 'lumMod') {
                const hsl = hslOf(rgb);
                hsl[2] = clamp01(hsl[2] * (v / 100000));
                rgb = rgbFromHsl(hsl);
            } else if (mod.localName === 'lumOff') {
                const hsl = hslOf(rgb);
                hsl[2] = clamp01(hsl[2] + v / 100000);
                rgb = rgbFromHsl(hsl);
            } else if (mod.localName === 'shade') {
                rgb = rgb.map((c) => clamp255(c * (v / 100000)));
            } else if (mod.localName === 'tint') {
                rgb = rgb.map((c) => clamp255(c + (255 - c) * (1 - v / 100000)));
            }
        }
        if (alpha < 1) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    function fillOf(container, props) {
        if (!container) return null;
        for (const type of ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill']) {
            const node = kid(container, type);
            if (!node) continue;
            if (type === 'noFill') return { css: 'transparent' };
            if (type === 'solidFill') {
                return { css: resolveColor(node.children[0], props, 'transparent') };
            }
            if (type === 'gradFill') {
                const stops = deep(node, 'gs').map((g) => {
                    const color = resolveColor(g.children[0], props, '#000000');
                    return `${color} ${num(g.getAttribute('pos'), 0) / 1000}%`;
                });
                if (!stops.length) return { css: 'transparent' };
                const lin = deepOne(node, 'lin');
                const angle = lin ? num(lin.getAttribute('ang'), 0) / 60000 + 90 : 90;
                return { css: `linear-gradient(${angle.toFixed(1)}deg, ${stops.join(', ')})` };
            }
            if (type === 'blipFill') {
                const blip = deepOne(node, 'blip');
                const url = props.img(embedId(blip));
                return url ? { css: null, img: url } : null;
            }
        }
        return null;
    }

    function applyFill(el, container, props) {
        const fill = fillOf(container, props);
        if (!fill) return;
        if (fill.img) {
            const img = new Image();
            img.src = fill.img;
            img.draggable = false;
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
            el.appendChild(img);
        } else if (fill.css && fill.css !== 'transparent') {
            el.style.background = fill.css;
        }
    }

    function lineStyleOf(spPr, props) {
        const ln = kid(spPr, 'ln');
        if (!ln) return null;
        if (kid(ln, 'noFill')) return null;
        const fill = fillOf(ln, props);
        const width = Math.max(1, px(intAttr(ln, 'w', 12700)));
        const css = fill && fill.css && fill.css !== 'transparent' ? fill.css : 'rgba(0, 0, 0, 0.7)';
        const dash = kid(ln, 'prstDash');
        const style = dash ? (strAttr(dash, 'val', 'solid') === 'solid' ? 'solid' : 'dashed') : 'solid';
        return { width, css, style };
    }

    // ------------------------------------------------------------- geometri
    function readXfrm(container, outer) {
        if (!container) return null;
        const xfrm = deepOne(container, 'xfrm');
        if (!xfrm) return null;
        const off = kid(xfrm, 'off');
        const ext = kid(xfrm, 'ext');
        if (!off || !ext) return null;
        const sx = outer ? outer.sx : 1;
        const sy = outer ? outer.sy : 1;
        const tx = outer ? outer.tx : 0;
        const ty = outer ? outer.ty : 0;
        return {
            x: tx + intAttr(off, 'x', 0) * sx,
            y: ty + intAttr(off, 'y', 0) * sy,
            cx: intAttr(ext, 'cx', 0) * sx,
            cy: intAttr(ext, 'cy', 0) * sy,
            rot: intAttr(xfrm, 'rot', 0),
            flipH: strAttr(xfrm, 'flipH', '0') === '1',
            flipV: strAttr(xfrm, 'flipV', '0') === '1',
        };
    }

    function place(el, g) {
        el.style.left = px(g.x) + 'px';
        el.style.top = px(g.y) + 'px';
        el.style.width = Math.max(0.5, px(g.cx)) + 'px';
        el.style.height = Math.max(0.5, px(g.cy)) + 'px';
        if (g.rot) {
            el.style.transform = `rotate(${g.rot / 60000}deg)`;
            el.style.transformOrigin = 'center center';
        }
    }

    function placeholderOf(node) {
        const ph = deepOne(node, 'ph');
        if (!ph) return null;
        return { el: ph, type: strAttr(ph, 'type', ''), idx: ph.getAttribute('idx') };
    }

    function matchPlaceholder(shapes, ph) {
        if (!ph) return null;
        const list = (shapes || []).filter((s) => s.localName === 'sp');
        if (ph.idx != null) {
            const byIdx = list.find((s) => {
                const p = placeholderOf(s);
                return p && p.idx === ph.idx;
            });
            if (byIdx) return byIdx;
        }
        if (ph.type) {
            const byType = list.find((s) => {
                const p = placeholderOf(s);
                return p && p.type === ph.type;
            });
            if (byType) return byType;
        }
        if (!ph.type && ph.idx == null) {
            return list.find((s) => {
                const p = placeholderOf(s);
                return p && (p.type === 'title' || p.type === 'ctrTitle');
            }) || null;
        }
        return null;
    }

    function shapeXfrm(sp, opts) {
        const own = readXfrm(kid(sp, 'spPr'), opts.xf);
        if (own) return own;
        const ph = placeholderOf(sp);
        if (!ph) return null;
        for (const list of opts.inherit || []) {
            const match = matchPlaceholder(list, ph);
            if (!match) continue;
            const g = readXfrm(kid(match, 'spPr'), opts.xf);
            if (g) return g;
        }
        return null;
    }

    // ----------------------------------------------------------------- teks
    function txBodyLvl(txBody, lvl) {
        if (!txBody) return null;
        const lst = kid(txBody, 'lstStyle');
        return lst ? kid(lst, `lvl${lvl + 1}pPr`) : null;
    }

    function masterStyleOf(masterDoc, kind) {
        const styles = masterDoc ? deepOne(masterDoc, 'txStyles') : null;
        return styles ? kid(styles, kind) : null;
    }

    function pick(chain, getter) {
        for (const node of chain) {
            if (!node) continue;
            const v = getter(node);
            if (v !== undefined && v !== null) return v;
        }
        return undefined;
    }

    function runProps(chain, opts) {
        const defs = chain.map((n) => (n ? kid(n, 'defRPr') : null));
        return defs;
    }

    function fontFaceOf(rPr, defs, title, theme) {
        let face = '';
        for (const node of [rPr].concat(defs)) {
            const latin = node ? kid(node, 'latin') : null;
            if (latin) {
                face = strAttr(latin, 'typeface', '');
                if (face) break;
            }
        }
        if (!face || face[0] === '+') {
            if (face && face.indexOf('+mj') === 0) face = theme.major;
            else if (face && face.indexOf('+mn') === 0) face = theme.minor;
            else face = title ? theme.major : theme.minor;
        }
        return face || 'Calibri';
    }

    function runStyle(rPr, defs, opts, title) {
        const chainProps = [rPr].concat(defs);
        const sz = pick(chainProps, (n) => (n.getAttribute('sz') != null ? num(n.getAttribute('sz'), null) : undefined));
        const bold = pick(chainProps, (n) => (n.getAttribute('b') != null ? n.getAttribute('b') === '1' : undefined));
        const italic = pick(chainProps, (n) => (n.getAttribute('i') != null ? n.getAttribute('i') === '1' : undefined));
        const underline = pick(chainProps, (n) => (n.getAttribute('u') != null ? n.getAttribute('u') !== 'none' : undefined));
        const strike = pick(chainProps, (n) => (n.getAttribute('strike') != null ? n.getAttribute('strike') !== 'noStrike' : undefined));
        const baseline = pick(chainProps, (n) => (n.getAttribute('baseline') != null ? num(n.getAttribute('baseline'), 0) : undefined));
        const colorEl = pick(chainProps, (n) => kid(n, 'solidFill') || undefined);
        const face = fontFaceOf(rPr, defs, title, opts.theme);
        return {
            sizePt: sz != null ? sz / 100 : (title ? 32 : 18),
            bold: bold === true,
            italic: italic === true,
            underline: underline === true,
            strike: strike === true,
            baseline: baseline || 0,
            color: colorEl ? resolveColor(colorEl.children[0], opts, opts.textColor) : opts.textColor,
            face,
        };
    }

    function renderTextBody(txBody, sp, opts) {
        const wrap = document.createElement('div');
        wrap.className = 'ppt-tx';
        const bodyChain = [kid(txBody, 'bodyPr')];
        if (sp) {
            const ph = placeholderOf(sp);
            if (ph) {
                for (const list of opts.inherit || []) {
                    const match = matchPlaceholder(list, ph);
                    if (match) {
                        const tb = kid(match, 'txBody');
                        if (tb) bodyChain.push(kid(tb, 'bodyPr'));
                    }
                }
            }
        }
        const bodyVal = (name, fallback) => {
            const v = pick(bodyChain, (n) => (n.getAttribute(name) != null ? n.getAttribute(name) : undefined));
            return v !== undefined ? v : fallback;
        };
        const inset = (name, d) => px(num(bodyVal(name, null), d));
        const l = inset('lIns', DEFAULT_INSET.l);
        const t = inset('tIns', DEFAULT_INSET.t);
        const r = inset('rIns', DEFAULT_INSET.r);
        const b = inset('bIns', DEFAULT_INSET.b);
        const anchor = bodyVal('anchor', 't');
        wrap.style.padding = `${t}px ${r}px ${b}px ${l}px`;
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.justifyContent = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';

        const bodyPr = kid(txBody, 'bodyPr');
        const norm = bodyPr ? kid(bodyPr, 'normAutofit') : null;
        const scale = norm ? intAttr(norm, 'fontScale', 100000) / 100000 : 1;

        const ph = sp ? placeholderOf(sp) : null;
        const isSlideNumber = ph && ph.type === 'sldNum';
        const matchedLayout = ph ? matchPlaceholder(opts.layoutShapes, ph) : null;
        const matchedMaster = ph ? matchPlaceholder(opts.masterShapes, ph) : null;
        const kind = ph
            ? (/^(title|ctrTitle)$/.test(ph.type) ? 'titleStyle' : 'bodyStyle')
            : 'otherStyle';
        const styleRoot = masterStyleOf(opts.masterDoc, kind);
        const title = kind === 'titleStyle';

        const counters = {};
        for (const p of kids(txBody, 'p')) {
            wrap.appendChild(renderParagraph(p, {
                opts,
                title,
                noBullet: isSlideNumber,
                styleRoot,
                layoutSp: matchedLayout,
                masterSp: matchedMaster,
                scale,
                counters,
            }));
        }
        return wrap;
    }

    function renderParagraph(p, ctx) {
        const own = kid(p, 'pPr');
        const lvl = Math.max(0, Math.min(8, intAttr(own, 'lvl', 0)));
        const layoutPPr = ctx.layoutSp ? txBodyLvl(kid(ctx.layoutSp, 'txBody'), lvl) : null;
        const masterPPr = ctx.masterSp ? txBodyLvl(kid(ctx.masterSp, 'txBody'), lvl) : null;
        const stylePPr = ctx.styleRoot ? kid(ctx.styleRoot, `lvl${lvl + 1}pPr`) : null;
        const chain = [own, layoutPPr, masterPPr, stylePPr];
        const opts = ctx.opts;

        const pEl = document.createElement('div');
        pEl.className = 'ppt-p';

        const algn = pick(chain, (n) => (n.getAttribute('algn') != null ? n.getAttribute('algn') : undefined)) || 'l';
        pEl.style.textAlign = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left';

        const marL = pick(chain, (n) => (n.getAttribute('marL') != null ? num(n.getAttribute('marL'), 0) : undefined)) || 0;
        const indent = pick(chain, (n) => (n.getAttribute('indent') != null ? num(n.getAttribute('indent'), 0) : undefined)) || 0;

        const bullet = pick(chain, (n) => {
            if (kid(n, 'buNone')) return { none: true };
            const ch = kid(n, 'buChar');
            if (ch) return { char: strAttr(ch, 'char', '•') };
            const an = kid(n, 'buAutoNum');
            if (an) return { auto: strAttr(an, 'type', 'arabicPeriod') };
            return undefined;
        });

        const lnSpc = pick(chain, (n) => {
            const ls = kid(n, 'lnSpc');
            if (!ls) return undefined;
            const pctNode = kid(ls, 'spcPct');
            if (pctNode) return { pct: num(pctNode.getAttribute('val'), 100000) / 100000 };
            const ptsNode = kid(ls, 'spcPts');
            if (ptsNode) return { pts: num(ptsNode.getAttribute('val'), 0) / 100 };
            return undefined;
        }) || { pct: 1 };

        const before = pick(chain, (n) => {
            const s = kid(n, 'spcBef');
            if (!s) return undefined;
            const pts = kid(s, 'spcPts');
            return pts ? num(pts.getAttribute('val'), 0) / 100 : undefined;
        }) || 0;
        const after = pick(chain, (n) => {
            const s = kid(n, 'spcAft');
            if (!s) return undefined;
            const pts = kid(s, 'spcPts');
            return pts ? num(pts.getAttribute('val'), 0) / 100 : undefined;
        }) || 0;

        pEl.style.marginTop = toPxPt(before) + 'px';
        pEl.style.marginBottom = toPxPt(after) + 'px';
        pEl.style.lineHeight = lnSpc.pts ? toPxPt(lnSpc.pts) + 'px' : String(1.2 * (lnSpc.pct || 1));

        const hasBullet = bullet && !bullet.none && !ctx.noBullet;
        if (ctx.noBullet) {
            pEl.style.marginLeft = '0';
            pEl.style.textIndent = '0';
        } else if (hasBullet) {
            const hang = Math.max(228600, -indent);
            pEl.style.marginLeft = px(marL + indent) + 'px';
            pEl.style.textIndent = '0';
            const mark = document.createElement('span');
            mark.className = 'ppt-bullet';
            mark.style.display = 'inline-block';
            mark.style.width = px(hang) + 'px';
            mark.style.textIndent = '0';
            if (bullet.auto) {
                const n = (ctx.counters[lvl] = (ctx.counters[lvl] || 0) + 1);
                mark.textContent = n + '.';
            } else {
                mark.textContent = bullet.char;
            }
            pEl.appendChild(mark);
        } else {
            pEl.style.marginLeft = px(marL) + 'px';
            pEl.style.textIndent = px(indent) + 'px';
        }

        const defs = runProps(chain, opts);
        let hasContent = false;
        for (const node of Array.from(p.children)) {
            if (node.localName === 'r' || node.localName === 'fld') {
                const rPr = kid(node, 'rPr');
                const style = runStyle(rPr, defs, opts, ctx.title);
                const span = document.createElement('span');
                span.style.fontSize = (style.sizePt * (96 / 72) * ctx.scale).toFixed(2) + 'px';
                span.style.fontWeight = style.bold ? '700' : '400';
                span.style.fontStyle = style.italic ? 'italic' : 'normal';
                span.style.color = style.color;
                span.style.fontFamily = `"${style.face}", "Segoe UI", Arial, sans-serif`;
                const deco = [];
                if (style.underline) deco.push('underline');
                if (style.strike) deco.push('line-through');
                span.style.textDecoration = deco.length ? deco.join(' ') : 'none';
                if (style.baseline > 0) span.style.verticalAlign = 'super';
                else if (style.baseline < 0) span.style.verticalAlign = 'sub';
                let text = '';
                const t = kid(node, 't');
                if (node.localName === 'fld') {
                    const type = strAttr(node, 'type', '');
                    if (type === 'slidenum') text = String(opts.slideNumber || 1);
                    else text = t ? t.textContent : '';
                } else {
                    text = t ? t.textContent : '';
                }
                span.textContent = text;
                if (text) hasContent = true;
                pEl.appendChild(span);
            } else if (node.localName === 'br') {
                pEl.appendChild(document.createElement('br'));
                hasContent = true;
            }
        }

        if (!hasContent) {
            const end = kid(p, 'endParaRPr');
            const style = runStyle(end, defs, opts, ctx.title);
            pEl.style.minHeight = (style.sizePt * (96 / 72) * ctx.scale * 1.2).toFixed(2) + 'px';
        }
        return pEl;
    }

    function toPxPt(points) {
        return points * (96 / 72);
    }

    // --------------------------------------------------------------- bentuk
    function renderSp(sp, opts, xf) {
        const ph = placeholderOf(sp);
        if (opts.skipPlaceholders && ph) {
            const isNum = ph.type === 'sldNum' && opts.slideNumber != null;
            if (!isNum) return null;
        }
        const spPr = kid(sp, 'spPr');
        const g = shapeXfrm(sp, Object.assign({}, opts, { xf }));
        if (!g) return null;

        const prstGeom = spPr ? deepOne(spPr, 'prstGeom') : null;
        const prst = prstGeom ? strAttr(prstGeom, 'prst', 'rect') : 'rect';

        if (prst === 'line' || prst === 'straightConnector1') {
            return renderLine(g, spPr, opts);
        }

        const el = document.createElement('div');
        el.className = 'ppt-shape';
        place(el, g);
        applyFill(el, spPr, opts);
        if (prst === 'ellipse') {
            el.style.borderRadius = '50%';
        } else if (prst === 'roundRect') {
            const gd = prstGeom ? deepOne(prstGeom, 'gd') : null;
            const m = gd ? /val\s+(-?\d+)/.exec(strAttr(gd, 'fmla', '')) : null;
            const adj = m ? clamp01(Math.abs(parseFloat(m[1])) / 100000) : 0.16667;
            el.style.borderRadius = px(Math.min(g.cx, g.cy) * adj) + 'px';
        }

        const line = lineStyleOf(spPr, opts);
        if (line) el.style.border = `${line.width}px ${line.style} ${line.css}`;

        const txBody = kid(sp, 'txBody');
        if (txBody) {
            el.style.overflow = 'hidden';
            el.appendChild(renderTextBody(txBody, sp, opts));
        }
        return el;
    }

    function renderLine(g, spPr, opts) {
        const line = lineStyleOf(spPr, opts);
        const width = line ? line.width : 1;
        const color = line ? line.css : 'rgba(0, 0, 0, 0.65)';
        const sx = g.flipH ? -1 : 1;
        const sy = g.flipV ? -1 : 1;
        const x0 = g.x + (g.flipH ? g.cx : 0);
        const y0 = g.y + (g.flipV ? g.cy : 0);
        const dx = sx * g.cx;
        const dy = sy * g.cy;
        const len = Math.hypot(dx, dy) || Math.max(g.cx, g.cy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + g.rot / 60000;

        const el = document.createElement('div');
        el.className = 'ppt-shape';
        el.style.left = px(x0) + 'px';
        el.style.top = px(y0) - width / 2 + 'px';
        el.style.width = px(len) + 'px';
        el.style.height = width + 'px';
        el.style.background = color;
        el.style.transformOrigin = '0 50%';
        el.style.transform = `rotate(${angle}deg)`;
        if (line && line.style !== 'solid') {
            el.style.background = `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`;
        }
        return el;
    }

    function renderPic(pic, opts, xf) {
        const spPr = kid(pic, 'spPr');
        const g = readXfrm(spPr, xf);
        if (!g) return null;
        const blip = deepOne(pic, 'blip');
        const url = opts.img(embedId(blip));
        if (!url) return null;

        const el = document.createElement('div');
        el.className = 'ppt-shape';
        place(el, g);
        el.style.overflow = 'hidden';

        const img = new Image();
        img.src = url;
        img.draggable = false;
        img.style.position = 'absolute';
        const srcRect = deepOne(pic, 'srcRect');
        if (srcRect) {
            const lf = intAttr(srcRect, 'l', 0) / 100000;
            const tf = intAttr(srcRect, 't', 0) / 100000;
            const rf = intAttr(srcRect, 'r', 0) / 100000;
            const bf = intAttr(srcRect, 'b', 0) / 100000;
            const wf = Math.max(0.01, 1 - lf - rf);
            const hf = Math.max(0.01, 1 - tf - bf);
            img.style.width = (100 / wf) + '%';
            img.style.height = (100 / hf) + '%';
            img.style.left = (-lf / wf) * 100 + '%';
            img.style.top = (-tf / hf) * 100 + '%';
        } else {
            img.style.width = '100%';
            img.style.height = '100%';
        }
        img.style.objectFit = 'fill';
        el.appendChild(img);

        const line = lineStyleOf(spPr, opts);
        if (line) el.style.border = `${line.width}px ${line.style} ${line.css}`;
        return el;
    }

    function renderGroup(grp, opts, xf) {
        const gPr = kid(grp, 'grpSpPr') || kid(grp, 'spPr');
        const x = gPr ? deepOne(gPr, 'xfrm') : null;
        let childXf = xf || null;
        if (x) {
            const off = kid(x, 'off');
            const ext = kid(x, 'ext');
            const chOff = kid(x, 'chOff');
            const chExt = kid(x, 'chExt');
            if (off && ext && chOff && chExt) {
                const cw = Math.max(1, intAttr(chExt, 'cx', 1));
                const ch = Math.max(1, intAttr(chExt, 'cy', 1));
                const sx = intAttr(ext, 'cx', cw) / cw;
                const sy = intAttr(ext, 'cy', ch) / ch;
                const ox = intAttr(off, 'x', 0);
                const oy = intAttr(off, 'y', 0);
                const cox = intAttr(chOff, 'x', 0);
                const coy = intAttr(chOff, 'y', 0);
                const px0 = xf ? xf.tx : 0;
                const py0 = xf ? xf.ty : 0;
                const psx = xf ? xf.sx : 1;
                const psy = xf ? xf.sy : 1;
                childXf = {
                    sx: sx * psx,
                    sy: sy * psy,
                    tx: px0 + ox * psx - cox * sx * psx,
                    ty: py0 + oy * psy - coy * sy * psy,
                };
            }
        }
        const box = document.createElement('div');
        box.className = 'ppt-group';
        for (const node of Array.from(grp.children)) {
            const el = renderNode(node, opts, childXf);
            if (el) box.appendChild(el);
        }
        return box;
    }

    // ---------------------------------------------------------------- tabel
    function renderTable(frame, opts, xf) {
        const tbl = deepOne(frame, 'tbl');
        if (!tbl) return null;
        const g = readXfrm(frame, xf);
        if (!g) return null;

        const el = document.createElement('div');
        el.className = 'ppt-shape';
        place(el, g);
        el.style.overflow = 'hidden';

        const grid = kid(tbl, 'tblGrid');
        const cols = kids(grid, 'gridCol').map((c) => px(intAttr(c, 'w', 100000)));
        const rows = kids(tbl, 'tr');

        const table = document.createElement('table');
        table.className = 'ppt-table';
        table.style.width = '100%';
        const colgroup = document.createElement('colgroup');
        const totalW = cols.reduce((a, b) => a + b, 0) || 1;
        for (const w of cols) {
            const cg = document.createElement('col');
            cg.style.width = (w / totalW) * 100 + '%';
            colgroup.appendChild(cg);
        }
        table.appendChild(colgroup);

        const covered = {};
        rows.forEach((tr, ri) => {
            const trEl = document.createElement('tr');
            trEl.style.height = px(intAttr(tr, 'h', 0)) + 'px';
            let ci = 0;
            for (const tc of kids(tr, 'tc')) {
                while (covered[ri + '_' + ci]) ci++;
                const tcPr = kid(tc, 'tcPr');
                const cs = Math.max(1, intAttr(tcPr, 'gridSpan', 1));
                const rs = Math.max(1, intAttr(tcPr, 'rowSpan', 1));
                for (let r = 0; r < rs; r++) {
                    for (let c = 0; c < cs; c++) covered[(ri + r) + '_' + (ci + c)] = true;
                }
                const td = document.createElement('td');
                td.colSpan = cs;
                td.rowSpan = rs;
                td.style.padding = [
                    px(intAttr(tcPr, 'marT', 45720)),
                    px(intAttr(tcPr, 'marR', 91440)),
                    px(intAttr(tcPr, 'marB', 45720)),
                    px(intAttr(tcPr, 'marL', 91440)),
                ].map((v) => v.toFixed(1) + 'px').join(' ');
                const anchor = strAttr(tcPr, 'anchor', 't');
                td.style.verticalAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';

                const fill = fillOf(tcPr, opts);
                if (fill && fill.css && fill.css !== 'transparent') td.style.background = fill.css;

                for (const [tag, prop] of [['lnL', 'borderLeft'], ['lnR', 'borderRight'], ['lnT', 'borderTop'], ['lnB', 'borderBottom']]) {
                    const ln = tcPr ? kid(tcPr, tag) : null;
                    if (ln) {
                        const f = fillOf(ln, opts);
                        const w = Math.max(1, Math.round(px(intAttr(ln, 'w', 12700))));
                        td.style[prop] = `${w}px solid ${f && f.css && f.css !== 'transparent' ? f.css : 'transparent'}`;
                    } else {
                        td.style[prop] = '1px solid #c9ced6';
                    }
                }

                const txBody = kid(tc, 'txBody');
                if (txBody) {
                    const tb = renderTextBody(txBody, null, opts);
                    tb.style.height = '100%';
                    td.appendChild(tb);
                }
                trEl.appendChild(td);
                ci += cs;
            }
            table.appendChild(trEl);
        });

        el.appendChild(table);
        return el;
    }

    // -------------------------------------------------------------- render
    function renderNode(node, opts, xf) {
        const tag = node.localName;
        if (tag === 'sp') return renderSp(node, opts, xf);
        if (tag === 'cxnSp') {
            const g = shapeXfrm(node, Object.assign({}, opts, { xf }));
            return g ? renderLine(g, kid(node, 'spPr'), opts) : null;
        }
        if (tag === 'pic') return renderPic(node, opts, xf);
        if (tag === 'grpSp') return renderGroup(node, opts, xf);
        if (tag === 'graphicFrame') {
            const uri = deepOne(node, 'graphicData');
            const type = uri ? strAttr(uri, 'uri', '') : '';
            if (/\/table$/.test(type)) return renderTable(node, opts, xf);
            if (/\/chart$/.test(type)) opts.counters.chart++;
            else if (/\/diagram$/.test(type)) opts.counters.diagram++;
            else if (/\/media$/.test(type)) opts.counters.media++;
            return null;
        }
        if (tag === 'contentPart') return null;
        return null;
    }

    function shapeTreeOf(doc) {
        const tree = doc ? deepOne(doc, 'spTree') : null;
        return tree ? Array.from(tree.children).filter((c) => ['sp', 'pic', 'grpSp', 'graphicFrame', 'cxnSp'].includes(c.localName)) : [];
    }

    // -------------------------------------------------------------- loader
    async function openDeck(file, onProgress) {
        if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum termuat.');
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const xmlCache = new Map();
        const docCache = new Map();
        const relsCache = new Map();
        const themeCache = new Map();
        const imgCache = new Map();
        const counters = { chart: 0, diagram: 0, media: 0 };

        async function textOf(path) {
            if (xmlCache.has(path)) return xmlCache.get(path);
            const entry = zip.file(path);
            const text = entry ? await entry.async('string') : null;
            xmlCache.set(path, text);
            return text;
        }

        async function xmlOf(path) {
            if (docCache.has(path)) return docCache.get(path);
            const text = await textOf(path);
            const doc = text ? parseXml(text) : null;
            docCache.set(path, doc);
            return doc;
        }

        async function relsOf(path) {
            if (relsCache.has(path)) return relsCache.get(path);
            const text = await textOf(relsPath(path));
            const map = {};
            if (text) {
                for (const rel of deep(parseXml(text), 'Relationship')) {
                    map[rel.getAttribute('Id')] = {
                        target: rel.getAttribute('Target'),
                        type: rel.getAttribute('Type') || '',
                    };
                }
            }
            relsCache.set(path, map);
            return map;
        }

        async function imageUrl(path) {
            if (imgCache.has(path)) return imgCache.get(path);
            const entry = zip.file(path);
            if (!entry) {
                imgCache.set(path, null);
                return null;
            }
            const bytes = await entry.async('uint8array');
            const ext = path.split('.').pop().toLowerCase();
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                : ext === 'gif' ? 'image/gif'
                    : ext === 'svg' ? 'image/svg+xml'
                        : ext === 'webp' ? 'image/webp'
                            : 'image/png';
            const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
            imgCache.set(path, url);
            SP.onCleanup(() => URL.revokeObjectURL(url));
            return url;
        }

        async function themeOf(path) {
            if (themeCache.has(path)) return themeCache.get(path);
            const doc = await xmlOf(path);
            const scheme = doc ? deepOne(doc, 'clrScheme') : null;
            const colors = {};
            if (scheme) {
                for (const slot of Array.from(scheme.children)) {
                    const colorEl = slot.children[0];
                    if (colorEl) colors[slot.localName] = colorHexOf(colorEl);
                }
            }
            const fonts = doc ? deepOne(doc, 'fontScheme') : null;
            const faceOf = (node) => {
                const latin = node ? kid(node, 'latin') : null;
                return latin ? strAttr(latin, 'typeface', '') : '';
            };
            const theme = {
                colors,
                major: faceOf(fonts ? kid(fonts, 'majorFont') : null) || 'Calibri Light',
                minor: faceOf(fonts ? kid(fonts, 'minorFont') : null) || 'Calibri',
            };
            themeCache.set(path, theme);
            return theme;
        }

        function imageResolver(partPath, rels) {
            const base = dirOf(partPath);
            return (rid) => {
                const target = rels[rid] && rels[rid].target;
                if (!target) return null;
                return imgCache.get(resolvePath(base, target)) || null;
            };
        }

        async function preloadImages(doc, partPath, rels) {
            if (!doc) return;
            const base = dirOf(partPath);
            for (const blip of deep(doc, 'blip')) {
                const target = rels[embedId(blip)] && rels[embedId(blip)].target;
                if (target) await imageUrl(resolvePath(base, target));
            }
        }

        const pres = await xmlOf('ppt/presentation.xml');
        if (!pres) {
            throw new Error('File bukan presentasi PowerPoint (.pptx) yang valid.');
        }
        const presRels = await relsOf('ppt/presentation.xml');
        const szNode = deepOne(pres, 'sldSz');
        const size = {
            cx: intAttr(szNode, 'cx', DEFAULT_SIZE.cx),
            cy: intAttr(szNode, 'cy', DEFAULT_SIZE.cy),
        };

        const slidePaths = kids(deepOne(pres, 'sldIdLst'), 'sldId')
            .map((n) => {
                const rel = presRels[relId(n)];
                return rel ? resolvePath('ppt', rel.target) : null;
            })
            .filter(Boolean);
        if (!slidePaths.length) throw new Error('Presentasi tidak memiliki slide.');

        const W = px(size.cx);
        const H = px(size.cy);

        async function slideModel(slidePath, index) {
            const slideDoc = await xmlOf(slidePath);
            const slideRels = await relsOf(slidePath);
            const layoutRel = Object.values(slideRels).find((r) => /\/slideLayout$/.test(r.type));
            const layoutPath = layoutRel ? resolvePath(dirOf(slidePath), layoutRel.target) : null;
            const layoutDoc = layoutPath ? await xmlOf(layoutPath) : null;
            const layoutRels = layoutPath ? await relsOf(layoutPath) : {};
            const masterRel = Object.values(layoutRels).find((r) => /\/slideMaster$/.test(r.type));
            const masterPath = masterRel ? resolvePath(dirOf(layoutPath), masterRel.target) : 'ppt/slideMasters/slideMaster1.xml';
            const masterDoc = await xmlOf(masterPath);
            const masterRels = await relsOf(masterPath);
            const themeRel = Object.values(masterRels).find((r) => /\/theme$/.test(r.type));
            const themePath = themeRel ? resolvePath(dirOf(masterPath), themeRel.target) : 'ppt/theme/theme1.xml';
            const theme = await themeOf(themePath);

            await preloadImages(slideDoc, slidePath, slideRels);
            await preloadImages(layoutDoc, layoutPath, layoutRels);
            await preloadImages(masterDoc, masterPath, masterRels);

            const clrMap = {};
            const clrMapNode = deepOne(masterDoc, 'clrMap');
            if (clrMapNode) {
                for (const a of Array.from(clrMapNode.attributes)) clrMap[a.name] = a.value;
            }

            const baseProps = {
                theme,
                clrMap,
                counters,
                slideNumber: index + 1,
            };
            const slideProps = Object.assign({}, baseProps, {
                img: imageResolver(slidePath, slideRels),
                layoutShapes: shapeTreeOf(layoutDoc),
                masterShapes: shapeTreeOf(masterDoc),
                masterDoc,
                inherit: [shapeTreeOf(layoutDoc), shapeTreeOf(masterDoc)],
                textColor: theme.colors[clrMap.tx1 || 'dk1'] || '#000000',
            });

            const root = document.createElement('div');
            root.className = 'ppt-slide';
            root.style.width = W + 'px';
            root.style.height = H + 'px';

            // Latar slide (slide -> layout -> master).
            let bg = null;
            for (const part of [
                { doc: slideDoc, props: slideProps, path: slidePath, rels: slideRels },
                { doc: layoutDoc, props: Object.assign({}, baseProps, { img: imageResolver(layoutPath, layoutRels) }), path: layoutPath, rels: layoutRels },
                { doc: masterDoc, props: Object.assign({}, baseProps, { img: imageResolver(masterPath, masterRels) }), path: masterPath, rels: masterRels },
            ]) {
                if (!part.doc) continue;
                const bgNode = deepOne(part.doc, 'bg');
                const bgPr = bgNode ? kid(bgNode, 'bgPr') : null;
                if (!bgPr) continue;
                bg = fillOf(bgPr, part.props);
                if (bg) break;
            }
            if (bg && bg.img) {
                const img = new Image();
                img.src = bg.img;
                img.draggable = false;
                img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
                root.appendChild(img);
            } else if (bg && bg.css && bg.css !== 'transparent') {
                root.style.background = bg.css;
            } else {
                root.style.background = '#ffffff';
            }

            const drawTree = (doc, props, opts) => {
                for (const node of shapeTreeOf(doc)) {
                    const el = renderNode(node, Object.assign({}, props, opts), null);
                    if (el) root.appendChild(el);
                }
            };

            const masterShapes = shapeTreeOf(masterDoc);
            const layoutShapes = shapeTreeOf(layoutDoc);
            const hasSlideNumber = (list) => list.some((s) => {
                const p = placeholderOf(s);
                return p && p.type === 'sldNum';
            });
            const numOnSlide = hasSlideNumber(shapeTreeOf(slideDoc));
            const numOnLayout = hasSlideNumber(layoutShapes);
            const masterNumber = !numOnSlide && !numOnLayout ? index + 1 : null;
            const layoutNumber = !numOnSlide && numOnLayout ? index + 1 : null;

            const layoutProps = Object.assign({}, baseProps, {
                img: imageResolver(layoutPath, layoutRels),
                masterShapes,
                masterDoc,
                inherit: [masterShapes],
                textColor: slideProps.textColor,
            });
            const masterProps = Object.assign({}, baseProps, {
                img: imageResolver(masterPath, masterRels),
                masterDoc,
                inherit: [],
                textColor: slideProps.textColor,
            });

            drawTree(masterDoc, masterProps, {
                skipPlaceholders: true,
                slideNumber: masterNumber,
                layoutShapes: [],
                masterShapes,
            });
            if (layoutDoc) {
                drawTree(layoutDoc, layoutProps, {
                    skipPlaceholders: true,
                    slideNumber: layoutNumber,
                    layoutShapes: [],
                    masterShapes,
                });
            }
            drawTree(slideDoc, slideProps, {
                skipPlaceholders: false,
                layoutShapes: slideProps.layoutShapes,
                masterShapes: slideProps.masterShapes,
            });

            return root;
        }

        const slides = [];
        for (let i = 0; i < slidePaths.length; i++) {
            if (onProgress) onProgress(i, slidePaths.length);
            slides.push(await slideModel(slidePaths[i], i));
            await SP.tick();
        }

        return { size, slides, counters, W, H };
    }

    // ------------------------------------------------------------------ UI
    function mountPpt2Pdf(root, ctx) {
        root.innerHTML = '';
        const stage = SP.h('<div></div>');
        root.appendChild(stage);

        const drop = SP.dropzone({
            accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
            multiple: false,
            icon: 'fa-file-powerpoint',
            title: 'Tarik & lepaskan file PowerPoint (.pptx) di sini',
            spec: 'Format .pptx | Diproses 100% lokal & offline di browsermu',
            filter: (f) => /\.pptx$/i.test(f.name),
            onFiles: (files) => init(files[0]),
        });
        stage.appendChild(drop);

        async function init(file) {
            stage.innerHTML = '';

            const bar = SP.h(`
                <div class="file-bar skeuo-inset-panel">
                    <i class="fa-solid fa-file-powerpoint file-bar-icon powerpoint"></i>
                    <div class="file-bar-info">
                        <strong class="file-bar-name"></strong>
                        <small></small>
                    </div>
                    <button type="button" class="skeuo-btn-sm"><i class="fa-solid fa-rotate"></i> Ganti file</button>
                </div>`);
            bar.querySelector('strong').textContent = file.name;
            bar.querySelector('small').textContent = `${SP.fmtSize(file.size)} • Presentasi Microsoft PowerPoint`;
            bar.querySelector('button').addEventListener('click', ctx.reset);
            stage.appendChild(bar);

            const panel = SP.h(`
                <div class="skeuo-card tool-options">
                    <div class="opt-grid two">
                        <div class="field">
                            <label>Kualitas Render</label>
                            <select class="text-input" id="pptQuality">
                                <option value="2" selected>Tajam (2x - Rekomendasi)</option>
                                <option value="3">Ultra (3x - file lebih besar)</option>
                                <option value="1.5">Standar (1.5x - lebih cepat)</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Ukuran Halaman PDF</label>
                            <select class="text-input" id="pptPageSize">
                                <option value="slide" selected>Ikuti ukuran slide (16:9 / 4:3)</option>
                                <option value="a4">A4 Lanskap (slide di tengah)</option>
                            </select>
                        </div>
                    </div>
                    <p class="opt-hint"><i class="fa-solid fa-circle-info"></i> Setiap slide menjadi satu halaman PDF. Animasi, video, grafik, dan SmartArt tidak ikut karena PDF bersifat statis.</p>
                </div>`);
            stage.appendChild(panel);

            const previewCard = SP.h(`
                <div class="skeuo-card office-preview-card">
                    <div class="office-preview-header">
                        <span><i class="fa-solid fa-eye"></i> Pratinjau Slide</span>
                        <span class="preview-badge" id="pptCount">Memuat...</span>
                    </div>
                    <div class="office-preview-scroll" id="pptPreview">
                        <div class="office-loading"><i class="fa-solid fa-spinner fa-spin"></i> Membaca slide...</div>
                    </div>
                </div>`);
            stage.appendChild(previewCard);

            const container = previewCard.querySelector('#pptPreview');
            const badge = previewCard.querySelector('#pptCount');

            const action = SP.actionBar({
                label: 'Konversi ke PDF',
                icon: 'fa-file-pdf',
                onClick: process,
            });
            action.setDisabled(true);
            action.setSummary('Membaca presentasi...');
            stage.appendChild(action.el);

            let deck = null;
            try {
                deck = await openDeck(file, (i, total) => {
                    const loading = container.querySelector('.office-loading');
                    if (loading) loading.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Merender slide ${Math.min(i + 1, total)} dari ${total}...`;
                });
                container.innerHTML = '';
                const frameW = Math.max(260, Math.min(680, (container.clientWidth || 720) - 48));
                const scale = Math.min(1, frameW / deck.W);
                for (const slideEl of deck.slides) {
                    const frame = document.createElement('div');
                    frame.className = 'ppt-slide-frame';
                    frame.style.width = deck.W * scale + 'px';
                    frame.style.height = deck.H * scale + 'px';
                    slideEl.style.transform = `scale(${scale})`;
                    slideEl.style.transformOrigin = '0 0';
                    frame.appendChild(slideEl);
                    container.appendChild(frame);
                }
                badge.textContent = `${deck.slides.length} slide`;
                action.setSummary(`<b>${deck.slides.length} slide</b> • Siap dikonversi`);
                action.setDisabled(false);
            } catch (err) {
                console.error(err);
                const raw = String((err && err.message) || '');
                const message = /zip|central directory|corrupt|encrypt|password/i.test(raw)
                    ? 'File tidak dapat dibaca. Pastikan berkas .pptx valid, tidak rusak, dan tidak terkunci kata sandi.'
                    : raw || 'File tidak dapat dibaca.';
                container.innerHTML = `<p class="err"><i class="fa-solid fa-triangle-exclamation"></i> ${SP.esc(message)}</p>`;
                badge.textContent = 'Gagal';
                action.setSummary('<span class="err">Presentasi tidak dapat dibaca</span>');
                return;
            }

            async function process() {
                const quality = parseFloat(panel.querySelector('#pptQuality').value) || 2;
                const pageMode = panel.querySelector('#pptPageSize').value;

                const out = await SP.run('Mengonversi PowerPoint ke PDF...', async (progress) => {
                    if (typeof PDFLib === 'undefined') throw new Error('Library PDFLib belum termuat.');
                    if (typeof html2canvas === 'undefined') throw new Error('Library html2canvas belum termuat.');

                    const pdf = await PDFLib.PDFDocument.create();
                    const total = deck.slides.length;
                    const Wpt = pt(deck.size.cx);
                    const Hpt = pt(deck.size.cy);

                    for (let i = 0; i < total; i++) {
                        progress((i / total) * 92, `Merender slide ${i + 1} dari ${total}...`);

                        const holder = document.createElement('div');
                        holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${deck.W}px;height:${deck.H}px;background:#fff;pointer-events:none;`;
                        const clone = deck.slides[i].cloneNode(true);
                        clone.style.transform = 'none';
                        clone.style.width = deck.W + 'px';
                        clone.style.height = deck.H + 'px';
                        holder.appendChild(clone);
                        document.body.appendChild(holder);

                        let canvas;
                        try {
                            canvas = await html2canvas(holder, {
                                scale: quality,
                                backgroundColor: '#ffffff',
                                logging: false,
                                useCORS: true,
                                width: deck.W,
                                height: deck.H,
                            });
                        } finally {
                            holder.remove();
                        }

                        if (!canvas || !canvas.width || !canvas.height) {
                            throw new Error(`Gagal merender slide ${i + 1}.`);
                        }

                        const blob = await SP.canvasToBlob(canvas, 'image/png');
                        SP.freeCanvas(canvas);
                        const img = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));

                        if (pageMode === 'a4') {
                            const pw = 841.89;
                            const ph = 595.28;
                            const page = pdf.addPage([pw, ph]);
                            const scale = Math.min(pw / Wpt, ph / Hpt);
                            const dw = Wpt * scale;
                            const dh = Hpt * scale;
                            page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
                        } else {
                            const page = pdf.addPage([Wpt, Hpt]);
                            page.drawImage(img, { x: 0, y: 0, width: Wpt, height: Hpt });
                        }
                        await SP.tick();
                    }

                    progress(96, 'Menyusun PDF...');
                    return pdf.save();
                });

                if (!out || !out.length) return;

                stage.innerHTML = '';
                const lines = [
                    `Presentasi <b>"${SP.esc(file.name)}"</b> berhasil diubah menjadi PDF (${deck.slides.length} halaman).`,
                    `Diproses langsung di browser secara aman & private.`,
                ];
                const skipped = deck.counters.chart + deck.counters.diagram + deck.counters.media;
                if (skipped) {
                    lines.push(`${skipped} objek grafik/SmartArt/media dilewati karena PDF bersifat statis.`);
                }
                stage.appendChild(SP.resultCard({
                    blob: SP.pdfBlob(out),
                    filename: `${SP.baseName(file.name)}.pdf`,
                    lines,
                    onAgain: ctx.reset,
                }));
            }
        }
    }

    SP.register({
        id: 'ppt2pdf',
        category: 'to-pdf',
        icon: 'fa-file-powerpoint',
        hue: 'red',
        title: 'PowerPoint ke PDF',
        desc: 'Ubah presentasi PowerPoint (.pptx) menjadi PDF dengan tata letak, teks, gambar, dan tabel asli.',
        keywords: 'powerpoint ppt pptx presentasi slide deck convert ubah ke pdf',
        mount: mountPpt2Pdf,
    });
})();
