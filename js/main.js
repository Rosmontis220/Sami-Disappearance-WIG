/* 👁️我在看着你👁️ */
/* ============================================================
   响石旅行社 · 《知名主播萨米失联事件》ARG 核心脚本
   纯本地运行：不使用 fetch，导航全部为页面跳转
   ============================================================ */

'use strict';

/* ---------- 安全存储（file:// 下可能受限，全部兜底） ---------- */
const SafeStore = (() => {
    const mem = new Map();
    const ok = (() => { try { sessionStorage.setItem('__t','1'); sessionStorage.removeItem('__t'); return true; } catch (e) { return false; } })();
    return {
        get(key) {
            if (ok) { try { return sessionStorage.getItem(key); } catch (e) { return mem.get(key) ?? null; } }
            return mem.get(key) ?? null;
        },
        set(key, val) {
            if (ok) { try { sessionStorage.setItem(key, val); return; } catch (e) {} }
            mem.set(key, val);
        }
    };
})();

/* ---------- 关键词路由（站点隔离） ----------
   旅行社站与皿良站搜索互不相通：
   在错误的站点搜索任何关键词，一律进入该站点自己的 404。 */
const TRAVEL_KEYWORDS = {
    '线路': 'routes.html',
    '萨米冰原探险': 'routes.html',
    '关于我们': 'about.html',
    '响石': 'about.html',
    'cairn': 'about.html',
    '客户评价': 'reviews.html',
    '那场直播': '404_hint.html?type=325',
    '订单查询': 'order.html',
    'sa11001215-325': 'order.html?auto=SA11001215-325',
    '直播存档': 'livestream.html',
    '直播服务': 'livestream.html',
    '756': 'livestream.html',
    '756号': 'livestream.html',
    '废弃信号放大站756号': 'livestream.html',
    '关键帧分析': 'frame_0325.html',
    '皇帝的利刃': 'blade.html',
    '邪魔的利刃': 'blade.html',
    '凛视': 'prophecy.html',
    '艾尔启': 'prophecy.html',
    '私人日志': '404_hint.html?type=zero',
    '响石的私人日志': '404_hint.html?type=zero',
    'zero': 'journal.html',
    '提丰': 'stones.html',
    '尸体': 'ending.html',
    '周符卿': 'news.html#n-1218',
};

/* ---- DLC1：《夺位》（皿良站点词库） ---- */
const DLC_KEYWORDS = {
    'hewasinmyway': 'second.html',
    '挡路': 'second.html',
    '挡我路': 'second.html',
    'iamalwayssecond': 'excel.html',
    '第二': 'excel.html',
    'minliangpiche': 'truth.html',
    '真结局': 'true_end.html'   // 真结局页面
};

/* 合并表保留给可能的控制台/调试使用；实际路由按站点词库走 */
const KEYWORDS = Object.assign({}, TRAVEL_KEYWORDS, DLC_KEYWORDS);

/* ---------- DLC1 持久状态（localStorage） ---------- */
const DlcStore = (() => {
    const mem = new Map();
    const ok = (() => { try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } })();
    return {
        get(key) {
            if (ok) { try { return localStorage.getItem(key); } catch (e) { return mem.get(key) ?? null; } }
            return mem.get(key) ?? null;
        },
        set(key, val) {
            if (ok) { try { localStorage.setItem(key, val); return; } catch (e) {} }
            mem.set(key, val);
        }
    };
})();

const DLC1_COMPLETED = 'dlc1_completed';
const DLC1_TRIGGERED = 'dlc1_triggered';

/* 结局页彩蛋：搜索 325 */
const ENDING_EASTER_EGG = 'https://www.bilibili.com/video/BV1kw4m1d7N6/?p=3&share_source=copy_web&vd_source=8f9ca425095e0768ee959d2284e407e4&t=1939';

function normalizeKeyword(raw) {
    return (raw || '').trim().replace(/\s+/g, '').toLowerCase();
}

/* ---------- 合并壳层导航桥 ----------
   站内视图切换：由父页面统一路由（跨站则父页面跳转对应站点文件）；
   外部 http(s) 链接交给父页面新窗口打开。 */
