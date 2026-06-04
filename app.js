/* ═══════════════════════════════════════════
   NabhoDashboard — Supabase-Powered App
   ═══════════════════════════════════════════ */

// ─── Supabase Config ───
const SUPABASE_URL = 'https://hrbutgotfglunmoxjlyb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnV0Z290ZmdsdW5tb3hqbHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MjA4NzIsImV4cCI6MjA5NDM5Njg3Mn0.Fp8Fwa1NLyFssN4HcK4m9puUG1-FMchqaQMd7U7zuvs';

let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
    console.error('Supabase init failed:', e);
}

// ─── State ───
let currentDate = new Date().toISOString().split('T')[0];
let currentStore = 'NabhoBazaarCoochBehar';
let currentSection = 'overview';
let sortState = {};
let allDates = [];
let salesTrendChart = null;
let paymentMixChart = null;
let isLoading = false;

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Safety: force-hide loading after 15s no matter what
    setTimeout(() => hideLoading(true), 15000);

    if (!supabase) {
        document.getElementById('connectionStatus').textContent = 'Supabase init failed';
        document.querySelector('.status-dot').classList.add('error');
        hideLoading();
        return;
    }

    await loadDates();
    await loadAll();
});

// ─── Event Listeners ───
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const section = link.dataset.section;
            switchSection(section);
        });
    });

    // Date picker
    const datePicker = document.getElementById('datePicker');
    datePicker.value = currentDate;
    datePicker.addEventListener('change', () => {
        currentDate = datePicker.value;
        loadAll();
    });

    // Date nav
    document.getElementById('datePrev').addEventListener('click', () => navigateDate(-1));
    document.getElementById('dateNext').addEventListener('click', () => navigateDate(1));
    document.getElementById('dateToday').addEventListener('click', () => {
        currentDate = new Date().toISOString().split('T')[0];
        datePicker.value = currentDate;
        loadAll();
    });

    // Store selector
    document.getElementById('storeSelect').addEventListener('change', e => {
        currentStore = e.target.value;
        loadAll();
    });

    // Hamburger
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('hamburger').classList.toggle('active');
    });

    // Search inputs
    document.querySelectorAll('.search-input').forEach(input => {
        input.addEventListener('input', e => {
            const table = input.dataset.table;
            filterTable(table, e.target.value);
        });
    });

    // Stock filters
    document.querySelectorAll('.btn-filter[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-filter[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterStock(btn.dataset.filter);
        });
    });

    // Table sorting
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const table = th.closest('.data-table').id.replace('table-', '');
            const field = th.dataset.sort;
            sortTable(table, field, th);
        });
    });
}

