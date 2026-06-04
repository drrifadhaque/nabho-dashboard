/* ═══════════════════════════════════════════
   NabhoDashboard — Supabase-Powered App v2
   ═══════════════════════════════════════════ */

const SB_URL = 'https://hrbutgotfglunmoxjlyb.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnV0Z290ZmdsdW5tb3hqbHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MjA4NzIsImV4cCI6MjA5NDM5Njg3Mn0.Fp8Fwa1NLyFssN4HcK4m9puUG1-FMchqaQMd7U7zuvs';
let sb;
try { sb = window.supabase.createClient(SB_URL, SB_KEY); } catch(e) { console.error('Supabase init failed:', e); }

let curDate = new Date().toISOString().split('T')[0];
let curStore = 'NabhoBazaarCoochBehar';
let loading = false;

const fmt = v => { const n = parseFloat(v)||0; return n===0?'₹0':'₹'+n.toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2}); };

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    setupNav();
    if (!sb) { setStatus('Supabase init failed', true); hideLoad(); return; }
    
    // Find the latest date with data
    try {
        const {data} = await sb.from('v_dates_with_data').select('date').order('date',{ascending:false}).limit(1);
        if (data && data.length) curDate = data[0].date;
    } catch(e) {}
    
    document.getElementById('datePicker').value = curDate;
    await loadAll();
    setTimeout(() => hideLoad(), 10000); // safety
});

function setupNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const s = link.dataset.section;
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
            document.getElementById('section-'+s).classList.add('active');
            const t = {overview:'Overview',cashbox:'CashBox',vendor_invoices:'Vendor Invoices',sales:'Sales',stock:'Stock',attendance:'Attendance',telegram_invoices:'Telegram Invoices',reconciliation:'Reconciliation'};
            document.getElementById('pageTitle').textContent = t[s]||s;
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('hamburger').classList.remove('active');
        });
    });
    
    const dp = document.getElementById('datePicker');
    dp.addEventListener('change', () => { curDate = dp.value; loadAll(); });
    document.getElementById('datePrev').addEventListener('click', () => { const d=new Date(curDate); d.setDate(d.getDate()-1); curDate=d.toISOString().split('T')[0]; dp.value=curDate; loadAll(); });
    document.getElementById('dateNext').addEventListener('click', () => { const d=new Date(curDate); d.setDate(d.getDate()+1); curDate=d.toISOString().split('T')[0]; dp.value=curDate; loadAll(); });
    document.getElementById('dateToday').addEventListener('click', () => { curDate=new Date().toISOString().split('T')[0]; dp.value=curDate; loadAll(); });
    document.getElementById('storeSelect').addEventListener('change', e => { curStore=e.target.value; loadAll(); });
    document.getElementById('hamburger').addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('hamburger').classList.toggle('active'); });
    
    // Search
    document.querySelectorAll('.search-input').forEach(inp => {
        inp.addEventListener('input', e => {
            const tb = document.querySelector('#table-'+inp.dataset.table+' tbody');
            if (!tb) return;
            const q = e.target.value.toLowerCase();
            tb.querySelectorAll('tr').forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
        });
    });
    
    // Stock filters
    document.querySelectorAll('.btn-filter[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-filter[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const f = btn.dataset.filter;
            document.querySelectorAll('#table-stock tbody tr').forEach(r => {
                const q = parseFloat(r.cells[6]?.textContent.replace(/[₹,]/g,''))||0;
                r.style.display = f==='all'?'':f==='low'?(q>=0&&q<5?'':'none'):q<0?'':'none';
            });
        });
    });
    
    // Sort
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const table = th.closest('.data-table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const idx = Array.from(table.querySelectorAll('th')).indexOf(th);
            const asc = !th.classList.contains('sorted-asc');
            table.querySelectorAll('th').forEach(t => t.classList.remove('sorted-asc','sorted-desc'));
            th.classList.add(asc?'sorted-asc':'sorted-desc');
            rows.sort((a,b) => {
                let av = a.cells[idx]?.textContent.trim()||'';
                let bv = b.cells[idx]?.textContent.trim()||'';
                const an = parseFloat(av.replace(/[₹,]/g,''));
                const bn = parseFloat(bv.replace(/[₹,]/g,''));
                if (!isNaN(an)&&!isNaN(bn)) return asc?an-bn:bn-an;
                return asc?av.localeCompare(bv):bv.localeCompare(av);
            });
            rows.forEach(r => tbody.appendChild(r));
        });
    });
}

