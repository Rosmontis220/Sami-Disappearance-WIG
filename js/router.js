/* 👁️我在看着你👁️ */
/* 三站合并壳层路由（正式版）
   用法：页面里先定义 __ZFQ_CONFIG__ 与 __ZFQ_PAGES__，再引入本文件。
   - 站内切换视图（iframe srcdoc 渲染原页面，逻辑零改写）
   - 子页面导航（main.js 的 zfqNav / 链接桥）经 postMessage 回到本路由
   - 跨站跳转：切换顶部 location 到另一站点文件
   - BGM 挂载点由各站点 HTML 提供，切换视图不会重载 audio */
(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(function () {
        const cfg = window.__ZFQ_CONFIG__;
        const pages = window.__ZFQ_PAGES__ || {};
        const frame = document.getElementById('view-frame');
        if (!cfg || !frame) return;

        let current = { id: null, query: '', hash: '' };
        let previousId = null;
        let activeBgmKey = null;
        const ERROR_VIEWS = ['dlc_404', '404_default', '404_hint_xianshubei', '404_hint_zero'];

        /* 站点级 BGM：每站可挂多首曲目，按视图映射切换；
           同一曲目内切换视图不打断；曲目间切换才换源 */
        function bgmEl(key) {
            return document.querySelector('audio[data-bgm="' + key + '"]');
        }
        function playEl(key, el) {
            if (!el) return;
            const p = el.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
        }
        function syncBgm(id) {
            const map = cfg.bgmMap || {};
            const info = cfg.bgmAssets || {};
            let key = map[id] || null;
            if (!key && previousId && map[previousId]) key = map[previousId];
            if (!key && cfg.defaultFile && map[cfg.defaultFile]) key = map[cfg.defaultFile];
            if (!key) {
                activeBgmKey = null;
                return;
            }
            const el = bgmEl(key);
            if (!el) return;

            /* 正在播放且曲目没变 → 不打扰 */
            if (key === activeBgmKey && !el.paused) return;

            /* 曲目切换：停掉其它曲目 */
            document.querySelectorAll('audio[data-bgm]').forEach(function (o) {
                if (o !== el && !o.paused) { try { o.pause(); } catch (e) {} }
            });

            if (!el._zfqWired) {
                el._zfqWired = true;
                el.volume = (info[key] && info[key].volume != null)
                    ? info[key].volume : 0.08;
                const gap = (info[key] && info[key].gap) || 0;
                el.loop = gap <= 0;
                if (gap > 0) {
                    el.addEventListener('ended', function () {
                        clearTimeout(el._gapTimer);
                        el._gapTimer = setTimeout(function () {
                            playEl(key, el);
                        }, gap);
                    });
                }
            }

            activeBgmKey = key;
            if (el.paused) {
                playEl(key, el);
            }
        }

        function wakeBgm() {
            if (current && current.id) syncBgm(current.id);
        }

        /* 从 text/plain 存储读取页面源码（生成时已转义 </script>） */
        function pageHtml(id) {
            const meta = pages[id];
            if (!meta) return null;
            const el = document.getElementById('pg-' + id);
            if (!el) return null;
            return el.textContent.split('<\\/script').join('</script');
        }

        function baseName(file) {
            try {
                return decodeURIComponent(String(file).split('?')[0].split('#')[0].split('/').pop());
            } catch (e) {
                return String(file || '');
            }
        }

        function parseNav(raw) {
            let u;
            try {
                u = new URL(String(raw), window.location.href);
            } catch (e) {
                return null;
            }
            return {
                file: baseName(u.pathname),
                query: u.search.slice(1),
                hash: u.hash.replace(/^#/, '')
            };
        }

        function viewByFile(file) {
            return cfg.pages.find(function (p) { return p.file === file; }) || null;
        }

        const BRIDGE =
            '<script>\n' +
            '(function () {\n' +
            '  function pick(ev) {\n' +
            '    var n = ev.target;\n' +
            '    while (n && n !== document && !(n.tagName === "A" && n.getAttribute && n.getAttribute("href"))) n = n.parentNode;\n' +
            '    return (n && n !== document) ? n : null;\n' +
            '  }\n' +
            '  document.addEventListener("click", function (ev) {\n' +
            '    if (ev.defaultPrevented) return;\n' +
            '    var a = pick(ev);\n' +
            '    if (!a) return;\n' +
            '    var href = a.getAttribute("href") || "";\n' +
            '    if (!href || href.charAt(0) === "#") return;\n' +
            '    if (/^(javascript:|mailto:|tel:|http:\\/\\/|https:\\/\\/)/i.test(href)) return;\n' +
            '    ev.preventDefault();\n' +
            '    try { window.parent.postMessage({ type: "zfq-nav", url: href }, "*"); } catch (e) {}\n' +
            '  });\n' +
            '  function wake() {\n' +
            '    try { window.parent.postMessage({ type: "zfq-bgm-wake" }, "*"); } catch (e) {}\n' +
            '    window.removeEventListener("pointerdown", wake);\n' +
            '    window.removeEventListener("keydown", wake);\n' +
            '    window.removeEventListener("touchstart", wake);\n' +
            '  }\n' +
            '  window.addEventListener("pointerdown", wake);\n' +
            '  window.addEventListener("keydown", wake);\n' +
            '  window.addEventListener("touchstart", wake);\n' +
            '})();\n' +
            '</script>';

        function buildDoc(id, query) {
            let doc = pageHtml(id) || '';
            const q = query || '';
            if (doc.indexOf('</head>') !== -1) {
                doc = doc.replace('</head>',
                    '<script>window.__VIEW_QUERY = ' + JSON.stringify(q) + ';</script>\n</head>');
            }
            if (doc.indexOf('</body>') !== -1) {
                doc = doc.replace('</body>', BRIDGE + '\n</body>');
            }
            return doc;
        }

        function showView(id, query, hash) {
            if (!pageHtml(id)) return;
            if (current.id && current.id !== id && ERROR_VIEWS.indexOf(current.id) === -1) {
                previousId = current.id;
            }
            current = { id: id, query: query || '', hash: hash || '' };
            frame.srcdoc = buildDoc(id, current.query);
            syncBgm(id);

            if (current.hash) {
                frame.addEventListener('load', function onLoad() {
                    frame.removeEventListener('load', onLoad);
                    try {
                        frame.contentWindow.location.hash = current.hash;
                    } catch (e) {}
                });
            }

            const want = '#v-' + encodeURIComponent(id);
            if (window.location.hash !== want) {
                try { history.replaceState(null, '', want); } catch (e) { window.location.hash = want; }
            }
        }

        function showFallback(raw) {
            const nav = parseNav(raw || '');
            const fallback = cfg.fallbackFile || '404_default.html';
            const meta = viewByFile(fallback);
            if (meta) showView(meta.id, nav ? nav.query : '', '');
        }

        function routeNav(raw) {
            /* 404 “返回”：回到进入 404 前的同一站点视图 */
            if (String(raw) === '__back__') {
                const backId = previousId || cfg.pages[0].id;
                showView(backId, '', '');
                return;
            }
            const nav = parseNav(raw);
            if (!nav) return;

            /* 同一站点 */
            let meta = viewByFile(nav.file);
            if (nav.file === '404_hint.html') {
                const type = new URLSearchParams(nav.query).get('type');
                meta = cfg.pages.find(function (p) {
                    return p.id === (type === 'zero' ? '404_hint_zero' : '404_hint_xianshubei');
                }) || meta;
            }
            if (meta) {
                showView(meta.id, nav.query, nav.hash);
                return;
            }

            /* 跨站 */
            const cross = cfg.cross && cfg.cross[nav.file];
            if (cross) {
                window.location.href = cross.href;
                return;
            }

            showFallback(raw);
        }

        window.addEventListener('message', function (ev) {
            const d = ev.data || {};
            if (d.type === 'zfq-nav') {
                routeNav(d.url);
            } else if (d.type === 'zfq-open') {
                window.location.href = d.url;
            } else if (d.type === 'zfq-bgm-wake') {
                wakeBgm();
            }
        });

        /* 壳层自身交互也作为 BGM 唤醒兜底 */
        document.addEventListener('pointerdown', wakeBgm);
        document.addEventListener('keydown', wakeBgm);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') wakeBgm();
        });

        /* 初始视图：URL #v-xxx；否则站点默认页 */
        const m = /#v-([^&]+)/.exec(window.location.hash);
        let initialId = null;
        if (m) {
            try { initialId = decodeURIComponent(m[1]); } catch (e) {}
        }
        const hashPart = /&h=([^&]+)/.exec(window.location.hash);
        const initialHash = hashPart ? decodeURIComponent(hashPart[1]) : '';
        if (initialId && pageHtml(initialId)) {
            showView(initialId, '', initialHash);
        } else {
            const def = cfg.pages.find(function (p) { return p.file === cfg.defaultFile; });
            showView(def ? def.id : cfg.pages[0].id, '', initialHash);
        }
    });
})();