// ─── Navigation ───
function switchSection(section) {
    currentSection = section;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`.nav-link[data-section="${section}"]`).classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`).classList.add('active');

    const titles = {
        overview: 'Overview', cashbox: 'CashBox', vendor_invoices: 'Vendor Invoices',
        sales: 'Sales', stock: 'Stock / Inventory', attendance: 'Attendance',
        telegram_invoices: 'Telegram Invoices', reconciliation: 'Reconciliation'
    };
    document.getElementById('pageTitle').textContent = titles[section] || section;
    document.getElementById('pageSubtitle').textContent = formatDateDisplay(currentDate);

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('hamburger').classList.remove('active');
}

function navigateDate(offset) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset);
    currentDate = d.toISOString().split('T')[0];
    document.getElementById('datePicker').value = currentDate;
    loadAll();
}

function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Data Loading ───
async function loadDates() {
    try {
        const { data, error } = await supabase.from('v_dates_with_data').select('date');
        if (data) allDates = data.map(r => r.date);
    } catch (e) {
        console.warn('Could not load dates:', e);
    }
}

async function loadAll() {
    if (isLoading) return; // Prevent double-loading
    isLoading = true;
    showLoading();

    try {
        // Load all data in parallel — each has its own error handling
        const results = await Promise.allSettled([
            loadTable('cashbox'),
            loadTable('vendor_invoices'),
            loadTable('sales'),
            loadTable('stock'),
            loadTable('attendance'),
            loadTable('telegram_invoices'),
            loadTable('reconciliation'),
            loadDailySummary()
        ]);

        const cashbox = results[0].status === 'fulfilled' ? results[0].value : [];
        const vendorInvoices = results[1].status === 'fulfilled' ? results[1].value : [];
        const sales = results[2].status === 'fulfilled' ? results[2].value : [];
        const stock = results[3].status === 'fulfilled' ? results[3].value : [];
        const attendance = results[4].status === 'fulfilled' ? results[4].value : [];
        const telegramInvoices = results[5].status === 'fulfilled' ? results[5].value : [];
        const reconciliation = results[6].status === 'fulfilled' ? results[6].value : [];
        const summary = results[7].status === 'fulfilled' ? results[7].value : null;

        // Log any failures
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.warn(`Query ${i} failed:`, r.reason);
        });

        // Update sections
        renderCashbox(cashbox);
        renderVendorInvoices(vendorInvoices);
        renderSales(sales);
        renderStock(stock);
        renderAttendance(attendance);
        renderTelegramInvoices(telegramInvoices);
        renderReconciliation(reconciliation);
        renderOverview(cashbox, vendorInvoices, sales, stock, reconciliation, summary);

        // Update connection status
        document.getElementById('connectionStatus').textContent = 'Connected to Supabase';
        document.querySelector('.status-dot').classList.add('online');
        document.querySelector('.status-dot').classList.remove('error');
    } catch (e) {
        console.error('Load error:', e);
        document.getElementById('connectionStatus').textContent = 'Connection error';
        document.querySelector('.status-dot').classList.add('error');
        document.querySelector('.status-dot').classList.remove('online');
    } finally {
        isLoading = false;
        hideLoading();
    }
}

async function loadTable(table) {
    try {
        let query = supabase.from(table).select('*').eq('date', currentDate);
        if (currentStore !== 'all') query = query.eq('store', currentStore);
        const { data, error } = await query;
        if (error) {
            console.warn(`Error loading ${table}:`, error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.warn(`Exception loading ${table}:`, e);
        return [];
    }
}

async function loadDailySummary() {
    try {
        let query = supabase.from('daily_summaries').select('*').eq('date', currentDate);
        if (currentStore !== 'all') query = query.eq('store', currentStore);
        const { data, error } = await query;
        if (error || !data || data.length === 0) return null;
        return data[0];
    } catch (e) {
        console.warn('Error loading summary:', e);
        return null;
    }
}

// ─── Render: Overview ───
function renderOverview(cashbox, vendorInvoices, sales, stock, reconciliation, summary) {
    // Use summary data for sales if available (more accurate, from CashBox), fallback to Vyapar sales table
    let totalSales, txnCount, cashSales, upiSales;
    if (summary && (summary.total_sales > 0 || summary.txn_count > 0)) {
        totalSales = summary.total_sales || 0;
        txnCount = summary.txn_count || 0;
        cashSales = summary.cash_sales || 0;
        upiSales = summary.upi_sales || 0;
    } else {
        totalSales = sales.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        txnCount = sales.length;
        cashSales = sales.filter(r => (r.payment||'').toLowerCase().includes('cash')).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        upiSales = totalSales - cashSales;
    }
    const totalVendor = vendorInvoices.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalStockValue = stock.reduce((s, r) => s + (parseFloat(r.stock_value) || 0), 0);
    const discrepancies = reconciliation.filter(r => r.status !== 'PASS').length;

    const profit = summary ? summary.total_profit : 0;
    const closingCash = summary ? summary.closing_cash : 0;
    const closingUpi = summary ? summary.closing_upi : 0;

    document.getElementById('kpi-sales').textContent = formatCurrency(totalSales);
    document.getElementById('kpi-sales-txn').textContent = `${txnCount} transactions (Cash ${formatCurrency(cashSales)} + UPI ${formatCurrency(upiSales)})`;
    document.getElementById('kpi-profit').textContent = formatCurrency(profit);
    document.getElementById('kpi-profit-margin').textContent = totalSales > 0 ? `${((profit/totalSales)*100).toFixed(1)}% margin` : '0% margin';
    document.getElementById('kpi-stock').textContent = formatCurrency(totalStockValue);
    document.getElementById('kpi-stock-items').textContent = `${stock.length} items`;
    document.getElementById('kpi-vendor').textContent = formatCurrency(totalVendor);
    document.getElementById('kpi-vendor-count').textContent = `${vendorInvoices.length} invoices`;
    document.getElementById('kpi-discrepancies').textContent = discrepancies;
    document.getElementById('kpi-discrepancies-detail').textContent = discrepancies === 0 ? 'All checks passed' : `${discrepancies} issues found`;
    document.getElementById('kpi-closing-cash').textContent = formatCurrency(closingCash);
    document.getElementById('kpi-closing-cash-detail').textContent = `Opening: ${formatCurrency(summary ? summary.opening_cash : 0)}`;
    document.getElementById('kpi-closing-upi').textContent = formatCurrency(closingUpi);
    document.getElementById('kpi-closing-upi-detail').textContent = `Opening: ${formatCurrency(summary ? summary.opening_upi : 0)}`;

    renderOverviewCashbox(cashbox.slice(-5));
    renderOverviewRecon(reconciliation);

    // Charts — fire and forget, don't block UI
    renderSalesTrendChart().catch(e => console.warn('Sales chart error:', e));
    renderPaymentMixChart(sales);
}

function renderOverviewCashbox(rows) {
    const el = document.getElementById('overviewCashbox');
    if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No cashbox activity today</p></div>'; return; }
    let html = '<table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>';
    rows.forEach(r => {
        const amount = (parseFloat(r.cash_in)||0) + (parseFloat(r.upi_in)||0) - (parseFloat(r.cash_out)||0) - (parseFloat(r.upi_out)||0);
        html += `<tr><td>${r.time||''}</td><td>${r.transaction_type||''}</td><td>${r.description||''}</td><td class="num ${amount>=0?'positive':'negative'}">${formatCurrency(amount)}</td></tr>`;
    });
    html += '</tbody></table>';
    el.innerHTML = html;
}

function renderOverviewRecon(rows) {
    const el = document.getElementById('overviewRecon');
    if (!rows.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No reconciliation data for today</p></div>'; return; }
    let html = '';
    rows.forEach(r => {
        const cls = r.status === 'PASS' ? 'pass' : 'fail';
        const icon = r.status === 'PASS' ? '✅' : '❌';
        html += `<div class="recon-card ${cls}" style="margin-bottom:8px;padding:12px;">
            <span class="recon-title">${icon} ${r.check_type}</span>
            <span class="recon-status" style="float:right;color:${cls==='pass'?'var(--green)':'var(--red)'}">${r.status}</span>
            ${r.details ? `<div class="recon-detail">${r.details}</div>` : ''}
        </div>`;
    });
    el.innerHTML = html;
}

// ─── Render: CashBox ───
function renderCashbox(rows) {
    renderTable('cashbox', rows, r => ({
        time: r.time || '',
        transaction_type: r.transaction_type || '',
        ref: r.ref || '',
        description: r.description || '',
        cash_in: formatCurrency(r.cash_in),
        cash_out: formatCurrency(r.cash_out),
        upi_in: formatCurrency(r.upi_in),
        upi_out: formatCurrency(r.upi_out),
        owner_paid: formatCurrency(r.owner_paid),
        running_cash: formatCurrency(r.running_cash),
        running_upi: formatCurrency(r.running_upi),
        total: formatCurrency(r.total)
    }));

    const totalCashIn = rows.reduce((s,r) => s + (parseFloat(r.cash_in)||0), 0);
    const totalCashOut = rows.reduce((s,r) => s + (parseFloat(r.cash_out)||0), 0);
    const totalUpiIn = rows.reduce((s,r) => s + (parseFloat(r.upi_in)||0), 0);
    const totalUpiOut = rows.reduce((s,r) => s + (parseFloat(r.upi_out)||0), 0);
    renderSummaryChips('cashboxSummary', [
        { label: 'Cash In', value: formatCurrency(totalCashIn) },
        { label: 'Cash Out', value: formatCurrency(totalCashOut) },
        { label: 'UPI In', value: formatCurrency(totalUpiIn) },
        { label: 'UPI Out', value: formatCurrency(totalUpiOut) },
        { label: 'Transactions', value: rows.length }
    ]);
}

// ─── Render: Vendor Invoices ───
function renderVendorInvoices(rows) {
    renderTable('vendor_invoices', rows, r => ({
        vendor: r.vendor || '',
        invoice_no: r.invoice_no || '',
        bill_date: r.bill_date || '',
        purchase_date: r.purchase_date || '',
        clear_date: r.clear_date || '',
        amount: formatCurrency(r.amount),
        cash_paid: formatCurrency(r.cash_paid),
        owner_paid: formatCurrency(r.owner_paid),
        due: `<span class="${(parseFloat(r.due)||0)>0?'negative':''}">${formatCurrency(r.due)}</span>`,
        payment_method: r.payment_method || ''
    }));

    const totalAmount = rows.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
    const totalDue = rows.reduce((s,r) => s + (parseFloat(r.due)||0), 0);
    renderSummaryChips('vendorInvoicesSummary', [
        { label: 'Total Bills', value: formatCurrency(totalAmount) },
        { label: 'Total Due', value: formatCurrency(totalDue) },
        { label: 'Invoice Count', value: rows.length }
    ]);
}

// ─── Render: Sales ───
function renderSales(rows) {
    renderTable('sales', rows, r => ({
        ref: r.ref || '',
        party: r.party || '',
        type: r.type || '',
        total: formatCurrency(r.total),
        payment: r.payment || '',
        paid: formatCurrency(r.paid),
        received: formatCurrency(r.received),
        balance: `<span class="${(parseFloat(r.balance)||0)>0?'negative':''}">${formatCurrency(r.balance)}</span>`
    }));

    const totalSales = rows.reduce((s,r) => s + (parseFloat(r.total)||0), 0);
    const totalReceived = rows.reduce((s,r) => s + (parseFloat(r.received)||0), 0);
    renderSummaryChips('salesSummary', [
        { label: 'Total Sales', value: formatCurrency(totalSales) },
        { label: 'Received', value: formatCurrency(totalReceived) },
        { label: 'Transactions', value: rows.length }
    ]);
}

// ─── Render: Stock ───
function renderStock(rows) {
    renderTable('stock', rows, r => {
        const status = (parseFloat(r.qty)||0) < 0 ? 'negative' : (parseFloat(r.qty)||0) < 5 ? 'low' : 'ok';
        return {
            item_name: r.item_name || '',
            barcode: r.barcode || '',
            hsn: r.hsn || '',
            mrp: formatCurrency(r.mrp),
            sale_price: formatCurrency(r.sale_price),
            purchase_price: formatCurrency(r.purchase_price),
            qty: `<span class="badge badge-${status}">${r.qty||0}</span>`,
            stock_value: formatCurrency(r.stock_value),
            status: `<span class="badge badge-${status}">${status.toUpperCase()}</span>`
        };
    });

    const totalValue = rows.reduce((s,r) => s + (parseFloat(r.stock_value)||0), 0);
    const lowStock = rows.filter(r => (parseFloat(r.qty)||0) < 5 && (parseFloat(r.qty)||0) >= 0).length;
    const negative = rows.filter(r => (parseFloat(r.qty)||0) < 0).length;
    renderSummaryChips('stockSummary', [
        { label: 'Total Value', value: formatCurrency(totalValue) },
        { label: 'Items', value: rows.length },
        { label: 'Low Stock', value: lowStock },
        { label: 'Negative', value: negative }
    ]);
}

// ─── Render: Attendance ───
function renderAttendance(rows) {
    renderTable('attendance', rows, r => ({
        employee: r.employee || '',
        check_in: r.check_in || '-',
        check_out: r.check_out || '-',
        work_hours: r.work_hours || 0,
        break_hours: r.break_hours || 0,
        leave: r.leave || '-'
    }));

    const totalHours = rows.reduce((s,r) => s + (parseFloat(r.work_hours)||0), 0);
    renderSummaryChips('attendanceSummary', [
        { label: 'Employees', value: rows.length },
        { label: 'Total Hours', value: `${totalHours.toFixed(1)}h` }
    ]);
}

// ─── Render: Telegram Invoices ───
function renderTelegramInvoices(rows) {
    renderTable('telegram_invoices', rows, r => ({
        sender: r.sender || '',
        invoice_no: r.invoice_no || '',
        amount: formatCurrency(r.amount),
        payment_method: r.payment_method || '',
        bill_date: r.bill_date || '',
        clear_date: r.clear_date || ''
    }));

    const totalAmount = rows.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
    renderSummaryChips('telegramInvoicesSummary', [
        { label: 'Total', value: formatCurrency(totalAmount) },
        { label: 'Invoices', value: rows.length }
    ]);
}

// ─── Render: Reconciliation ───
function renderReconciliation(rows) {
    renderTable('reconciliation', rows, r => ({
        check_type: r.check_type || '',
        status: `<span class="badge badge-${r.status==='PASS'?'pass':'fail'}">${r.status}</span>`,
        expected: formatCurrency(r.expected),
        actual: formatCurrency(r.actual),
        discrepancy: `<span class="${(parseFloat(r.discrepancy)||0)!==0?'negative':''}">${formatCurrency(r.discrepancy)}</span>`,
        details: r.details || ''
    }));

    const cardsEl = document.getElementById('reconCards');
    if (!rows.length) { cardsEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No reconciliation data for today</p></div>'; return; }
    let html = '';
    rows.forEach(r => {
        const cls = r.status === 'PASS' ? 'pass' : r.status === 'WARN' ? 'warn' : 'fail';
        const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
        html += `<div class="recon-card ${cls}">
            <div class="recon-title">${icon} ${r.check_type}</div>
            <div class="recon-status" style="color:${cls==='pass'?'var(--green)':cls==='warn'?'var(--orange)':'var(--red)'}">${r.status}</div>
            ${r.details ? `<div class="recon-detail">${r.details}</div>` : ''}
            ${(parseFloat(r.discrepancy)||0) !== 0 ? `<div class="recon-detail">Discrepancy: ${formatCurrency(r.discrepancy)}</div>` : ''}
        </div>`;
    });
    cardsEl.innerHTML = html;
}

// ─── Table Rendering ───
function renderTable(tableId, rows, cellMapper) {
    const tbody = document.querySelector(`#table-${tableId} tbody`);
    if (!tbody) return;
    if (!rows.length) {
        const colCount = document.querySelectorAll(`#table-${tableId} th`).length;
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:40px;color:var(--text-3)">No data for this date</td></tr>`;
        return;
    }
    let html = '';
    rows.forEach(r => {
        const cells = cellMapper(r);
        html += '<tr>';
        Object.values(cells).forEach(v => {
            const isNum = typeof v === 'string' && (v.startsWith('₹') || v.startsWith('<span class="') && (v.includes('₹') || v.includes('negative') || v.includes('positive')));
            html += `<td${isNum?' class="num"':''}>${v}</td>`;
        });
        html += '</tr>';
    });
    tbody.innerHTML = html;
}

