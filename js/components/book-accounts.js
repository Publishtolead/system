// ==========================================================================
// PTL — Component: Book Accounts
// ==========================================================================
// Renders the financial section inside book detail page:
//   - Total / paid / remaining + progress bar
//   - Installments list with status (paid/pending/overdue)
//   - Recent payments for this book
//   - Quick actions: record payment, edit plan
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { escapeHtml, openModal, confirmDialog, toast, formatDate, todayISO } = utils;

  const bookAccounts = {};

  // ============================================================================
  // LOAD & RENDER
  // ============================================================================
  bookAccounts.load = async function(bookId, mountId, book) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    // Fetch plan + installments + payments for this book
    const [planRes, paymentsRes] = await Promise.all([
      sb.from('payment_plans')
        .select('*, installments:payment_plan_installments(*)')
        .eq('book_id', bookId)
        .maybeSingle(),
      sb.from('payments')
        .select('*')
        .eq('book_id', bookId)
        .order('payment_date', { ascending: false }),
    ]);

    const plan = planRes.data;
    const payments = paymentsRes.data || [];

    render(mount, bookId, book, plan, payments);
  };

  function render(mount, bookId, book, plan, payments) {
    const today = todayISO();
    const rate = Number(PTL.settings?.exchange_rate_usd_egp || 50);

    // If no plan exists at all
    if (!plan) {
      mount.innerHTML = renderNoPlan(bookId, book);
      wireNoPlan(mount, bookId, book);
      return;
    }

    // Sort installments by order
    const installments = (plan.installments || []).slice().sort((a, b) => a.installment_order - b.installment_order);

    // Compute totals (in plan's currency)
    const total = Number(plan.total_amount || 0);
    const paid = payments
      .filter(p => p.payment_type !== 'refund' && p.currency === plan.currency)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = Math.max(0, total - paid);
    const progressPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

    mount.innerHTML = `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الحسابات والدفعات <span class="panel-title-meta">· خطة سداد ${installments.length} أقساط</span></h3>
          ${PTL.perms.canEdit() ? `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" id="edit-plan-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                تعديل الخطة
              </button>
              <button class="btn btn-primary btn-sm" id="record-payment-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
                تسجيل دفعة
              </button>
            </div>
          ` : ''}
        </div>
        <div class="panel-body">
          ${renderSummaryCards(total, paid, remaining, plan.currency, rate)}
          ${renderProgressBar(progressPct, paid, total, plan.currency)}
          ${renderInstallmentsList(installments, payments, plan.currency, today, rate)}
          ${payments.length > 0 ? renderRecentPaymentsForBook(payments, rate) : ''}
        </div>
      </section>
    `;

    wireUpAccounts(mount, bookId, book, plan, installments, payments);
  }

  // ============================================================================
  // NO PLAN STATE
  // ============================================================================
  function renderNoPlan(bookId, book) {
    const hasPriceSet = book?.total_price_usd != null && Number(book.total_price_usd) > 0;
    return `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الحسابات والدفعات</h3>
        </div>
        <div class="panel-body">
          <div class="empty-state" style="padding:30px;">
            <div style="font-size:32px; margin-bottom:8px;">💰</div>
            <div class="empty-state-title">مفيش خطة دفع للكتاب ده</div>
            <div class="empty-state-sub" style="margin-bottom:14px;">
              ${hasPriceSet
                ? `سعر الكتاب: <strong>$${Number(book.total_price_usd).toLocaleString('en-US')}</strong> — تقدر تنشئ خطة دفع دلوقتي`
                : 'لازم تحدد سعر الكتاب الأول من زرار "تعديل بيانات الكتاب" فوق'}
            </div>
            ${PTL.perms.canEdit() && hasPriceSet ? `
              <button class="btn btn-primary btn-sm" id="create-plan-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
                إنشاء خطة دفع
              </button>
            ` : ''}
          </div>
        </div>
      </section>
    `;
  }

  function wireNoPlan(mount, bookId, book) {
    const btn = mount.querySelector('#create-plan-btn');
    if (btn) {
      btn.onclick = () => openCreatePlanModal(bookId, book);
    }
  }

  // ============================================================================
  // SUMMARY CARDS
  // ============================================================================
  function renderSummaryCards(total, paid, remaining, currency, rate) {
    const sym = currency === 'USD' ? '$' : (currency === 'EGP' ? 'ج.م' : currency);
    const fmt = (v) => `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${sym}`;
    const fmtEgp = (v) => currency === 'USD'
      ? `<div style="font-size:11px; color:var(--ink-500); font-weight:400; margin-top:2px;" class="latin">≈ ${Math.round(Number(v) * rate).toLocaleString('en-US')} ج.م</div>`
      : '';

    return `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:18px;">
        <div style="padding:14px 16px; background:var(--cream-50); border:1px solid var(--line); border-right:3px solid var(--gold-500); border-radius:3px;">
          <div style="font-size:12px; color:var(--ink-500); font-weight:600; margin-bottom:4px;">الإجمالي</div>
          <div style="font-size:20px; font-weight:700; color:var(--navy-800);">${fmt(total)}</div>
          ${fmtEgp(total)}
        </div>
        <div style="padding:14px 16px; background:#f0f9f3; border:1px solid #b8d8c2; border-right:3px solid var(--success); border-radius:3px;">
          <div style="font-size:12px; color:var(--ink-500); font-weight:600; margin-bottom:4px;">المُحصَّل</div>
          <div style="font-size:20px; font-weight:700; color:var(--success);">${fmt(paid)}</div>
          ${fmtEgp(paid)}
        </div>
        <div style="padding:14px 16px; background:${remaining > 0 ? '#fdf9f0' : '#f0f9f3'}; border:1px solid ${remaining > 0 ? '#e8d3a3' : '#b8d8c2'}; border-right:3px solid ${remaining > 0 ? 'var(--warning)' : 'var(--success)'}; border-radius:3px;">
          <div style="font-size:12px; color:var(--ink-500); font-weight:600; margin-bottom:4px;">المتبقي</div>
          <div style="font-size:20px; font-weight:700; color:${remaining > 0 ? 'var(--warning)' : 'var(--success)'};">${remaining > 0 ? fmt(remaining) : '✓ مكتمل'}</div>
          ${remaining > 0 ? fmtEgp(remaining) : ''}
        </div>
      </div>
    `;
  }

  // ============================================================================
  // PROGRESS BAR
  // ============================================================================
  function renderProgressBar(pct, paid, total, currency) {
    return `
      <div style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size:12px; color:var(--ink-500); font-weight:600;">نسبة الإنجاز المالي</div>
          <div style="font-size:14px; font-weight:700; color:${pct === 100 ? 'var(--success)' : 'var(--gold-700)'};">${pct}%</div>
        </div>
        <div style="height:10px; background:var(--cream-100); border-radius:5px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:linear-gradient(90deg, var(--gold-500), ${pct === 100 ? 'var(--success)' : 'var(--gold-700)'}); transition:width 0.4s;"></div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // INSTALLMENTS LIST
  // ============================================================================
  function renderInstallmentsList(installments, payments, currency, today, rate) {
    if (installments.length === 0) {
      return `<div style="text-align:center; padding:20px; color:var(--ink-500); font-size:13px;">مفيش أقساط في الخطة</div>`;
    }

    const sym = currency === 'USD' ? '$' : (currency === 'EGP' ? 'ج.م' : currency);

    return `
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">
          الأقساط (${installments.length})
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${installments.map((inst, idx) => renderInstallmentRow(inst, idx, currency, sym, today, rate, payments)).join('')}
        </div>
      </div>
    `;
  }

  function renderInstallmentRow(inst, idx, currency, sym, today, rate, allPayments) {
    const isPaid = inst.is_paid;
    const isOverdue = !isPaid && inst.due_date && inst.due_date < today;
    const linkedPayment = inst.paid_payment_id ? allPayments.find(p => p.id === inst.paid_payment_id) : null;

    const status = isPaid
      ? { color: 'var(--success)', bg: '#f0f9f3', border: '#b8d8c2', icon: '✓', label: 'مدفوع' }
      : isOverdue
        ? { color: 'var(--danger)', bg: '#fdf2f2', border: '#f5c2c2', icon: '⚠', label: 'متأخر' }
        : { color: 'var(--ink-500)', bg: 'white', border: 'var(--line)', icon: '○', label: 'معلق' };

    const fmtAmount = `${Number(inst.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${sym}`;
    const egpAmount = currency === 'USD'
      ? `<span style="font-size:11px; color:var(--ink-500); font-weight:400;" class="latin">≈ ${Math.round(Number(inst.amount) * rate).toLocaleString('en-US')} ج.م</span>`
      : '';

    return `
      <div data-installment-id="${inst.id}" style="display:grid; grid-template-columns: 38px 1fr auto auto; gap:14px; align-items:center; padding:12px 14px; background:${status.bg}; border:1px solid ${status.border}; border-right:3px solid ${status.color}; border-radius:3px;">
        <div style="width:30px; height:30px; border-radius:50%; background:${status.color}; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">
          ${idx + 1}
        </div>
        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--navy-800); margin-bottom:2px;">
            ${escapeHtml(inst.label)}
            <span class="status-tag" style="background:transparent; color:${status.color}; font-size:10.5px; padding:0; margin-right:6px;">${status.icon} ${status.label}</span>
          </div>
          <div style="font-size:11.5px; color:var(--ink-500);">
            ${inst.due_date
              ? `📅 <span class="latin">${escapeHtml(formatDate(inst.due_date))}</span>${isOverdue ? `<span style="color:var(--danger); font-weight:700;"> (متأخر ${Math.abs(daysBetween(today, inst.due_date))} يوم)</span>` : ''}`
              : '📅 بدون تاريخ مستحق'}
            ${linkedPayment ? `<br>💳 تم الدفع في <span class="latin">${escapeHtml(formatDate(linkedPayment.payment_date))}</span>` : ''}
          </div>
        </div>
        <div style="text-align:left;">
          <div style="font-size:16px; font-weight:700; color:${status.color};">${fmtAmount}</div>
          ${egpAmount}
        </div>
        ${PTL.perms.canEdit() && !isPaid ? `
          <button class="btn btn-gold btn-sm pay-installment-btn" data-id="${inst.id}" style="white-space:nowrap;">
            تسجيل دفعة
          </button>
        ` : '<div></div>'}
      </div>
    `;
  }

  function daysBetween(from, to) {
    const a = new Date(from); a.setHours(0,0,0,0);
    const b = new Date(to);   b.setHours(0,0,0,0);
    return Math.round((b - a) / 86400000);
  }

  // ============================================================================
  // RECENT PAYMENTS FOR THIS BOOK
  // ============================================================================
  function renderRecentPaymentsForBook(payments, rate) {
    const recent = payments.slice(0, 5);
    return `
      <div style="margin-top:6px; padding-top:18px; border-top:1px dashed var(--line);">
        <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">
          آخر الدفعات (${payments.length})
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${recent.map(p => {
            const isRefund = p.payment_type === 'refund';
            const sym = p.currency === 'USD' ? '$' : (p.currency === 'EGP' ? 'ج.م' : p.currency);
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:white; border:1px solid var(--line); border-radius:3px; font-size:13px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="font-size:16px; font-weight:700; color:${isRefund ? 'var(--danger)' : 'var(--success)'};">
                    ${isRefund ? '−' : '+'}${Number(p.amount).toLocaleString('en-US')} ${sym}
                  </div>
                  ${p.payment_method ? `<span style="font-size:11px; color:var(--ink-500);">${escapeHtml(p.payment_method)}</span>` : ''}
                  ${p.notes ? `<span style="font-size:11px; color:var(--ink-400);" title="${escapeHtml(p.notes)}">📝</span>` : ''}
                </div>
                <div style="font-size:12px; color:var(--ink-500);" class="latin">${escapeHtml(formatDate(p.payment_date))}</div>
              </div>
            `;
          }).join('')}
        </div>
        ${payments.length > 5 ? `
          <div style="text-align:center; margin-top:10px;">
            <a href="#/accounts" style="font-size:12px; color:var(--gold-700); text-decoration:none; font-weight:600;">عرض كل الدفعات في صفحة الحسابات →</a>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ============================================================================
  // WIRE-UP
  // ============================================================================
  function wireUpAccounts(mount, bookId, book, plan, installments, payments) {
    const editBtn = mount.querySelector('#edit-plan-btn');
    if (editBtn) editBtn.onclick = () => openEditPlanModal(bookId, book, plan, installments);

    const recordBtn = mount.querySelector('#record-payment-btn');
    if (recordBtn) recordBtn.onclick = () => openRecordPaymentModal(bookId, book, null, installments);

    mount.querySelectorAll('.pay-installment-btn').forEach(btn => {
      btn.onclick = () => {
        const inst = installments.find(i => i.id === btn.dataset.id);
        openRecordPaymentModal(bookId, book, inst, installments);
      };
    });
  }

  // ============================================================================
  // CREATE PLAN MODAL (when no plan exists)
  // ============================================================================
  async function openCreatePlanModal(bookId, book) {
    const template = PTL.settings?.default_payment_plan || [];
    const totalUsd = Number(book.total_price_usd || 0);

    const body = `
      <div class="alert alert-info" style="margin-bottom:14px; font-size:12.5px;">
        النظام هيعمل خطة دفع للكتاب بسعر <strong>$${totalUsd.toLocaleString('en-US')}</strong>
        موزّعة على ${template.length} أقساط حسب الإعدادات الافتراضية. تقدر تعدّلها بعدين.
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${template.map((t, idx) => {
          const amount = Math.round(totalUsd * (t.percentage / 100) * 100) / 100;
          return `
            <div style="display:grid; grid-template-columns: 32px 1fr auto auto; gap:10px; align-items:center; padding:10px 12px; background:var(--cream-50); border-radius:3px; font-size:13px;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--navy-800); color:var(--gold-400); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${t.order || (idx + 1)}</div>
              <div style="font-weight:600;">${escapeHtml(t.label)}</div>
              <div style="color:var(--ink-500); font-size:12px;">${t.percentage}%</div>
              <div style="font-weight:700; color:var(--gold-700);">$${amount.toLocaleString('en-US')}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const { modal } = openModal({
      title: 'إنشاء خطة دفع',
      body, size: 'md',
      saveLabel: 'إنشاء الخطة',
      onSave: async () => {
        const { data: plan, error } = await sb.from('payment_plans').insert({
          book_id: bookId,
          total_amount: totalUsd,
          currency: 'USD',
        }).select().single();

        if (error) { toast(error.message, 'error'); return false; }

        const installments = template.map(t => ({
          plan_id: plan.id,
          installment_order: t.order,
          label: t.label,
          amount: Math.round(totalUsd * (t.percentage / 100) * 100) / 100,
          due_date: null,
        }));

        const { error: instErr } = await sb.from('payment_plan_installments').insert(installments);
        if (instErr) { toast(instErr.message, 'error'); return false; }

        toast('تم إنشاء خطة الدفع ✓');
        await bookAccounts.load(bookId, 'accounts-mount', book);
        return true;
      },
    });
  }

  // ============================================================================
  // EDIT PLAN MODAL
  // ============================================================================
  function openEditPlanModal(bookId, book, plan, installments) {
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>الإجمالي</label>
          <input id="m-total" type="number" min="0" step="0.01" value="${plan.total_amount}" class="ltr" />
        </div>
        <div class="form-group">
          <label>العملة</label>
          <select id="m-currency">
            <option value="USD" ${plan.currency === 'USD' ? 'selected' : ''}>دولار ($)</option>
            <option value="EGP" ${plan.currency === 'EGP' ? 'selected' : ''}>جنيه (ج.م)</option>
            <option value="SAR" ${plan.currency === 'SAR' ? 'selected' : ''}>ريال سعودي</option>
            <option value="AED" ${plan.currency === 'AED' ? 'selected' : ''}>درهم</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label style="margin:0;">الأقساط</label>
          <button type="button" id="add-inst-btn" class="btn btn-ghost btn-sm">+ إضافة قسط</button>
        </div>
        <div id="installments-list" style="display:flex; flex-direction:column; gap:8px;">
          ${installments.map((inst, idx) => renderEditInstRow(inst, idx, false)).join('')}
        </div>
      </div>

      <div class="alert alert-info" style="margin-bottom:0; font-size:12.5px;">
        💡 الأقساط المدفوعة بالفعل لا يمكن حذفها. تقدر تعدّل المبالغ والتواريخ بحرية.
      </div>
    `;

    const { modal } = openModal({
      title: 'تعديل خطة الدفع',
      body, size: 'lg',
      saveLabel: 'حفظ الخطة',
      onSave: async () => savePlanEdits(modal, bookId, book, plan, installments),
    });

    const list = modal.querySelector('#installments-list');

    // Add installment
    modal.querySelector('#add-inst-btn').onclick = () => {
      const newIdx = list.querySelectorAll('.edit-inst-row').length;
      const tmp = document.createElement('div');
      tmp.innerHTML = renderEditInstRow({ id: `new-${Date.now()}`, label: '', amount: 0, due_date: null, is_paid: false }, newIdx, true);
      list.appendChild(tmp.firstElementChild);
    };

    // Remove installment (only unpaid)
    list.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-inst-edit');
      if (!removeBtn) return;
      const row = removeBtn.closest('.edit-inst-row');
      if (row.dataset.paid === 'true') {
        toast('مش هتقدر تحذف قسط مدفوع', 'error');
        return;
      }
      row.remove();
    });
  }

  function renderEditInstRow(inst, idx, isNew) {
    const isPaid = inst.is_paid;
    return `
      <div class="edit-inst-row" data-id="${inst.id}" data-paid="${isPaid}" data-new="${isNew}" style="display:grid; grid-template-columns: 30px 1fr 100px 130px 30px; gap:8px; align-items:center; padding:10px; background:${isPaid ? '#f0f9f3' : 'var(--cream-50)'}; border:1px solid ${isPaid ? '#b8d8c2' : 'var(--line)'}; border-radius:3px;">
        <div style="text-align:center; font-weight:700; color:${isPaid ? 'var(--success)' : 'var(--gold-700)'};">${idx + 1}${isPaid ? ' ✓' : ''}</div>
        <input class="inst-label" type="text" value="${escapeHtml(inst.label || '')}" placeholder="اسم القسط" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--line); border-radius:3px;" />
        <input class="inst-amount ltr" type="number" min="0" step="0.01" value="${inst.amount || 0}" placeholder="المبلغ" style="width:100%; padding:6px 8px; font-size:13px; text-align:center; border:1px solid var(--line); border-radius:3px;" />
        <input class="inst-due ltr" type="date" value="${inst.due_date || ''}" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--line); border-radius:3px;" />
        ${!isPaid ? `
          <button type="button" class="remove-inst-edit btn-icon danger" title="حذف" style="padding:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : '<div></div>'}
      </div>
    `;
  }

  async function savePlanEdits(modal, bookId, book, plan, oldInstallments) {
    const totalAmount = parseFloat(modal.querySelector('#m-total').value);
    const currency = modal.querySelector('#m-currency').value;

    if (!totalAmount || totalAmount <= 0) { toast('الإجمالي لازم أكبر من صفر', 'error'); return false; }

    const list = modal.querySelector('#installments-list');
    const rows = Array.from(list.querySelectorAll('.edit-inst-row'));

    if (rows.length === 0) { toast('لازم قسط واحد على الأقل', 'error'); return false; }

    // Build the updated installments
    const items = rows.map((row, i) => ({
      id: row.dataset.id,
      isNew: row.dataset.new === 'true',
      isPaid: row.dataset.paid === 'true',
      installment_order: i + 1,
      label: row.querySelector('.inst-label').value.trim(),
      amount: parseFloat(row.querySelector('.inst-amount').value) || 0,
      due_date: row.querySelector('.inst-due').value || null,
    }));

    for (const item of items) {
      if (!item.label) { toast(`القسط رقم ${item.installment_order}: الاسم مطلوب`, 'error'); return false; }
      if (item.amount <= 0) { toast(`القسط رقم ${item.installment_order}: المبلغ لازم أكبر من صفر`, 'error'); return false; }
    }

    // Update plan
    const { error: planErr } = await sb.from('payment_plans').update({
      total_amount: totalAmount,
      currency,
      updated_at: new Date().toISOString(),
    }).eq('id', plan.id);
    if (planErr) { toast(planErr.message, 'error'); return false; }

    // Find deleted installments (in old but not in new)
    const newIds = items.filter(i => !i.isNew).map(i => i.id);
    const toDelete = oldInstallments.filter(old => !newIds.includes(old.id));
    for (const del of toDelete) {
      if (del.is_paid) continue; // safety
      await sb.from('payment_plan_installments').delete().eq('id', del.id);
    }

    // Update existing + insert new
    for (const item of items) {
      if (item.isNew) {
        await sb.from('payment_plan_installments').insert({
          plan_id: plan.id,
          installment_order: item.installment_order,
          label: item.label,
          amount: item.amount,
          due_date: item.due_date,
        });
      } else {
        await sb.from('payment_plan_installments').update({
          installment_order: item.installment_order,
          label: item.label,
          amount: item.amount,
          due_date: item.due_date,
        }).eq('id', item.id);
      }
    }

    toast('تم حفظ الخطة ✓');
    await bookAccounts.load(bookId, 'accounts-mount', book);
    return true;
  }

  // ============================================================================
  // RECORD PAYMENT MODAL (linked to installment optionally)
  // ============================================================================
  function openRecordPaymentModal(bookId, book, installment, allInstallments) {
    const today = todayISO();
    const author = book?.author;
    const planCurrency = installment ? null : 'USD'; // we'll figure it out

    const body = `
      ${installment ? `
        <div class="alert alert-info" style="margin-bottom:14px; font-size:12.5px;">
          📌 تسجيل دفعة لقسط: <strong>${escapeHtml(installment.label)}</strong> · المبلغ المتوقع: <strong>${Number(installment.amount).toLocaleString('en-US')}</strong>
        </div>
      ` : ''}

      <div class="form-row">
        <div class="form-group">
          <label>المبلغ <span class="req">*</span></label>
          <input id="m-amount" type="number" min="0" step="0.01" value="${installment?.amount || ''}" placeholder="0.00" class="ltr" />
        </div>
        <div class="form-group">
          <label>العملة</label>
          <select id="m-currency">
            <option value="USD">دولار ($)</option>
            <option value="EGP">جنيه (ج.م)</option>
            <option value="SAR">ريال سعودي</option>
            <option value="AED">درهم</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>تاريخ الدفع <span class="req">*</span></label>
          <input id="m-date" type="date" class="ltr" value="${today}" />
        </div>
        <div class="form-group">
          <label>طريقة الدفع</label>
          <select id="m-method">
            <option value="cash">💵 كاش</option>
            <option value="bank_transfer">🏦 تحويل بنكي</option>
            <option value="instapay">📱 InstaPay</option>
            <option value="vodafone_cash">📱 Vodafone Cash</option>
            <option value="paypal">💳 PayPal</option>
            <option value="wise">💳 Wise</option>
            <option value="other">أخرى</option>
          </select>
        </div>
      </div>

      ${!installment ? `
        <div class="form-group">
          <label>ربط بقسط (اختياري)</label>
          <select id="m-installment">
            <option value="">— دفعة منفصلة —</option>
            ${allInstallments.filter(i => !i.is_paid).map(i =>
              `<option value="${i.id}" data-amount="${i.amount}">${escapeHtml(i.label)} · ${Number(i.amount).toLocaleString('en-US')}</option>`
            ).join('')}
          </select>
        </div>
      ` : ''}

      <div class="form-group">
        <label>رقم العملية <span class="opt">(reference)</span></label>
        <input id="m-reference" type="text" class="ltr" placeholder="رقم الإيصال أو التحويل" />
      </div>

      <div class="form-group">
        <label>ملاحظات</label>
        <textarea id="m-notes"></textarea>
      </div>
    `;

    const { modal } = openModal({
      title: installment ? `تسجيل دفعة لـ ${installment.label}` : 'تسجيل دفعة جديدة',
      body, size: 'md',
      saveLabel: 'حفظ الدفعة',
      onSave: async () => savePayment(modal, bookId, book, installment),
    });

    // Auto-fill amount when installment selected
    const instSel = modal.querySelector('#m-installment');
    if (instSel) {
      instSel.onchange = () => {
        const amt = instSel.selectedOptions[0]?.dataset.amount;
        if (amt) modal.querySelector('#m-amount').value = amt;
      };
    }
  }

  async function savePayment(modal, bookId, book, installment) {
    const amount = parseFloat(modal.querySelector('#m-amount').value);
    const payment_date = modal.querySelector('#m-date').value;
    const currency = modal.querySelector('#m-currency').value;
    const payment_method = modal.querySelector('#m-method').value;
    const reference = modal.querySelector('#m-reference').value.trim() || null;
    const notes = modal.querySelector('#m-notes').value.trim() || null;

    if (!amount || amount <= 0) { toast('المبلغ مطلوب', 'error'); return false; }
    if (!payment_date) { toast('التاريخ مطلوب', 'error'); return false; }
    if (!book?.author_id) { toast('الكتاب لازم يكون له مؤلف', 'error'); return false; }

    // Determine if linking to an installment
    let linkedInstId = installment?.id;
    if (!linkedInstId) {
      const sel = modal.querySelector('#m-installment');
      if (sel) linkedInstId = sel.value || null;
    }

    // Create the payment
    const paymentType = installment
      ? (installment.installment_order === 1 ? 'deposit' : 'installment')
      : 'installment';

    const { data: payment, error: payErr } = await sb.from('payments').insert({
      author_id: book.author_id,
      book_id: bookId,
      amount,
      currency,
      payment_date,
      payment_type: paymentType,
      payment_method,
      reference,
      notes,
      recorded_by: state.person.id,
    }).select().single();

    if (payErr) { toast(payErr.message, 'error'); return false; }

    // If linked to an installment, mark it as paid
    if (linkedInstId) {
      const { error: updErr } = await sb.from('payment_plan_installments').update({
        is_paid: true,
        paid_payment_id: payment.id,
      }).eq('id', linkedInstId);
      if (updErr) console.warn('Failed to mark installment paid:', updErr);
    }

    // Activity log
    await sb.from('activity_log').insert({
      book_id: bookId,
      action: 'payment_recorded',
      actor_id: state.person.id,
      description: `تم تسجيل دفعة بمبلغ ${amount.toLocaleString('en-US')} ${currency}${installment ? ` لقسط: ${installment.label}` : ''}`,
    });

    toast('تم تسجيل الدفعة ✓');
    await bookAccounts.load(bookId, 'accounts-mount', book);
    return true;
  }

  PTL.components = PTL.components || {};
  PTL.components.bookAccounts = bookAccounts;
})();