async function loadAll() {
    if (loading) return;
    loading = true;
    showLoad();
    
    try {
        const sf = curStore === 'all' ? undefined : curStore;
        const q = table => {
            let query = sb.from(table).select('*').eq('date', curDate);
            if (sf) query = query.eq('store', sf);
            return query.then(({data,error}) => { if(error) console.warn(table,error); return data||[]; });
        };
        const qStock = () => {
            let query = sb.from('stock').select('*').limit(5000);
            if (sf) query = query.eq('store', sf);
            return query.then(({data,error}) => { if(error) console.warn('stock',error); return data||[]; });
        };
        
        const [cb, vi, sl, st, att, tg, rc, sm] = await Promise.allSettled([
            q('cashbox'), q('vendor_invoices'), q('sales'), qStock(),
            q('attendance'), q('telegram_invoices'), q('reconciliation'),
            sb.from('daily_summaries').select('*').eq('date', curDate).limit(1).then(r => r.data?.[0]||null)
        ]);
        
        const cashbox = cb.status==='fulfilled'?cb.value:[];
        const vendorInvoices = vi.status==='fulfilled'?vi.value:[];
        const sales = sl.status==='fulfilled'?sl.value:[];
        const stock = st.status==='fulfilled'?st.value:[];
        const attendance = att.status==='fulfilled'?att.value:[];
        const telegramInvoices = tg.status==='fulfilled'?tg.value:[];
        const reconciliation = rc.status==='fulfilled'?rc.value:[];
        const summary = sm.status==='fulfilled'?sm.value:null;
        
        renderOverview(cashbox, vendorInvoices, sales, stock, reconciliation, summary);
        renderCashbox(cashbox);
        renderVI(vendorInvoices);
        renderSales(sales);
        renderStock(stock);
        renderAtt(attendance);
        renderTG(telegramInvoices);
        renderRecon(reconciliation);
        
        setStatus('Connected to Supabase', false);
    } catch(e) {
        console.error('Load error:', e);
        setStatus('Error loading data', true);
    }
    loading = false;
    hideLoad();
}

