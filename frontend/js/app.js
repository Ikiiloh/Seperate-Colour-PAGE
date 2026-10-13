/**
 * NoPDF - app shell: hash router + home screen.
 * Tools live in js/tools/*.js and register themselves through SP.register().
 */
(function () {
    'use strict';

    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
    }

    const CATEGORIES = [
        { id: 'all', name: 'Semua' },
        { id: 'organize', name: 'Atur & Susun' },
        { id: 'optimize', name: 'Optimalkan' },
        { id: 'to-pdf', name: 'Ke PDF' },
        { id: 'from-pdf', name: 'Dari PDF' },
        { id: 'edit', name: 'Edit' },
    ];
    const BASE_TITLE = 'NoPDF - Alat PDF Gratis, 100% di Browser';
    const app = document.getElementById('app');
    let currentId = null;

    function toolCard(t) {
        const isLong = Boolean(t.desc && t.desc.length > 58);
        const a = SP.h(`
            <a class="tool-card skeuo-card hue-${t.hue || 'blue'} ${t.featured ? 'has-flag' : ''}" href="#/${t.id}">
                ${t.featured ? '<span class="tool-flag">Unggulan</span>' : ''}
                <div class="tool-icon"><i class="fa-solid ${t.icon}"></i></div>
                <div class="tool-text">
                    <div class="tool-title-row">
                        <h3></h3>
                        <span class="tool-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
                    </div>
                    <div class="tool-desc-wrap">
                        <p class="tool-desc"></p>
                        ${isLong ? '<button type="button" class="see-more-btn" aria-label="Lihat selengkapnya">Selengkapnya <i class="fa-solid fa-chevron-down"></i></button>' : ''}
                    </div>
                </div>
            </a>`);
        a.querySelector('h3').textContent = t.title;
        a.querySelector('.tool-desc').textContent = t.desc;

        if (isLong) {
            const btn = a.querySelector('.see-more-btn');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const expanded = a.classList.toggle('is-expanded');
                btn.innerHTML = expanded
                    ? 'Tutup <i class="fa-solid fa-chevron-up"></i>'
                    : 'Selengkapnya <i class="fa-solid fa-chevron-down"></i>';
                btn.setAttribute('aria-label', expanded ? 'Tutup penjelasan' : 'Lihat selengkapnya');
            });
        }
        return a;
    }

    function renderHome() {
        document.title = BASE_TITLE;
        app.innerHTML = '';
        const hero = SP.h(`
            <section class="hero-section">
                <h1 class="hero-title skeuo-embossed-text">Kumpulan Alat PDF, <span class="highlight-gold-text">Gratis & Private</span></h1>
                <p class="hero-subtitle">Gabung, pisah, kompres, putar, dan ubah PDF langsung di browser. File tidak pernah meninggalkan perangkatmu.</p>
                <div class="search-box skeuo-inset-input">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" id="toolSearch" placeholder="Cari alat… (mis. gabung, kompres, watermark)" autocomplete="off" aria-label="Cari alat">
                </div>
            </section>`);
        const chips = SP.h('<div class="chip-row" role="tablist"></div>');
        const grid = SP.h('<section class="tool-grid" aria-live="polite"></section>');
        app.append(hero, chips, grid);

        let cat = 'all';
        let q = '';
        const draw = () => {
            chips.innerHTML = '';
            CATEGORIES.forEach((c) => {
                const b = SP.h(`<button type="button" class="chip ${c.id === cat ? 'active' : ''}"></button>`);
                b.textContent = c.name;
                b.addEventListener('click', () => { cat = c.id; draw(); });
                chips.appendChild(b);
            });
            grid.innerHTML = '';
            const needle = q.trim().toLowerCase();
            const list = SP.tools
                .filter((t) => cat === 'all' || t.category === cat)
                .filter((t) => !needle || `${t.title} ${t.desc} ${t.keywords || ''}`.toLowerCase().includes(needle))
                .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
            list.forEach((t) => grid.appendChild(toolCard(t)));
            if (!list.length) grid.appendChild(SP.h('<p class="empty-note">Tidak ada alat yang cocok dengan pencarian.</p>'));
        };
        hero.querySelector('#toolSearch').addEventListener('input', (e) => { q = e.target.value; draw(); });
        draw();

        const trust = SP.h(`
            <section class="trust-row">
                <div><i class="fa-solid fa-shield-halved"></i><strong>Privasi penuh</strong><span>Diproses di perangkatmu, tidak ada upload ke server.</span></div>
                <div><i class="fa-solid fa-bolt"></i><strong>Cepat & gratis</strong><span>Tanpa login, tanpa watermark, tanpa batas harian.</span></div>
                <div><i class="fa-solid fa-wifi"></i><strong>Tetap jalan offline</strong><span>Semua library disertakan, tidak perlu koneksi setelah dimuat.</span></div>
            </section>`);
        app.appendChild(trust);
    }

    function renderTool(tool) {
        document.title = `${tool.title} - NoPDF`;
        app.innerHTML = '';
        const head = SP.h(`
            <section class="tool-head hue-${tool.hue || 'blue'}">
                <a href="#/" class="back-link"><i class="fa-solid fa-arrow-left"></i> Semua alat</a>
                <div class="tool-head-main">
                    <div class="tool-icon"><i class="fa-solid ${tool.icon}"></i></div>
                    <div><h1 class="skeuo-embossed-text"></h1><p></p></div>
                </div>
            </section>`);
        head.querySelector('h1').textContent = tool.title;
        head.querySelector('p').textContent = tool.desc;
        const root = SP.h('<div class="tool-root"></div>');
        app.append(head, root);

        const ctx = { reset: () => renderTool(tool) };
        SP.runCleanups();
        SP.thumb.reset();
        try {
            tool.mount(root, ctx);
        } catch (e) {
            console.error(e);
            root.innerHTML = '';
            root.appendChild(SP.h('<div class="skeuo-card"><p class="err">Alat gagal dimuat. Muat ulang halaman dan coba lagi.</p></div>'));
        }
        window.scrollTo({ top: 0 });
    }

    function route() {
        const id = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim();
        SP.runCleanups();
        SP.thumb.reset();
        SP.busy.hide();
        const tool = SP.tools.find((t) => t.id === id);
        currentId = tool ? tool.id : null;
        if (tool) renderTool(tool); else renderHome();
    }

    window.addEventListener('hashchange', route);
    document.addEventListener('DOMContentLoaded', route);
})();