function renderSummaryChips(elId, chips) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = chips.map(c => `<div class="summary-chip"><span class="chip-label">${c.label}</span><span class="chip-value">${c.value}</span></div>`).join('');
}

// ─── Charts ───
async function renderSalesTrendChart() {
    const canvas = document.getElementById('chartSalesTrend');
    if (!canvas || !supabase) return;
    const ctx = canvas.getContext('2d');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

    try {
        let query = supabase.from('daily_summaries').select('date, total_sales, total_profit').gte('date', fromDate).order('date');
        if (currentStore !== 'all') query = query.eq('store', currentStore);
        const { data, error } = await query;
        if (error) { console.warn('Sales trend query error:', error); return; }

        const labels = (data || []).map(r => {
            const d = new Date(r.date);
            return `${d.getDate()}/${d.getMonth()+1}`;
        });
        const salesData = (data || []).map(r => parseFloat(r.total_sales) || 0);
        const profitData = (data || []).map(r => parseFloat(r.total_profit) || 0);

        if (salesTrendChart) salesTrendChart.destroy();
        salesTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Sales',
                        data: salesData,
                        borderColor: '#0070f3',
                        backgroundColor: 'rgba(0,112,243,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#0070f3'
                    },
                    {
                        label: 'Profit',
                        data: profitData,
                        borderColor: '#00d68f',
                        backgroundColor: 'rgba(0,214,143,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#00d68f'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#a1a1a1', font: { size: 12 } } } },
                scales: {
                    x: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#666', callback: v => '₹'+v.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    } catch (e) {
        console.warn('Sales trend chart error:', e);
    }
}

function renderPaymentMixChart(sales) {
    const canvas = document.getElementById('chartPaymentMix');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
        const cashTotal = sales.filter(r => !r.payment || r.payment.toLowerCase().includes('cash')).reduce((s,r) => s + (parseFloat(r.total)||0), 0);
        const upiTotal = sales.filter(r => r.payment && r.payment.toLowerCase().includes('upi')).reduce((s,r) => s + (parseFloat(r.total)||0), 0);
        const otherTotal = sales.reduce((s,r) => s + (parseFloat(r.total)||0), 0) - cashTotal - upiTotal;

        if (paymentMixChart) paymentMixChart.destroy();
        paymentMixChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Cash', 'UPI', 'Other'],
                datasets: [{
                    data: [cashTotal, upiTotal, Math.max(0, otherTotal)],
                    backgroundColor: ['#0070f3', '#00d68f', '#7928ca'],
                    borderColor: '#111',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#a1a1a1', padding: 16, font: { size: 12 } } }
                }
            }
        });
    } catch (e) {
        console.warn('Payment mix chart error:', e);
    }
}