function zfqNav(url) {
    url = String(url || '');
    try {
        if (/^https?:\/\//i.test(url)) {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'zfq-open', url: url }, '*');
            } else {
                window.open(url, '_blank', 'noopener');
            }
            return;
        }
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'zfq-nav', url: url }, '*');
        } else {
            window.location.href = url;
        }
    } catch (e) {
        if (/^https?:/i.test(url)) window.open(url, '_blank');
        else window.location.href = url;
    }
}

/* srcdoc 无法携带真实 query，由父页面注入 __VIEW_QUERY */
function viewQueryString() {
    try { return window.__VIEW_QUERY || ''; } catch (e) { return ''; }
}

/* 当前页面所属站点：皿良站（DLC 红黑体系）vs 旅行社站 */
function currentSite() {
    const page = document.body ? document.body.getAttribute('data-page') : '';
    return ['minliang', 'second', 'excel', 'truth', 'usurp'].includes(page) ? 'dlc' : 'travel';
}

/* DLC1 线性流程：必须按 挡路 → 第二 → minliangpiche 的顺序搜索 */
function dlcStep() {
    let s = parseInt(DlcStore.get('dlc_dev_step') || '0', 10) || 0;
    if (DlcStore.get(DLC1_COMPLETED) === '1' && s < 3) s = 3;
    return s;
}

function searchQuery(raw) {
    const input = document.getElementById('search-input');
    const key = normalizeKeyword(raw);
    if (!key) {
        if (input) { input.focus(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 450); }
        return;
    }
    /* DLC1：私人日志页输入 799 → 就地唤醒皿良模块（不跳转） */
    if (document.body.getAttribute('data-page') === 'journal' && key === '799') {
        DlcStore.set(DLC1_TRIGGERED, '1');
        if (typeof triggerDlc799 === 'function') triggerDlc799();
        return;
    }
    // 仅在结局选择页触发：搜索 325 跳转彩蛋视频
    if (document.body.getAttribute('data-page') === 'ending' && key === '325') {
        zfqNav(ENDING_EASTER_EGG);
        return;
    }
    const site = currentSite();
    const target = (site === 'dlc' ? DLC_KEYWORDS : TRAVEL_KEYWORDS)[key] || null;
    if (site === 'dlc' && target) {
        const step = dlcStep();
        if (key === 'iamalwayssecond' || key === '第二') {
            if (step < 1) {
                zfqNav('dlc_404.html?q=' + encodeURIComponent(raw.trim()));
                return;
            }
            DlcStore.set('dlc_dev_step', '2');
        } else if (key === 'minliangpiche') {
            if (step < 2) {
                zfqNav('dlc_404.html?q=' + encodeURIComponent(raw.trim()));
                return;
            }
            DlcStore.set('dlc_dev_step', '3');
        } else if (key === 'hewasinmyway' || key === '挡路' || key === '挡我路') {
            DlcStore.set('dlc_dev_step', '1');
        }
    }
    if (target) {
        zfqNav(target);
    } else {
        zfqNav((site === 'dlc' ? 'dlc_404.html' : '404_default.html') + '?q=' + encodeURIComponent(raw.trim()));
    }
}

function handleSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    searchQuery(input.value);
}

/* ---------- DLC1：journal 页 799 唤醒 ---------- */
function triggerDlc799() {
    const moduleEl = document.getElementById('dlc-799-module');
    if (!moduleEl) return;

    // 全页 glitch 闪烁 0.3s
    document.body.classList.add('dlc-glitch');
    setTimeout(() => document.body.classList.remove('dlc-glitch'), 320);

    // 头像变暗 0.5s 后恢复
    const avatar = moduleEl.querySelector('.dlc-avatar');
    if (avatar) avatar.classList.add('dim');
    setTimeout(() => { if (avatar) avatar.classList.remove('dim'); }, 520);

    // 显示"进来吧"
    const reveal = document.getElementById('dlc-799-reveal');
    if (reveal) {
        reveal.hidden = false;
        reveal.classList.add('show');
    }
    moduleEl.setAttribute('data-locked', '0');

    setTimeout(() => {
        moduleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 340);
}

function initDlcJournal() {
    const moduleEl = document.getElementById('dlc-799-module');
    const reveal = document.getElementById('dlc-799-reveal');
    if (DlcStore.get(DLC1_TRIGGERED) === '1') {
        if (moduleEl) moduleEl.setAttribute('data-locked', '0');
        if (reveal) { reveal.hidden = false; reveal.classList.add('show'); }
    }
    // 模块整体可点击进入咨询台（仅解锁后）
    if (moduleEl && reveal) {
        moduleEl.style.cursor = 'default';
        moduleEl.addEventListener('click', (e) => {
            if (e.target.closest('a')) return; // 按钮自身的链接
            if (moduleEl.getAttribute('data-locked') === '0') {
                zfqNav('minliang.html');
            }
        });
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'search-input') {
        e.preventDefault();
        handleSearch();
    }
});

