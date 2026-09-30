/* ═══════════════════════════════════════════════════════════════
   NabhoDashboard — AURORA EDITION · enhancement layer
   Loads AFTER dashboard.js. Additive only — never replaces core
   renders; wraps window.* at call time.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 1. TOASTS ────────────────────────────────────────────── */
  function toast(msg, icon) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="tico">' + (icon || '✨') + '</span><span>' + msg + '</span>';
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
  }
  window.nbToast = toast;

  /* ── 2. KPI VALUES ───────────────────────────────────────── */
  // IMPORTANT (2026-10-01): the previous COUNT-UP used requestAnimationFrame.
  // rAF is paused when the tab is backgrounded/hidden, so the value froze on
  // the FIRST frame (₹0) — a real, user-visible bug (screenshots/background
  // tabs showed ₹0 while the DOM had real numbers). Value correctness must NOT
  // depend on an animation/timer, so the count-up is removed. dashboard.js
  // writes the authoritative value directly and we only add a cosmetic class.
  function enhanceKPIs() {
    document.querySelectorAll('.kpi-value').forEach(el => {
      // Nothing to recompute: the renderer owns the value. Just flag it so CSS
      // can apply the shimmer/entrance treatment.
      el.setAttribute('data-animate', '');
    });
  }

  /* ── 3. CHART GRADIENTS (enhance existing canvases) ───────── */
  function gradientize() {
    if (typeof Chart === 'undefined') return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const mk = (ctx, c1, c2) => {
      const g = ctx.createLinearGradient(0, 0, 0, 250);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      return g;
    };
    Chart.helpers.each(Chart.instances, (chart) => {
      if (!chart || !chart.config || !chart.config.data) return;
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, i) => {
        if (ds.type === 'doughnut' || chart.config.type === 'doughnut' || chart.config.type === 'pie') return;
        if (!ds._nbGrad) {
          const c1 = i === 0 ? (isDark ? 'rgba(124,131,255,0.45)' : 'rgba(86,88,224,0.35)')
                             : (isDark ? 'rgba(52,226,164,0.40)' : 'rgba(5,159,116,0.30)');
          ds.backgroundColor = mk(ctx, c1, 'rgba(0,0,0,0)');
          ds.fill = true;
          ds._nbGrad = true;
        }
        ds.pointRadius = ds.pointRadius || 3;
        ds.pointHoverRadius = 6;
      });
      chart.update('none');
    });
  }

  /* ── 4. FIXED-ELEMENT HITABILITY GUARD ────────────────────── */
  function guardFixed() {
    document.querySelectorAll('.section.active .summary-chip, .kpi-card, .mini-card').forEach((el, i) => {
      el.style.animation = 'sectionIn 0.5s cubic-bezier(0.22,1,0.36,1) both';
      el.style.animationDelay = (i * 18) + 'ms';
    });
  }

  /* ── 5. LIVE CLOCK ────────────────────────────────────────── */
  function clock() {
    const el = document.getElementById('nbClock');
    if (!el) return;
    const tick = () => {
      const d = new Date();
      el.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
        ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };
    tick(); setInterval(tick, 1000);
  }

  /* ── 6. COMMAND PALETTE (⌘K / Ctrl+K) ─────────────────────── */
  const NAV = [
    ['overview', 'Overview', '▦'], ['cashbox', 'CashBox', '💰'],
    ['vendor_invoices', 'Vendor Invoices', '🧾'], ['sales', 'All Transactions', '📊'],
    ['stock', 'Stock', '📦'], ['attendance', 'Attendance', '👥'],
    ['telegram_invoices', 'Telegram Invoices', '📱'], ['reconciliation', 'Reconciliation', '🔍'],
    ['vendor_dues', 'Vendor Dues', '💸'], ['bank_reconciliation', 'Bank Reconciliation', '🏦']
  ];
  function palette() {
    const ov = document.getElementById('cmdkOverlay');
    if (!ov) return;
    const inp = ov.querySelector('.cmdk-input');
    const list = ov.querySelector('.cmdk-list');
    let active = 0, items = [];

    function build(q) {
      const F = NAV.filter(n => n[1].toLowerCase().includes(q.toLowerCase()));
      const extras = [
        { i: '🌓', t: 'Toggle theme', a: () => toggleTheme() },
        { i: '🔄', t: 'Reload data', a: () => loadAll() },
        { i: '📅', t: 'Jump to today', a: () => { curDate = new Date().toISOString().split('T')[0]; document.getElementById('datePicker').value = curDate; loadAll(); } }
      ].filter(e => e.t.toLowerCase().includes(q.toLowerCase()));
      items = [];
      F.forEach(n => items.push({ i: n[2], t: n[1], a: () => document.querySelector('.nav-link[data-section="' + n[0] + '"]').click() }));
      extras.forEach(e => items.push(e));
      active = 0;
      list.innerHTML = items.map((it, idx) =>
        '<div class="cmdk-item' + (idx === 0 ? ' active' : '') + '" data-idx="' + idx + '"><span class="ci">' + it.i + '</span>' + it.t + '<span class="kbd-hint">↵</span></div>'
      ).join('') || '<div class="cmdk-item">No matches</div>';
    }
    function open() { ov.classList.add('open'); inp.value = ''; build(''); inp.focus(); }
    function close() { ov.classList.remove('open'); }
    function run(idx) { if (items[idx]) { items[idx].a(); close(); toast(items[idx].t, items[idx].i); } }

    inp.addEventListener('input', () => build(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); }
      else if (e.key === 'Enter') { run(active); return; }
      else if (e.key === 'Escape') { close(); return; }
      else return;
      e.preventDefault();
      list.querySelectorAll('.cmdk-item').forEach((el, i) => el.classList.toggle('active', i === active));
      const cur = list.querySelector('.cmdk-item.active'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    });
    list.addEventListener('click', e => { const it = e.target.closest('.cmdk-item'); if (it && it.dataset.idx) run(+it.dataset.idx); });
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ov.classList.contains('open') ? close() : open(); }
      if (e.key === 'Escape' && ov.classList.contains('open')) close();
    });
  }

  /* ── 7. PATCH: notify on data load ────────────────────────── */
  function patchLoadAll() {
    if (typeof window.loadAll !== 'function' || window.loadAll.__aurora) return;
    const orig = window.loadAll;
    window.loadAll = async function () {
      try {
        await orig.apply(this, arguments);
        setTimeout(() => { enhanceKPIs(); gradientize(); guardFixed(); }, 120);
        toast('Data loaded · ' + (window.curDate || ''), '📊');
      } catch (e) { toast('Load error', '⚠️'); throw e; }
    };
    window.loadAll.__aurora = true;
  }

  /* ── 8. BOOT ──────────────────────────────────────────────── */
  // Expose the KPI enhancer so the renderer can trigger it deterministically
  // right after setting authoritative values (dataset.nbTarget).
  window.nbEnhanceKPIs = enhanceKPIs;

  function boot() {
    clock();
    palette();
    patchLoadAll();
    // re-enhance whenever theme flips (dashboard.js re-renders charts)
    const tt = document.getElementById('themeToggle');
    if (tt) tt.addEventListener('click', () => setTimeout(gradientize, 250));
    // initial enhance (dashboard.js may already have rendered)
    setTimeout(() => { enhanceKPIs(); gradientize(); guardFixed(); }, 1600);
    setTimeout(() => { gradientize(); }, 3200);
    console.log('%c🫶 NabhoDashboard — Aurora Edition active', 'color:#7c83ff;font-weight:bold');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