// ─── Utilities ───
function formatCurrency(val) {
    const num = parseFloat(val) || 0;
    if (num === 0) return '₹0';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function sortTable(tableId, field, thEl) {
    const table = document.getElementById(`table-${tableId}`);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const ths = table.querySelectorAll('th');

    const isAsc = sortState[tableId] === field + '-asc';
    const dir = isAsc ? 'desc' : 'asc';
    sortState[tableId] = field + '-' + dir;

    ths.forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
    thEl.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');

    const colIdx = Array.from(ths).findIndex(th => th.dataset.sort === field);

    rows.sort((a, b) => {
        let aVal = a.cells[colIdx]?.textContent.trim() || '';
        let bVal = b.cells[colIdx]?.textContent.trim() || '';
        const aNum = parseFloat(aVal.replace(/[₹,]/g, ''));
        const bNum = parseFloat(bVal.replace(/[₹,]/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) {
            return dir === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    rows.forEach(row => tbody.appendChild(row));
}

function filterTable(tableId, query) {
    const tbody = document.querySelector(`#table-${tableId} tbody`);
    const rows = tbody.querySelectorAll('tr');
    const q = query.toLowerCase();
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

function filterStock(filter) {
    const tbody = document.querySelector('#table-stock tbody');
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const qtyCell = row.cells[6];
        if (!qtyCell) return;
        const qty = parseFloat(qtyCell.textContent.replace(/[₹,]/g, '')) || 0;
        if (filter === 'all') row.style.display = '';
        else if (filter === 'low') row.style.display = (qty >= 0 && qty < 5) ? '' : 'none';
        else if (filter === 'negative') row.style.display = qty < 0 ? '' : 'none';
    });
}

function showLoading() {
    const el = document.getElementById('loading');
    el.classList.remove('hidden');
}

function hideLoading(force) {
    const el = document.getElementById('loading');
    el.classList.add('hidden');
}