/* 输入框包含“尸体”时整条变红 */
document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'search-input') return;
    const box = e.target.closest('.search-box');
    if (!box) return;
    box.classList.toggle('query-danger', (e.target.value || '').includes('尸体'));
});

/* 损坏链接（页面叙事）：提示链接失效 */
document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('.broken-link') : null;
    if (!el) return;
    e.preventDefault();
    showToast('链接似乎已经失效。\n该内容也许要从站内搜索框才能找到……');
});

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(msg, ms = 3200) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

/* ---------- 黑雪 ---------- */
function triggerBlackSnow(count = 64) {
    let layer = document.getElementById('fx-snow');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'fx-snow';
        document.body.appendChild(layer);
    }
    layer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const flake = document.createElement('span');
        flake.className = 'flake';
        const size = 3.5 + Math.random() * 6;
        flake.style.width = size + 'px';
        flake.style.height = size + 'px';
        flake.style.left = (Math.random() * 100) + 'vw';
        flake.style.setProperty('--drift', ((Math.random() * 160) - 80).toFixed(0) + 'px');
        flake.style.animationDuration = (7 + Math.random() * 9).toFixed(1) + 's';
        flake.style.animationDelay = (-Math.random() * 12).toFixed(1) + 's';
        layer.appendChild(flake);
    }
}

/* 结局渐暗 */
function darkenFinale(delay = 2400) {
    let dim = document.getElementById('fx-dim');
    if (!dim) {
        dim = document.createElement('div');
        dim.id = 'fx-dim';
        document.body.appendChild(dim);
    }
    setTimeout(() => dim.classList.add('darkening'), delay);
}

/* ---------- 订单查询页 ---------- */
const VALID_ORDER = 'SA11001215-325';

