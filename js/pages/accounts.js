// ==========================================================================
// PTL — Page: Accounts (Dashboard + Payments)
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast, formatDate, todayISO } = utils;

  const CURRENCIES = {
    EGP: { label: 'جنيه مصري', symbol: 'ج.م' },
    USD: { label: 'دولار',      symbol: '$'   },
    SAR: { label: 'ريال سعودي', symbol: 'ر.س' },
    AED: { label: 'درهم',        symbol: 'د.إ' },
  };

  const PAYMENT_TYPES = {
    deposit:     { label: 'دفعة مقدمة',  color: '#2d7a4a', bg: '#d4ebda' },
    installment: { label: 'قسط',          color: '#1e3a5f', bg: '#dde7f0' },
    final:       { label: 'دفعة نهائية',  color: '#704a1a', bg: '#fdf9f0' },
    extra:       { label: 'إضافي',        color: '#5a3a1e', bg: '#f4ede0' },
    refund:      { label: 'مرتجع',        color: '#a83232', bg: '#fdf2f2' },
    other:       { label: 'أخرى',          color: '#666666', bg: '#eeeeee' },
  };

  const PAYMENT_METHODS = {
    cash:           '💵 كاش',
    bank_transfer:  '🏦 تحويل بنكي',
    instapay:       '📱 InstaPay',
    vodafone_cash:  '📱 Vodafone Cash',
    paypal:         '💳 PayPal',
    wise:           '💳 Wise',
    other:          'أخرى',
  };

  let currentFilters = { author: null, type: null, period: 'all' };

  function fmtMoney(amount, currency) {
    const c = CURRENCIES[currency] || CURRENCIES.EGP;
    const num = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${num} ${c.symbol}`;
  }

  function startOfMonth(d) { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), 1).toISOString().slice(0,10); }
  function startOfYear(d)  { const x = new Date(d); return new Date(x.getFullYear(), 0, 1).toISOString().slice(0,10); }
  function daysFromNow(n)  { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }
  function daysBetween(from, to) {
    const a = new Date(from); a.setHours(0,0,0,0);
    const b = new Date(to);   b.setHours(0,0,0,0);
    return Math.round((b - a) / 86400000);
  }

  function sumByCurrency(payments) {
    const totals = {};
    payments.forEach(p => {
      const k = p.currency || 'EGP';
      totals[k] = (totals[k] || 0) + Number(p.amount || 0);
    });
    return totals;
  }

  function fmtMultiCurrency(totals) {
    const entries = Object.entries(totals).filter(([_, v]) => v > 0);
    if (entries.length === 0) return '—';
    return entries.map(([cur, val]) => fmtMoney(val, cur)).join(' · ');
  }

  // ---- MAIN RENDER ----------------------------------------------------------
  async function renderAccounts() {
    const today = todayISO();

    const [paymentsRes, plansRes, installmentsRes, authorsRes] = await Promise.all([
      sb.from('payments')
        .select('*, author:authors(id, name, phone), book:books(id, title)')
        .order('payment_date', { ascending: false }),
      sb.from('payment_plans').select('*'),
      sb.from('payment_plan_installments')
        .select('*, plan:payment_plans(currency, book:books(id, title, author:authors(id, name, phone)))')
        .eq('is_paid', false),
      sb.from('authors').select('id, name, phone').order('name'),
    ]);

    const payments = paymentsRes.data || [];
    const plans = plansRes.data || [];
    const installments = installmentsRes.data || [];
    const authors = authorsRes.data || [];

    const stats = computeStats(payments, plans, installments, today);
    const filtered = applyFilters(payments, today);

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Accounts</div>
          <h1 class="page-title">الحسابات</h1>
          <p class="page-sub">دفعات العملاء وخطط السداد</p>
        </div>
        ${PTL.perms.canEdit() ? `
          <button class="btn btn-primary" id="add-payment-btn" ${authors.length === 0 ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            تسجيل دفعة
          </button>
        ` : ''}
      </header>

      ${authors.length === 0 ? `
        <div class="alert alert-warn">
          <strong>لازم تضيف مؤلفين الأول.</strong> الدفعات بتتربط بالعملاء (= المؤلفين).
        </div>
      ` : renderStatsGrid(stats)}

      ${renderUpcomingPanel(stats.upcoming, today)}

      ${authors.length > 0 ? renderFiltersBar(authors) : ''}
      ${authors.length > 0 ? renderPaymentsList(filtered) : ''}
    `;

    wireUp(payments, authors);
  }

  // ---- STATS ----------------------------------------------------------------
  function computeStats(payments, plans, installments, today) {
    const monthStart = startOfMonth(today);

    const totalReceived = sumByCurrency(payments.filter(p => p.payment_type !== 'refund'));
    const thisMonth = sumByCurrency(payments.filter(p => p.payment_date >= monthStart && p.payment_type !== 'refund'));

    const outstanding = {};
    plans.forEach(plan => {
      const planInstallments = installments.filter(i => i.plan_id === plan.id);
      const remaining = planInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
      if (remaining > 0) outstanding[plan.currency] = (outstanding[plan.currency] || 0) + remaining;
    });

    const overdueInstallments = installments.filter(i => i.due_date && i.due_date < today);
    const overdue = {};
    overdueInstallments.forEach(i => {
      const planRow = plans.find(p => p.id === i.plan_id);
      const c = planRow?.currency || 'EGP';
      overdue[c] = (overdue[c] || 0) + Number(i.amount || 0);
    });

    const upcoming30 = daysFromNow(30);
    const upcoming = installments
      .filter(i => i.due_date && i.due_date >= today && i.due_date <= upcoming30)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    return {
      totalReceived, thisMonth, outstanding, overdue,
      paymentsCount: payments.length,
      thisMonthCount: payments.filter(p => p.payment_date >= monthStart).length,
      overdueCount: overdueInstallments.length,
      upcoming,
    };
  }

  function renderStatsGrid(s) {
    return `
      <div class="stats-grid stagger" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-bottom: 28px;">
        <div class="stat-card success">
          <div class="stat-label">إجمالي المُحصَّل</div>
          <div class="stat-value sm">${escapeHtml(fmtMultiCurrency(s.totalReceived))}</div>
          <div class="stat-meta">${s.paymentsCount} دفعة منذ البداية</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">هذا الشهر</div>
          <div class="stat-value sm">${escapeHtml(fmtMultiCurrency(s.thisMonth))}</div>
          <div class="stat-meta">${s.thisMonthCount} دفعة الشهر الحالي</div>
        </div>
        <div class="stat-card ${Object.keys(s.outstanding).length > 0 ? '' : 'success'}">
          <div class="stat-label">إجمالي المتبقي</div>
          <div class="stat-value sm">${escapeHtml(fmtMultiCurrency(s.outstanding))}</div>
          <div class="stat-meta">من خطط السداد المعتمدة</div>
        </div>
        <div class="stat-card ${s.overdueCount > 0 ? 'danger' : 'success'}">
          <div class="stat-label">متأخرات</div>
          <div class="stat-value sm ${s.overdueCount > 0 ? 'danger' : ''}">${s.overdueCount === 0 ? '✓' : escapeHtml(fmtMultiCurrency(s.overdue))}</div>
          <div class="stat-meta">${s.overdueCount === 0 ? 'مفيش متأخرات' : `${s.overdueCount} قسط متأخر`}</div>
        </div>
      </div>
    `;
  }

  // ---- UPCOMING PANEL -------------------------------------------------------
  function renderUpcomingPanel(upcoming, today) {
    if (upcoming.length === 0) return '';
    return `
      <section class="panel fade-in" style="margin-bottom: 28px;">
        <div class="panel-header">
          <h3 class="panel-title">دفعات قادمة <span class="panel-title-meta">· الـ 30 يوم الجاية</span></h3>
        </div>
        <div class="panel-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;">
            ${upcoming.slice(0, 6).map(i => renderUpcomingCard(i, today)).join('')}
          </div>
          ${upcoming.length > 6 ? `<div style="text-align:center; margin-top:12px; font-size:12.5px; color:var(--ink-500);">+ ${upcoming.length - 6} قسط آخر</div>` : ''}
        </div>
      </section>
    `;
  }

  function renderUpcomingCard(i, today) {
    const book = i.plan?.book;
    const author = book?.author;
    const days = daysBetween(today, i.due_date);
    const urgent = days <= 7;
    const cur = i.plan?.currency || 'EGP';

    return `
      <div style="padding:14px; background:${urgent ? '#fdf9f0' : 'var(--cream-50)'}; border:1px solid ${urgent ? '#e8d3a3' : 'var(--line)'}; border-right:3px solid ${urgent ? 'var(--warning)' : 'var(--gold-500)'}; border-radius:3px;">
        <div style="font-size:14px; font-weight:700; color:var(--navy-800); margin-bottom:3px;">${escapeHtml(i.label)}</div>
        <div style="font-size:18px; font-weight:700; color:var(--gold-700); margin:6px 0;">${escapeHtml(fmtMoney(i.amount, cur))}</div>
        <div style="font-size:12px; color:var(--ink-500); line-height:1.6;">
          ${author ? `👤 ${escapeHtml(author.name)}<br>` : ''}
          ${book ? `📚 ${escapeHtml(book.title)}<br>` : ''}
          📅 <span class="latin">${escapeHtml(formatDate(i.due_date))}</span>
          <span style="color:${urgent ? 'var(--warning)' : 'var(--ink-500)'}; font-weight:${urgent ? '700' : '400'};">
            (${days === 0 ? 'النهاردة' : days === 1 ? 'بكرة' : `بعد ${days} يوم`})
          </span>
        </div>
      </div>
    `;
  }

  // ---- FILTERS --------------------------------------------------------------
  function renderFiltersBar(authors) {
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; align-items:center;">
        <button class="filter-pill ${currentFilters.period === 'all' ? 'active' : ''}" data-filter="period" data-value="all">الكل</button>
        <button class="filter-pill ${currentFilters.period === 'this_month' ? 'active' : ''}" data-filter="period" data-value="this_month">هذا الشهر</button>
        <button class="filter-pill ${currentFilters.period === 'last_30' ? 'active' : ''}" data-filter="period" data-value="last_30">آخر 30 يوم</button>
        <button class="filter-pill ${currentFilters.period === 'this_year' ? 'active' : ''}" data-filter="period" data-value="this_year">هذه السنة</button>

        <div style="margin-right:auto; display:flex; gap:8px;">
          <select id="author-filter" style="padding:7px 12px; border:1px solid var(--line); border-radius:18px; font-size:13px; background:white;">
            <option value="">كل العملاء</option>
            ${authors.map(a => `<option value="${a.id}" ${currentFilters.author === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
          <select id="type-filter" style="padding:7px 12px; border:1px solid var(--line); border-radius:18px; font-size:13px; background:white;">
            <option value="">كل الأنواع</option>
            ${Object.entries(PAYMENT_TYPES).map(([k, v]) => `<option value="${k}" ${currentFilters.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }

  function applyFilters(payments, today) {
    let f = payments;
    if (currentFilters.author) f = f.filter(p => p.author_id === currentFilters.author);
    if (currentFilters.type)   f = f.filter(p => p.payment_type === currentFilters.type);
    if (currentFilters.period === 'this_month') f = f.filter(p => p.payment_date >= startOfMonth(today));
    else if (currentFilters.period === 'last_30')   f = f.filter(p => p.payment_date >= daysFromNow(-30));
    else if (currentFilters.period === 'this_year') f = f.filter(p => p.payment_date >= startOfYear(today));
    return f;
  }

  // ---- LIST -----------------------------------------------------------------
  function renderPaymentsList(payments) {
    if (payments.length === 0) {
      return `
        <div class="panel">
          <div class="empty-state">
            <div class="empty-state-icon">💰</div>
            <div class="empty-state-title">مفيش دفعات بالفلترة دي</div>
            <div class="empty-state-sub">${PTL.perms.canEdit() ? 'سجّل أول دفعة من زرار "تسجيل دفعة" فوق' : 'جرّب تغيير الفلترة'}</div>
          </div>
        </div>
      `;
    }

    const byMonth = {};
    payments.forEach(p => {
      const k = (p.payment_date || '').slice(0, 7);
      if (!byMonth[k]) byMonth[k] = [];
      byMonth[k].push(p);
    });

    const months = Object.keys(byMonth).sort().reverse();

    return `
      <div class="panel">
        <div class="panel-body" style="padding: 12px;">
          ${months.map(m => {
            const ps = byMonth[m];
            const totals = sumByCurrency(ps.filter(p => p.payment_type !== 'refund'));
            return `
              <div style="margin-bottom: 24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:var(--cream-50); border-radius:3px; margin-bottom:8px;">
                  <div style="font-size:13px; font-weight:700; color:var(--navy-800); text-transform:uppercase; letter-spacing:0.05em;">
                    ${escapeHtml(formatMonthLabel(m))} · ${ps.length} دفعة
                  </div>
                  <div style="font-size:13px; font-weight:700; color:var(--success);">
                    ${escapeHtml(fmtMultiCurrency(totals))}
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${ps.map(renderPaymentRow).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function formatMonthLabel(yyyymm) {
    if (!yyyymm) return '';
    const [year, month] = yyyymm.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
    return d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  }

  function renderPaymentRow(p) {
    const type = PAYMENT_TYPES[p.payment_type] || PAYMENT_TYPES.other;
    const method = PAYMENT_METHODS[p.payment_method] || p.payment_method;
    const isRefund = p.payment_type === 'refund';

    return `
      <div class="payment-row" data-id="${p.id}" style="display:grid; grid-template-columns: auto 1fr auto auto; gap:14px; align-items:center; padding:12px 14px; background:white; border:1px solid var(--line); border-right:3px solid ${type.color}; border-radius:3px; ${PTL.perms.canEdit() ? 'cursor:pointer;' : ''}">
        <div style="font-size:18px; font-weight:700; color:${isRefund ? 'var(--danger)' : 'var(--success)'}; min-width:120px;">
          ${isRefund ? '−' : '+'}${escapeHtml(fmtMoney(p.amount, p.currency))}
        </div>
        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:600; color:var(--navy-800); margin-bottom:3px;">
            ${p.author ? escapeHtml(p.author.name) : '—'}
            ${p.book ? `<span style="color:var(--ink-500); font-weight:400; font-size:12.5px;"> · ${escapeHtml(p.book.title)}</span>` : ''}
          </div>
          <div style="display:flex; gap:8px; align-items:center; font-size:12px; color:var(--ink-500); flex-wrap:wrap;">
            <span class="status-tag" style="background:${type.bg}; color:${type.color}; font-size:10.5px;">${type.label}</span>
            <span>${method}</span>
            ${p.reference ? `<span class="latin" style="color:var(--ink-400);">#${escapeHtml(p.reference)}</span>` : ''}
            ${p.notes ? `<span style="color:var(--ink-400);" title="${escapeHtml(p.notes)}">📝</span>` : ''}
          </div>
        </div>
        <div style="text-align:left; font-size:12.5px; color:var(--ink-500);" class="latin">
          ${escapeHtml(formatDate(p.payment_date))}
        </div>
        ${PTL.perms.canEdit() ? `
          <div style="display:flex; gap:4px;">
            <button class="btn-icon edit-payment" data-id="${p.id}" title="تعديل" onclick="event.stopPropagation();">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger delete-payment" data-id="${p.id}" title="حذف" onclick="event.stopPropagation();">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ---- WIRE-UP --------------------------------------------------------------
  function wireUp(payments, authors) {
    if (PTL.perms.canEdit()) {
      const addBtn = $('add-payment-btn');
      if (addBtn) addBtn.onclick = () => openPaymentModal(null, authors);

      document.querySelectorAll('.payment-row').forEach(row => {
        row.onclick = () => {
          const p = payments.find(p => p.id === row.dataset.id);
          if (p) openPaymentModal(p, authors);
        };
      });

      document.querySelectorAll('.edit-payment').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const p = payments.find(p => p.id === btn.dataset.id);
          if (p) openPaymentModal(p, authors);
        };
      });

      document.querySelectorAll('.delete-payment').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          deletePayment(btn.dataset.id);
        };
      });
    }

    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => {
        currentFilters.period = btn.dataset.value;
        renderAccounts();
      };
    });

    const af = $('author-filter');
    if (af) af.onchange = () => { currentFilters.author = af.value || null; renderAccounts(); };

    const tf = $('type-filter');
    if (tf) tf.onchange = () => { currentFilters.type = tf.value || null; renderAccounts(); };
  }

  // ---- ADD/EDIT MODAL -------------------------------------------------------
  async function openPaymentModal(payment, authors) {
    const isEdit = !!payment;
    const today = todayISO();

    let books = [];
    const initAuthor = payment?.author_id || authors[0]?.id;
    if (initAuthor) {
      const { data } = await sb.from('books')
        .select('id, title')
        .eq('author_id', initAuthor)
        .order('created_at', { ascending: false });
      books = data || [];
    }

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>العميل (المؤلف) <span class="req">*</span></label>
          <select id="m-author">
            <option value="">اختار عميل...</option>
            ${authors.map(a => `<option value="${a.id}" ${(payment?.author_id === a.id || (!isEdit && a.id === initAuthor)) ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>الكتاب <span class="opt">(اختياري)</span></label>
          <select id="m-book">
            <option value="">— غير مرتبط بكتاب —</option>
            ${books.map(b => `<option value="${b.id}" ${payment?.book_id === b.id ? 'selected' : ''}>${escapeHtml(b.title)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>المبلغ <span class="req">*</span></label>
          <input id="m-amount" type="number" min="0" step="0.01" value="${payment?.amount || ''}" placeholder="0.00" class="ltr" />
        </div>
        <div class="form-group">
          <label>العملة</label>
          <select id="m-currency">
            ${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${(payment?.currency || 'EGP') === k ? 'selected' : ''}>${v.label} (${v.symbol})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>تاريخ الدفع <span class="req">*</span></label>
          <input id="m-date" type="date" class="ltr" value="${payment?.payment_date || today}" />
        </div>
        <div class="form-group">
          <label>نوع الدفعة</label>
          <select id="m-type">
            ${Object.entries(PAYMENT_TYPES).map(([k, v]) => `<option value="${k}" ${(payment?.payment_type || 'installment') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>طريقة الدفع</label>
          <select id="m-method">
            ${Object.entries(PAYMENT_METHODS).map(([k, label]) => `<option value="${k}" ${(payment?.payment_method || 'cash') === k ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>رقم العملية <span class="opt">(reference)</span></label>
          <input id="m-reference" type="text" class="ltr" value="${escapeHtml(payment?.reference || '')}" placeholder="رقم الإيصال أو التحويل" />
        </div>
      </div>

      <div class="form-group">
        <label>ملاحظات</label>
        <textarea id="m-notes">${escapeHtml(payment?.notes || '')}</textarea>
      </div>

      <div class="form-group">
        <label>رابط الإيصال <span class="opt">(اختياري — Drive/Dropbox)</span></label>
        <input id="m-receipt" type="url" class="ltr" value="${escapeHtml(payment?.receipt_url || '')}" placeholder="https://drive.google.com/..." />
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? 'تعديل دفعة' : 'تسجيل دفعة جديدة',
      body, size: 'lg',
      saveLabel: isEdit ? 'حفظ التعديلات' : 'حفظ الدفعة',
      onSave: async () => savePayment(modal, payment),
    });

    modal.querySelector('#m-author').onchange = async (e) => {
      const id = e.target.value;
      const sel = modal.querySelector('#m-book');
      if (!id) { sel.innerHTML = '<option value="">— غير مرتبط بكتاب —</option>'; return; }
      sel.innerHTML = '<option value="">جاري التحميل...</option>';
      const { data } = await sb.from('books').select('id, title').eq('author_id', id).order('created_at', { ascending: false });
      sel.innerHTML = `
        <option value="">— غير مرتبط بكتاب —</option>
        ${(data || []).map(b => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join('')}
      `;
    };
  }

  async function savePayment(modal, payment) {
    const isEdit = !!payment;
    const author_id = modal.querySelector('#m-author').value;
    const amount = parseFloat(modal.querySelector('#m-amount').value);
    const payment_date = modal.querySelector('#m-date').value;

    if (!author_id) { toast('اختار العميل', 'error'); return false; }
    if (!amount || amount <= 0) { toast('المبلغ لازم يكون أكبر من صفر', 'error'); return false; }
    if (!payment_date) { toast('تاريخ الدفع مطلوب', 'error'); return false; }

    const payload = {
      author_id,
      book_id: modal.querySelector('#m-book').value || null,
      amount,
      currency: modal.querySelector('#m-currency').value,
      payment_date,
      payment_type: modal.querySelector('#m-type').value,
      payment_method: modal.querySelector('#m-method').value,
      reference: modal.querySelector('#m-reference').value.trim() || null,
      notes: modal.querySelector('#m-notes').value.trim() || null,
      receipt_url: modal.querySelector('#m-receipt').value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (isEdit) {
      const { error } = await sb.from('payments').update(payload).eq('id', payment.id);
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم حفظ التعديلات ✓');
    } else {
      payload.recorded_by = state.person.id;
      const { error } = await sb.from('payments').insert(payload);
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم تسجيل الدفعة ✓');
    }

    await renderAccounts();
    return true;
  }

  async function deletePayment(id) {
    const ok = await confirmDialog({
      title: 'حذف دفعة',
      message: 'هل أنت متأكد من حذف الدفعة دي؟ ده هيأثر على إجمالي الحسابات.',
      confirmLabel: 'احذف', destructive: true,
    });
    if (!ok) return;
    const { error } = await sb.from('payments').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast('تم الحذف');
    await renderAccounts();
  }

  PTL.routes['/accounts'] = renderAccounts;
})();