// ─── Renderers ───
function renderOverview(cb, vi, sl, st, rc, sm) {
    // Use daily_summaries for sales if available (from CashBox), fallback to Vyapar sales table
    let totalSales, txnCount, cashSales, upiSales;
    if (sm && (sm.total_sales > 0 || sm.txn_count > 0)) {
        totalSales = sm.total_sales || 0;
        txnCount = sm.txn_count || 0;
        cashSales = sm.cash_sales || 0;
        upiSales = sm.upi_sales || 0;
    } else {
        totalSales = sl.reduce((s,r) => s+(parseFloat(r.total)||0), 0);
        txnCount = sl.length;
        cashSales = sl.filter(r=>!r.payment||r.payment.toLowerCase().includes('cash')).reduce((s,r)=>s+(parseFloat(r.total)||0),0);
        upiSales = totalSales - cashSales;
    }
    const p = sm?.total_profit||0;
    document.getElementById('kpi-sales').textContent = fmt(totalSales);
    document.getElementById('kpi-sales-txn').textContent = txnCount+' transactions (Cash '+fmt(cashSales)+' + UPI '+fmt(upiSales)+')';
    document.getElementById('kpi-profit').textContent = fmt(p);
    document.getElementById('kpi-profit-margin').textContent = totalSales>0?((p/totalSales*100).toFixed(1)+'% margin'):'0%';
    document.getElementById('kpi-stock').textContent = fmt(sm?.total_stock_value);
    document.getElementById('kpi-stock-items').textContent = st.length+' items';
    document.getElementById('kpi-vendor').textContent = fmt(vi.reduce((s,r) => s+(parseFloat(r.amount)||0), 0));
    document.getElementById('kpi-vendor-count').textContent = vi.length+' invoices';
    document.getElementById('kpi-discrepancies').textContent = rc.filter(r=>r.status!=='PASS').length;
    document.getElementById('kpi-discrepancies-detail').textContent = rc.filter(r=>r.status!=='PASS').length===0?'All checks passed':rc.filter(r=>r.status!=='PASS').length+' issues';
    document.getElementById('kpi-closing-cash').textContent = fmt(sm?.closing_cash||0);
    document.getElementById('kpi-closing-cash-detail').textContent = 'Opening: '+fmt(sm?.opening_cash||0);
    document.getElementById('kpi-closing-upi').textContent = fmt(sm?.closing_upi||0);
    document.getElementById('kpi-closing-upi-detail').textContent = 'Opening: '+fmt(sm?.opening_upi||0);
    
    // Overview cashbox
    const ovCb = document.getElementById('overviewCashbox');
    if (cb.length) {
        ovCb.innerHTML = '<table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>'+cb.slice(-5).map(r => {
            const a = (parseFloat(r.cash_in)||0)+(parseFloat(r.upi_in)||0)-(parseFloat(r.cash_out)||0)-(parseFloat(r.upi_out)||0);
            return '<tr><td>'+(r.time||'')+'</td><td>'+(r.transaction_type||'')+'</td><td>'+(r.description||'')+'</td><td class="num '+(a>=0?'positive':'negative')+'">'+fmt(a)+'</td></tr>';
        }).join('')+'</tbody></table>';
    } else { ovCb.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No cashbox data</p></div>'; }
    
    // Overview recon
    const ovRc = document.getElementById('overviewRecon');
    if (rc.length) {
        ovRc.innerHTML = rc.map(r => '<div class="recon-card '+(r.status==='PASS'?'pass':'fail')+'" style="margin-bottom:8px;padding:12px;"><span class="recon-title">'+(r.status==='PASS'?'✅':'❌')+' '+r.check_type+'</span><span class="recon-status" style="float:right;color:'+(r.status==='PASS'?'var(--green)':'var(--red)')+'">'+r.status+'</span>'+(r.details?'<div class="recon-detail">'+r.details+'</div>':'')+'</div>').join('');
    } else { ovRc.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No reconciliation data</p></div>'; }
    
    // Charts
    renderCharts(sl);
}

function renderCashbox(rows) {
    const tb = document.querySelector('#table-cashbox tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('cashbox'); return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.time||'')+'</td><td>'+(r.transaction_type||'')+'</td><td>'+(r.ref||'')+'</td><td>'+(r.description||'')+'</td><td class="num">'+fmt(r.cash_in)+'</td><td class="num">'+fmt(r.cash_out)+'</td><td class="num">'+fmt(r.upi_in)+'</td><td class="num">'+fmt(r.upi_out)+'</td><td class="num">'+fmt(r.owner_paid)+'</td><td class="num">'+fmt(r.running_cash)+'</td><td class="num">'+fmt(r.running_upi)+'</td><td class="num">'+fmt(r.total)+'</td></tr>').join('');
    summaryChips('cashboxSummary', [{l:'Cash In',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.cash_in)||0),0))},{l:'Cash Out',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.cash_out)||0),0))},{l:'UPI In',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.upi_in)||0),0))},{l:'UPI Out',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.upi_out)||0),0))},{l:'Rows',v:rows.length}]);
}

function renderVI(rows) {
    const tb = document.querySelector('#table-vendor_invoices tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('vendor_invoices'); return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.vendor||'')+'</td><td>'+(r.invoice_no||'')+'</td><td>'+(r.bill_date||'')+'</td><td>'+(r.purchase_date||'')+'</td><td>'+(r.clear_date||'')+'</td><td class="num">'+fmt(r.amount)+'</td><td class="num">'+fmt(r.cash_paid)+'</td><td class="num">'+fmt(r.owner_paid)+'</td><td class="num '+(parseFloat(r.due)>0?'negative':'')+'">'+fmt(r.due)+'</td><td>'+(r.payment_method||'')+'</td></tr>').join('');
    summaryChips('vendorInvoicesSummary', [{l:'Total',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0))},{l:'Due',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.due)||0),0))},{l:'Invoices',v:rows.length}]);
}

