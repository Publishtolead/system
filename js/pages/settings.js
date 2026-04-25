// ==========================================================================
// PTL — Page: Settings (Admin only)
// ==========================================================================
// Manages system-wide configuration:
//   - Exchange rate (USD → EGP)
//   - Packages (Starter / Core / Pro)
//   - Add-ons
//   - Default payment plan template
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast } = utils;

  // Cache settings in memory once loaded for use across other modules
  PTL.settings = PTL.settings || {};

  // Load all settings from DB and cache them
  PTL.loadSettings = async function() {
    const { data, error } = await sb.from('system_settings').select('*');
    if (error) {
      console.error('Failed to load settings:', error);
      return;
    }
    const settings = {};
    (data || []).forEach(row => {
      settings[row.key] = row.value;
    });
    PTL.settings = settings;
    return settings;
  };

  // Format USD with both currencies side by side
  PTL.formatPriceWithEGP = function(usdAmount, options) {
    const opts = options || {};
    const rate = Number(PTL.settings.exchange_rate_usd_egp || 50);
    const egp = Number(usdAmount) * rate;
    const usdStr = `$${Number(usdAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const egpStr = `${Math.round(egp).toLocaleString('en-US')} ج.م`;
    if (opts.compact) {
      return `${usdStr} <span style="color:var(--ink-500); font-weight:400;">≈ ${egpStr}</span>`;
    }
    return `${usdStr} <span style="color:var(--ink-500); font-weight:400; font-size:0.85em;">≈ ${egpStr}</span>`;
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  async function renderSettings() {
    if (!PTL.perms.canManageSystem()) {
      $('app-content').innerHTML = `
        <header class="page-header">
          <div>
            <div class="page-eyebrow">Settings</div>
            <h1 class="page-title">الإعدادات</h1>
          </div>
        </header>
        <div class="alert alert-warn">
          <strong>صلاحية محظورة.</strong> الإعدادات متاحة للـ Admin فقط.
        </div>
      `;
      return;
    }

    await PTL.loadSettings();
    const s = PTL.settings;

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Settings</div>
          <h1 class="page-title">الإعدادات</h1>
          <p class="page-sub">إعدادات النظام العامة · تطبق على الكتب الجديدة فقط</p>
        </div>
      </header>

      ${renderExchangeRatePanel(s.exchange_rate_usd_egp)}
      ${renderPackagesPanel(s.packages || [])}
      ${renderAddonsPanel(s.addons || [])}
      ${renderPaymentPlanPanel(s.default_payment_plan || [])}
    `;

    wireUp();
  }

  // ============================================================================
  // EXCHANGE RATE PANEL
  // ============================================================================
  function renderExchangeRatePanel(rate) {
    const r = Number(rate || 50);
    return `
      <section class="panel fade-in" style="margin-bottom:24px;">
        <div class="panel-header">
          <h3 class="panel-title">سعر الصرف <span class="panel-title-meta">· USD → EGP</span></h3>
          <button class="btn btn-ghost btn-sm" id="edit-rate-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            تعديل
          </button>
        </div>
        <div class="panel-body">
          <div style="display:flex; align-items:center; gap:24px; padding:16px; background:var(--cream-50); border-radius:4px;">
            <div style="font-size:32px; font-weight:700; color:var(--gold-700);">
              1 USD = ${r.toLocaleString('en-US')} EGP
            </div>
            <div style="font-size:13px; color:var(--ink-500); flex:1;">
              السعر ده بيستخدم في كل النظام لتحويل الأسعار من الدولار للجنيه.
              لما تغيره، كل المبالغ بتتحدث على طول.
            </div>
          </div>
          <div style="margin-top:14px; display:flex; gap:18px; font-size:13px; color:var(--ink-500); flex-wrap:wrap;">
            <div>$100 = <strong style="color:var(--navy-800);">${(100 * r).toLocaleString('en-US')} ج.م</strong></div>
            <div>$500 = <strong style="color:var(--navy-800);">${(500 * r).toLocaleString('en-US')} ج.م</strong></div>
            <div>$1,000 = <strong style="color:var(--navy-800);">${(1000 * r).toLocaleString('en-US')} ج.م</strong></div>
            <div>$1,750 = <strong style="color:var(--navy-800);">${(1750 * r).toLocaleString('en-US')} ج.م</strong></div>
          </div>
        </div>
      </section>
    `;
  }

  // ============================================================================
  // PACKAGES PANEL
  // ============================================================================
  function renderPackagesPanel(packages) {
    return `
      <section class="panel fade-in" style="margin-bottom:24px;">
        <div class="panel-header">
          <h3 class="panel-title">الباقات <span class="panel-title-meta">· ${packages.length} باقة</span></h3>
          <button class="btn btn-primary btn-sm" id="add-package-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة باقة
          </button>
        </div>
        <div class="panel-body">
          ${packages.length === 0
            ? '<div style="text-align:center; padding:24px; color:var(--ink-500);">مفيش باقات</div>'
            : `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
                ${packages.map((p, idx) => renderPackageCard(p, idx)).join('')}
              </div>`}
        </div>
      </section>
    `;
  }

  function renderPackageCard(pkg, idx) {
    return `
      <div style="padding:18px; background:white; border:1px solid var(--line); border-right:4px solid var(--gold-500); border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div>
            <div style="font-size:18px; font-weight:700; color:var(--navy-800);">${escapeHtml(pkg.name_ar || pkg.name_en)}</div>
            ${pkg.description_ar ? `<div style="font-size:12px; color:var(--ink-500); margin-top:2px;">${escapeHtml(pkg.description_ar)}</div>` : ''}
          </div>
          <div style="display:flex; gap:4px;">
            <button class="btn-icon edit-package" data-idx="${idx}" title="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger delete-package" data-idx="${idx}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          </div>
        </div>
        <div style="font-size:24px; font-weight:700; color:var(--gold-700); margin-top:10px;">
          ${PTL.formatPriceWithEGP(pkg.price_usd, { compact: true })}
        </div>
      </div>
    `;
  }

  // ============================================================================
  // ADD-ONS PANEL
  // ============================================================================
  function renderAddonsPanel(addons) {
    return `
      <section class="panel fade-in" style="margin-bottom:24px;">
        <div class="panel-header">
          <h3 class="panel-title">الإضافات <span class="panel-title-meta">· ${addons.length} إضافة</span></h3>
          <button class="btn btn-primary btn-sm" id="add-addon-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة جديدة
          </button>
        </div>
        <div class="panel-body">
          ${addons.length === 0
            ? '<div style="text-align:center; padding:24px; color:var(--ink-500);">مفيش إضافات</div>'
            : `<div style="display:flex; flex-direction:column; gap:8px;">
                ${addons.map((a, idx) => renderAddonRow(a, idx)).join('')}
              </div>`}
        </div>
      </section>
    `;
  }

  function renderAddonRow(addon, idx) {
    return `
      <div style="display:grid; grid-template-columns: 1fr auto auto; gap:14px; align-items:center; padding:12px 14px; background:white; border:1px solid var(--line); border-right:3px solid var(--gold-500); border-radius:3px;">
        <div>
          <div style="font-size:14px; font-weight:700; color:var(--navy-800);">${escapeHtml(addon.name_ar)}</div>
          ${addon.description_ar ? `<div style="font-size:12px; color:var(--ink-500); margin-top:2px;">${escapeHtml(addon.description_ar)}</div>` : ''}
        </div>
        <div style="font-size:15px; font-weight:700; color:var(--gold-700);">
          ${PTL.formatPriceWithEGP(addon.price_usd, { compact: true })}
        </div>
        <div style="display:flex; gap:4px;">
          <button class="btn-icon edit-addon" data-idx="${idx}" title="تعديل">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger delete-addon" data-idx="${idx}" title="حذف">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // PAYMENT PLAN PANEL
  // ============================================================================
  function renderPaymentPlanPanel(plan) {
    const total = plan.reduce((s, m) => s + Number(m.percentage || 0), 0);
    const isValid = total === 100;

    return `
      <section class="panel fade-in" style="margin-bottom:24px;">
        <div class="panel-header">
          <h3 class="panel-title">خطة الدفع الافتراضية <span class="panel-title-meta">· ${plan.length} قسط · إجمالي ${total}%</span></h3>
          <button class="btn btn-primary btn-sm" id="edit-plan-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            تعديل الخطة
          </button>
        </div>
        <div class="panel-body">
          ${!isValid ? `
            <div class="alert alert-warn" style="margin-bottom:14px;">
              <strong>⚠ المجموع ${total}% — لازم يكون 100%.</strong> دوس "تعديل الخطة" واضبط النسب.
            </div>
          ` : ''}
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            ${plan.map((m, idx) => `
              <div style="padding:14px; background:white; border:1px solid var(--line); border-top:3px solid var(--gold-500); border-radius:3px; text-align:center;">
                <div style="width:32px; height:32px; border-radius:50%; background:var(--navy-800); color:var(--gold-400); display:flex; align-items:center; justify-content:center; margin:0 auto 8px; font-weight:700; font-size:14px;">
                  ${m.order || (idx + 1)}
                </div>
                <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">
                  Milestone ${m.order || (idx + 1)}
                </div>
                <div style="font-size:24px; font-weight:700; color:var(--navy-800); margin-bottom:6px;">
                  ${m.percentage}%
                </div>
                <div style="font-size:13px; font-weight:700; color:var(--navy-800); margin-bottom:4px;">
                  ${escapeHtml(m.label)}
                </div>
                ${m.description ? `<div style="font-size:11.5px; color:var(--ink-500); line-height:1.5;">${escapeHtml(m.description)}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="alert alert-info" style="margin-top:14px; margin-bottom:0; font-size:12.5px;">
            💡 الخطة دي افتراضية للكتب الجديدة. عند إضافة كتاب، تقدر تعدلها لكل كتاب على حدة.
          </div>
        </div>
      </section>
    `;
  }

  // ============================================================================
  // WIRE-UP
  // ============================================================================
  function wireUp() {
    $('edit-rate-btn').onclick = openExchangeRateModal;

    $('add-package-btn').onclick = () => openPackageModal(null, -1);
    document.querySelectorAll('.edit-package').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        openPackageModal(PTL.settings.packages[idx], idx);
      };
    });
    document.querySelectorAll('.delete-package').forEach(btn => {
      btn.onclick = () => deletePackage(parseInt(btn.dataset.idx, 10));
    });

    $('add-addon-btn').onclick = () => openAddonModal(null, -1);
    document.querySelectorAll('.edit-addon').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        openAddonModal(PTL.settings.addons[idx], idx);
      };
    });
    document.querySelectorAll('.delete-addon').forEach(btn => {
      btn.onclick = () => deleteAddon(parseInt(btn.dataset.idx, 10));
    });

    $('edit-plan-btn').onclick = openPaymentPlanModal;
  }

  // ============================================================================
  // EXCHANGE RATE MODAL
  // ============================================================================
  function openExchangeRateModal() {
    const current = Number(PTL.settings.exchange_rate_usd_egp || 50);

    const body = `
      <div class="form-group">
        <label>سعر صرف 1 دولار بالجنيه المصري <span class="req">*</span></label>
        <input id="m-rate" type="number" step="0.01" min="0" value="${current}" class="ltr" />
        <div class="form-help">السعر الحالي للسوق. ينصح بمراجعته شهرياً.</div>
      </div>
      <div class="alert alert-info" style="margin-bottom:0; font-size:12.5px;">
        التغيير هيؤثر فوراً على عرض كل الأسعار في النظام.
        لكن الدفعات اللي اتسجلت قبل كده مش هتتغير.
      </div>
    `;

    const { modal } = openModal({
      title: 'تعديل سعر الصرف',
      body,
      size: 'sm',
      saveLabel: 'حفظ',
      onSave: async () => {
        const newRate = parseFloat(modal.querySelector('#m-rate').value);
        if (!newRate || newRate <= 0) { toast('السعر لازم أكبر من صفر', 'error'); return false; }

        const { error } = await sb.from('system_settings')
          .update({ value: newRate, updated_at: new Date().toISOString(), updated_by: state.person.id })
          .eq('key', 'exchange_rate_usd_egp');
        if (error) { toast(error.message, 'error'); return false; }

        toast('تم حفظ سعر الصرف ✓');
        await renderSettings();
        return true;
      },
    });
  }

  // ============================================================================
  // PACKAGE MODAL
  // ============================================================================
  function openPackageModal(pkg, idx) {
    const isEdit = idx >= 0;
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>اسم الباقة بالعربية <span class="req">*</span></label>
          <input id="m-name-ar" type="text" value="${escapeHtml(pkg?.name_ar || '')}" placeholder="مثلاً: Core" />
        </div>
        <div class="form-group">
          <label>بالإنجليزية</label>
          <input id="m-name-en" type="text" class="ltr" value="${escapeHtml(pkg?.name_en || '')}" placeholder="Core" />
        </div>
      </div>
      <div class="form-group">
        <label>السعر بالدولار <span class="req">*</span></label>
        <input id="m-price" type="number" min="0" step="0.01" value="${pkg?.price_usd || ''}" placeholder="1350" class="ltr" />
        <div class="form-help">السعر الافتراضي. يمكن تغييره لكل كتاب على حدة.</div>
      </div>
      <div class="form-group">
        <label>الوصف</label>
        <textarea id="m-desc" placeholder="مثلاً: 250-500 صفحة">${escapeHtml(pkg?.description_ar || '')}</textarea>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? 'تعديل الباقة' : 'إضافة باقة جديدة',
      body, size: 'md',
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => {
        const name_ar = modal.querySelector('#m-name-ar').value.trim();
        const name_en = modal.querySelector('#m-name-en').value.trim() || name_ar;
        const price_usd = parseFloat(modal.querySelector('#m-price').value);
        const description_ar = modal.querySelector('#m-desc').value.trim() || null;

        if (!name_ar) { toast('الاسم مطلوب', 'error'); return false; }
        if (!price_usd || price_usd <= 0) { toast('السعر مطلوب', 'error'); return false; }

        const newPackage = {
          id: pkg?.id || name_ar.toLowerCase().replace(/\s+/g, '_'),
          name_ar, name_en, price_usd, description_ar,
        };

        const packages = [...(PTL.settings.packages || [])];
        if (isEdit) packages[idx] = newPackage;
        else packages.push(newPackage);

        const { error } = await sb.from('system_settings')
          .update({ value: packages, updated_at: new Date().toISOString(), updated_by: state.person.id })
          .eq('key', 'packages');
        if (error) { toast(error.message, 'error'); return false; }

        toast(isEdit ? 'تم الحفظ ✓' : 'تم الإضافة ✓');
        await renderSettings();
        return true;
      },
    });
  }

  async function deletePackage(idx) {
    const pkg = PTL.settings.packages[idx];
    const ok = await confirmDialog({
      title: 'حذف الباقة',
      message: `حذف "${pkg.name_ar}"؟ الكتب المرتبطة بيها مش هتتأثر، لكن مش هتقدر تختارها لكتب جديدة.`,
      confirmLabel: 'احذف', destructive: true,
    });
    if (!ok) return;

    const packages = (PTL.settings.packages || []).filter((_, i) => i !== idx);
    const { error } = await sb.from('system_settings')
      .update({ value: packages, updated_at: new Date().toISOString() })
      .eq('key', 'packages');
    if (error) { toast(error.message, 'error'); return; }
    toast('تم الحذف');
    await renderSettings();
  }

  // ============================================================================
  // ADDON MODAL
  // ============================================================================
  function openAddonModal(addon, idx) {
    const isEdit = idx >= 0;
    const body = `
      <div class="form-group">
        <label>اسم الإضافة <span class="req">*</span></label>
        <input id="m-name" type="text" value="${escapeHtml(addon?.name_ar || '')}" placeholder="مثلاً: Selling Landing Page" />
      </div>
      <div class="form-group">
        <label>السعر بالدولار <span class="req">*</span></label>
        <input id="m-price" type="number" min="0" step="0.01" value="${addon?.price_usd || ''}" placeholder="80" class="ltr" />
      </div>
      <div class="form-group">
        <label>الوصف</label>
        <textarea id="m-desc" placeholder="وصف الخدمة">${escapeHtml(addon?.description_ar || '')}</textarea>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? 'تعديل الإضافة' : 'إضافة جديدة',
      body, size: 'md',
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => {
        const name_ar = modal.querySelector('#m-name').value.trim();
        const price_usd = parseFloat(modal.querySelector('#m-price').value);
        const description_ar = modal.querySelector('#m-desc').value.trim() || null;

        if (!name_ar) { toast('الاسم مطلوب', 'error'); return false; }
        if (price_usd === null || isNaN(price_usd) || price_usd < 0) { toast('السعر لازم رقم صالح', 'error'); return false; }

        const newAddon = {
          id: addon?.id || name_ar.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          name_ar, price_usd, description_ar,
        };

        const addons = [...(PTL.settings.addons || [])];
        if (isEdit) addons[idx] = newAddon;
        else addons.push(newAddon);

        const { error } = await sb.from('system_settings')
          .update({ value: addons, updated_at: new Date().toISOString(), updated_by: state.person.id })
          .eq('key', 'addons');
        if (error) { toast(error.message, 'error'); return false; }

        toast(isEdit ? 'تم الحفظ ✓' : 'تم الإضافة ✓');
        await renderSettings();
        return true;
      },
    });
  }

  async function deleteAddon(idx) {
    const addon = PTL.settings.addons[idx];
    const ok = await confirmDialog({
      title: 'حذف الإضافة',
      message: `حذف "${addon.name_ar}"؟`,
      confirmLabel: 'احذف', destructive: true,
    });
    if (!ok) return;

    const addons = (PTL.settings.addons || []).filter((_, i) => i !== idx);
    const { error } = await sb.from('system_settings')
      .update({ value: addons, updated_at: new Date().toISOString() })
      .eq('key', 'addons');
    if (error) { toast(error.message, 'error'); return; }
    toast('تم الحذف');
    await renderSettings();
  }

  // ============================================================================
  // PAYMENT PLAN MODAL — full editor
  // ============================================================================
  function openPaymentPlanModal() {
    const plan = PTL.settings.default_payment_plan || [];

    const body = `
      <div style="font-size:13px; color:var(--ink-500); margin-bottom:14px; line-height:1.6;">
        دي خطة الدفع الافتراضية للكتب الجديدة. مجموع النسب لازم يساوي 100%.
        تقدر تعدلها لكل كتاب على حدة عند الإضافة.
      </div>

      <div id="installments-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
        ${plan.map((m, idx) => renderInstallmentRow(m, idx)).join('')}
      </div>

      <button type="button" id="add-installment-btn" class="btn btn-ghost btn-sm" style="width:100%; justify-content:center;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
        إضافة قسط
      </button>

      <div id="plan-total-status" style="margin-top:14px; padding:12px; border-radius:4px; font-size:13px; font-weight:700; text-align:center;"></div>
    `;

    const { modal } = openModal({
      title: 'تعديل خطة الدفع الافتراضية',
      body, size: 'lg',
      saveLabel: 'حفظ الخطة',
      onSave: async () => savePlan(modal),
    });

    // Setup live behavior
    const list = modal.querySelector('#installments-list');
    const updateTotalStatus = () => {
      const total = Array.from(list.querySelectorAll('.inst-pct')).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
      const status = modal.querySelector('#plan-total-status');
      const valid = Math.abs(total - 100) < 0.01;
      status.style.background = valid ? '#d4ebda' : '#fdf2f2';
      status.style.color = valid ? '#1a4a2a' : '#882a2a';
      status.textContent = valid
        ? `✓ مجموع النسب = 100% — الخطة صالحة`
        : `⚠ المجموع = ${total.toFixed(1)}% — لازم يكون 100% بالظبط`;
    };

    list.addEventListener('input', updateTotalStatus);

    list.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-inst');
      if (removeBtn) {
        removeBtn.closest('.inst-row').remove();
        renumberRows(list);
        updateTotalStatus();
      }
    });

    modal.querySelector('#add-installment-btn').onclick = () => {
      const newIdx = list.querySelectorAll('.inst-row').length;
      const tmp = document.createElement('div');
      tmp.innerHTML = renderInstallmentRow({ order: newIdx + 1, label: '', percentage: 0, description: '' }, newIdx);
      list.appendChild(tmp.firstElementChild);
      updateTotalStatus();
    };

    updateTotalStatus();
  }

  function renderInstallmentRow(m, idx) {
    return `
      <div class="inst-row" style="display:grid; grid-template-columns: 40px 1fr 90px 30px; gap:8px; align-items:center; padding:10px; background:var(--cream-50); border:1px solid var(--line); border-radius:3px;">
        <div class="inst-num" style="text-align:center; font-weight:700; color:var(--gold-700); font-size:14px;">${idx + 1}</div>
        <div>
          <input class="inst-label" type="text" value="${escapeHtml(m.label || '')}" placeholder="اسم القسط (مثلاً: بدء المشروع)" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--line); border-radius:3px; margin-bottom:4px;" />
          <input class="inst-desc" type="text" value="${escapeHtml(m.description || '')}" placeholder="وصف اختياري" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--line); border-radius:3px; color:var(--ink-500);" />
        </div>
        <div style="position:relative;">
          <input class="inst-pct ltr" type="number" min="0" max="100" step="0.5" value="${m.percentage || 0}" style="width:100%; padding:6px 24px 6px 8px; font-size:14px; font-weight:700; text-align:center; border:1px solid var(--line); border-radius:3px;" />
          <span style="position:absolute; left:6px; top:50%; transform:translateY(-50%); color:var(--ink-500); font-weight:700; pointer-events:none;">%</span>
        </div>
        <button type="button" class="remove-inst btn-icon danger" title="حذف" style="padding:4px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;
  }

  function renumberRows(list) {
    Array.from(list.querySelectorAll('.inst-row')).forEach((row, idx) => {
      row.querySelector('.inst-num').textContent = idx + 1;
    });
  }

  async function savePlan(modal) {
    const list = modal.querySelector('#installments-list');
    const rows = Array.from(list.querySelectorAll('.inst-row'));

    if (rows.length === 0) { toast('لازم قسط واحد على الأقل', 'error'); return false; }

    const plan = [];
    let totalPct = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const label = row.querySelector('.inst-label').value.trim();
      const description = row.querySelector('.inst-desc').value.trim() || null;
      const percentage = parseFloat(row.querySelector('.inst-pct').value) || 0;

      if (!label) { toast(`القسط رقم ${i + 1}: الاسم مطلوب`, 'error'); return false; }
      if (percentage <= 0) { toast(`القسط رقم ${i + 1}: النسبة لازم أكبر من صفر`, 'error'); return false; }

      plan.push({ order: i + 1, label, percentage, description });
      totalPct += percentage;
    }

    if (Math.abs(totalPct - 100) >= 0.01) {
      toast(`المجموع لازم 100% — حالياً ${totalPct.toFixed(1)}%`, 'error');
      return false;
    }

    const { error } = await sb.from('system_settings')
      .update({ value: plan, updated_at: new Date().toISOString(), updated_by: state.person.id })
      .eq('key', 'default_payment_plan');
    if (error) { toast(error.message, 'error'); return false; }

    toast('تم حفظ الخطة ✓');
    await renderSettings();
    return true;
  }

  PTL.routes['/settings'] = renderSettings;
})();