function initOrderPage() {
    const form = document.getElementById('order-form');
    const input = document.getElementById('order-input');
    const err = document.getElementById('order-error');
    const result = document.getElementById('order-result');
    if (!form || !input || !result) return;

    function showError(msg) {
        if (!err) return;
        err.textContent = msg || '未找到该订单，请检查订单号格式。';
        err.classList.add('show');
        result.classList.add('hidden-result');
    }
    function hideError() {
        if (err) err.classList.remove('show');
    }
    function revealOrder() {
        hideError();
        result.classList.remove('hidden-result');
        SafeStore.set('cairn_order_ok', '1');
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const tryQuery = () => {
        const value = (input.value || '').trim().toUpperCase();
        if (value === VALID_ORDER) {
            revealOrder();
        } else if (/^SA11001215-\d{3}$/.test(value)) {
            showError('查询到相关行程，但该订单已被归档或删除。请核对订单号后三位。');
        } else {
            showError('订单号格式不正确。格式：SA11001215-XXX');
        }
    };

    form.addEventListener('submit', (e) => { e.preventDefault(); tryQuery(); });

    // 搜索框直达：自动填入并展示
    const params = new URLSearchParams(viewQueryString());
    if (params.get('auto') === VALID_ORDER) {
        input.value = VALID_ORDER;
        revealOrder();
    }
}

/* ---------- 直播存档 / 信号站解说 双模式 ---------- */
function initLivestreamPage() {
    const scenicEls = document.querySelectorAll('[data-mode="scenic"]');
    const archiveEls = document.querySelectorAll('[data-mode="archive"]');
    const orderOk = SafeStore.get('cairn_order_ok') === '1';
    const wantArchive = new URLSearchParams(viewQueryString()).get('archive') === '1';

    if (!orderOk && !wantArchive) {
        archiveEls.forEach(el => el.style.display = 'none');
        scenicEls.forEach(el => el.style.display = '');
        document.body.classList.remove('phase-2');
        document.body.classList.add('phase-1');
    } else {
        archiveEls.forEach(el => el.style.display = '');
        scenicEls.forEach(el => el.style.display = 'none');
    }
}

/* ---------- 404 提示页 ---------- */
function initHintPage() {
    const type = new URLSearchParams(viewQueryString()).get('type');
    const area = document.getElementById('hint-area');
    if (!area) return;
    if (type === '325') {
        document.body.classList.remove('phase-1');
        document.body.classList.add('phase-2');
        area.innerHTML = '订单号格式为 SA11001215-XXX。<br>最后三位与主播经历有关。';
    } else if (type === 'zero') {
        document.body.classList.remove('phase-1');
        document.body.classList.add('phase-3');
        area.innerHTML = '密码提示：她最引以为傲的职业记录。';
    } else {
        area.innerHTML = '';
    }
}

/* ---------- 各页初始化 ---------- */
/* DLC1：结局页三按钮逻辑 */
function initEndingPage() {
    const btnCovered = document.getElementById('dlc-choice-covered');
    const btnLost = document.getElementById('dlc-choice-lost');
    const btnUsurp = document.getElementById('dlc-choice-usurp');
    const dlcDone = DlcStore.get(DLC1_COMPLETED) === '1';

    // 左按钮：未完成 DLC = 接受官方说法 → covered；完成 DLC = 沉默 → usurp
    if (btnCovered) {
        btnCovered.addEventListener('click', (e) => {
            e.preventDefault();
            zfqNav(dlcDone ? 'usurp.html' : 'covered.html');
        });
    }
    if (btnUsurp) {
        btnUsurp.addEventListener('click', (e) => {
            e.preventDefault();
            if (!dlcDone) return;
            zfqNav('usurp.html');
        });
    }
    // 右：揭露真相 → lost.html（本体状态）；DLC 完成后拦截
    if (btnLost) {
        btnLost.addEventListener('click', (e) => {
            e.preventDefault();
            if (dlcDone) {
                showToast('你想让自己被捕吗？');
                return;
            }
            zfqNav('lost.html');
        });
    }

    // 显示/切换文案：完成 DLC 后，左按钮由"接受官方说法"变为"沉默"
    if (btnCovered && btnUsurp) {
        if (dlcDone) {
            btnUsurp.style.display = '';
            btnCovered.style.display = 'none';
        } else {
            btnUsurp.style.display = 'none';
            btnCovered.style.display = '';
        }
    }
}

/* DLC1：truth 页到达即视为完成支线 */
function initDlcTruthPage() {
    DlcStore.set(DLC1_COMPLETED, '1');
}

function boot() {
    const page = document.body.getAttribute('data-page');

    // 当前页面在导航中的高亮
    const current = document.body.getAttribute('data-nav');
    if (current) {
        document.querySelectorAll('.nav-inner a').forEach(a => {
            if (a.getAttribute('href') === current + '.html' || a.getAttribute('href') === current) {
                a.classList.add('current');
            }
        });
    }

    // 页面模式可能修改 body 阶段
    if (page === 'order') initOrderPage();
    if (page === 'livestream') initLivestreamPage();
    if (page === 'journal') initDlcJournal();
    if (page === 'ending') initEndingPage();
    if (page === 'truth') initDlcTruthPage();

    if (page === 'hint') initHintPage();
    if (page === 'notfound') {
        const q = new URLSearchParams(viewQueryString()).get('q');
        const trace = document.getElementById('query-trace');
        if (trace) {
            trace.textContent = q ? '您搜索的“' + q + '”不存在或已被归档。' : '搜索词为空。';
        }
    }
    if (page === 'frame') {
        setTimeout(() => triggerBlackSnow(46), 700);
    }
    if (page === 'lost') {
        setTimeout(() => triggerBlackSnow(80), 900);
        darkenFinale(2600);
    }
}

/* 页面间跳转时保留“是否看过订单”的标记 */
document.addEventListener('DOMContentLoaded', boot);

/* 对外暴露（供 HTML 内联调用兜底） */
window.handleSearch = handleSearch;
window.searchQuery = searchQuery;
window.triggerBlackSnow = triggerBlackSnow;
window.showToast = showToast;
window.triggerDlc799 = triggerDlc799;
window.DlcStore = DlcStore;
window.DLC1_COMPLETED = DLC1_COMPLETED;
window.DLC1_TRIGGERED = DLC1_TRIGGERED;