function renderSales(rows) {
    const tb = document.querySelector('#table-sales tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('sales'); return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.ref||'')+'</td><td>'+(r.party||'')+'</td><td>'+(r.type||'')+'</td><td class="num">'+fmt(r.total)+'</td><td>'+(r.payment||'')+'</td><td class="num">'+fmt(r.paid)+'</td><td class="num">'+fmt(r.received)+'</td><td class="num '+(parseFloat(r.balance)>0?'negative':'')+'">'+fmt(r.balance)+'</td></tr>').join('');
    summaryChips('salesSummary', [{l:'Total',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.total)||0),0))},{l:'Received',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.received)||0),0))},{l:'Txns',v:rows.length}]);
}

function renderStock(rows) {
    const tb = document.querySelector('#table-stock tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('stock'); return; }
    tb.innerHTML = rows.map(r => { const st=(parseFloat(r.qty)||0)<0?'negative':(parseFloat(r.qty)||0)<5?'low':'ok'; return '<tr><td>'+(r.item_name||'')+'</td><td>'+(r.barcode||'')+'</td><td>'+(r.hsn||'')+'</td><td class="num">'+fmt(r.mrp)+'</td><td class="num">'+fmt(r.sale_price)+'</td><td class="num">'+fmt(r.purchase_price)+'</td><td class="num"><span class="badge badge-'+st+'">'+(r.qty||0)+'</span></td><td class="num">'+fmt(r.stock_value)+'</td><td><span class="badge badge-'+st+'">'+st.toUpperCase()+'</span></td></tr>'; }).join('');
    summaryChips('stockSummary', [{l:'Value',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.stock_value)||0),0))},{l:'Items',v:rows.length},{l:'Low',v:rows.filter(r=>(parseFloat(r.qty)||0)<5&&(parseFloat(r.qty)||0)>=0).length},{l:'Negative',v:rows.filter(r=>(parseFloat(r.qty)||0)<0).length}]);
}

function renderAtt(rows) {
    const tb = document.querySelector('#table-attendance tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('attendance'); return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.employee||'')+'</td><td>'+(r.check_in||'-')+'</td><td>'+(r.check_out||'-')+'</td><td>'+(r.work_hours||0)+'</td><td>'+(r.break_hours||0)+'</td><td>'+(r.leave||'-')+'</td></tr>').join('');
    summaryChips('attendanceSummary', [{l:'Employees',v:rows.length},{l:'Hours',v:rows.reduce((s,r)=>s+(parseFloat(r.work_hours)||0),0).toFixed(1)+'h'}]);
}

function renderTG(rows) {
    const tb = document.querySelector('#table-telegram_invoices tbody');
    if (!rows.length) { tb.innerHTML = emptyRow('telegram_invoices'); return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.sender||'')+'</td><td>'+(r.invoice_no||'')+'</td><td class="num">'+fmt(r.amount)+'</td><td>'+(r.payment_method||'')+'</td><td>'+(r.bill_date||'')+'</td><td>'+(r.clear_date||'')+'</td></tr>').join('');
    summaryChips('telegramInvoicesSummary', [{l:'Total',v:fmt(rows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0))},{l:'Invoices',v:rows.length}]);
}

function renderRecon(rows) {
    const tb = document.querySelector('#table-reconciliation tbody');
    const cards = document.getElementById('reconCards');
    if (!rows.length) { tb.innerHTML = emptyRow('reconciliation'); cards.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No reconciliation data</p></div>'; return; }
    tb.innerHTML = rows.map(r => '<tr><td>'+(r.check_type||'')+'</td><td><span class="badge badge-'+(r.status==='PASS'?'pass':'fail')+'">'+r.status+'</span></td><td class="num">'+fmt(r.expected)+'</td><td class="num">'+fmt(r.actual)+'</td><td class="num '+(parseFloat(r.discrepancy)!==0?'negative':'')+'">'+fmt(r.discrepancy)+'</td><td>'+(r.details||'')+'</td></tr>').join('');
    cards.innerHTML = rows.map(r => { const c=r.status==='PASS'?'pass':r.status==='WARN'?'warn':'fail'; return '<div class="recon-card '+c+'"><div class="recon-title">'+(r.status==='PASS'?'✅':r.status==='WARN'?'⚠️':'❌')+' '+r.check_type+'</div><div class="recon-status" style="color:'+(c==='pass'?'var(--green)':c==='warn'?'var(--orange)':'var(--red)')+'">'+r.status+'</div>'+(r.details?'<div class="recon-detail">'+r.details+'</div>':'')+'</div>'; }).join('');
}

async function renderCharts(sales) {
    // Destroy existing charts first
    const existingTrend = Chart.getChart(document.getElementById('chartSalesTrend'));
    if (existingTrend) existingTrend.destroy();
    const existingMix = Chart.getChart(document.getElementById('chartPaymentMix'));
    if (existingMix) existingMix.destroy();
    
    // Sales trend
    try {
        const {data} = await sb.from('daily_summaries').select('date,total_sales,total_profit').order('date');
        if (data && data.length) {
            const canvas = document.getElementById('chartSalesTrend');
            if (canvas) {
                canvas.style.height = '250px';
                canvas.style.maxHeight = '250px';
                const ctx = canvas.getContext('2d');
                new Chart(ctx, { type: 'line', data: {
                    labels: data.map(r => { const d=new Date(r.date); return d.getDate()+'/'+(d.getMonth()+1); }),
                    datasets: [
                        {label:'Sales',data:data.map(r=>parseFloat(r.total_sales)||0),borderColor:'#0070f3',backgroundColor:'rgba(0,112,243,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:3},
                        {label:'Profit',data:data.map(r=>parseFloat(r.total_profit)||0),borderColor:'#00d68f',backgroundColor:'rgba(0,214,143,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:3}
                    ]
                }, options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#a1a1a1',font:{size:11}}}}, scales:{x:{ticks:{color:'#666',font:{size:10},maxRotation:45},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'#666',font:{size:10},callback:v=>'₹'+v.toLocaleString()},grid:{color:'rgba(255,255,255,0.04)'}}} } });
            }
        }
    } catch(e) { console.warn('Sales trend chart error:', e); }
    
    // Payment mix
    try {
        const cash = sales.filter(r=>!r.payment||r.payment.toLowerCase().includes('cash')).reduce((s,r)=>s+(parseFloat(r.total)||0),0);
        const upi = sales.filter(r=>r.payment&&r.payment.toLowerCase().includes('upi')).reduce((s,r)=>s+(parseFloat(r.total)||0),0);
        const other = sales.reduce((s,r)=>s+(parseFloat(r.total)||0),0)-cash-upi;
        const canvas = document.getElementById('chartPaymentMix');
        if (canvas) {
            canvas.style.height = '250px';
            canvas.style.maxHeight = '250px';
            const ctx = canvas.getContext('2d');
            new Chart(ctx, { type:'doughnut', data:{labels:['Cash','UPI','Other'],datasets:[{data:[cash,upi,Math.max(0,other)],backgroundColor:['#0070f3','#00d68f','#7928ca'],borderColor:'rgba(17,17,17,0.8)',borderWidth:3}]}, options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'#a1a1a1',padding:16,font:{size:11}}}}} });
        }
    } catch(e) { console.warn('Payment mix chart error:', e); }
}

// ─── Helpers ───
function emptyRow(table) { const cols = document.querySelectorAll('#table-'+table+' th').length; return '<tr><td colspan="'+cols+'" style="text-align:center;padding:40px;color:#666">No data for this date</td></tr>'; }
function summaryChips(id, chips) { const el=document.getElementById(id); if(el) el.innerHTML = chips.map(c=>'<div class="summary-chip"><span class="chip-label">'+c.l+'</span><span class="chip-value">'+c.v+'</span></div>').join(''); }
function setStatus(msg, err) { document.getElementById('connectionStatus').textContent = msg; const dot = document.querySelector('.status-dot'); if(err){dot.classList.add('error');dot.classList.remove('online');}else{dot.classList.add('online');dot.classList.remove('error');} }
function showLoad() { document.getElementById('loading').style.display = 'flex'; document.getElementById('loading').style.opacity = '1'; document.getElementById('loading').style.pointerEvents = 'auto'; }
function hideLoad() { document.getElementById('loading').style.display = 'none'; document.getElementById('loading').style.opacity = '0'; document.getElementById('loading').style.pointerEvents = 'none'; }
