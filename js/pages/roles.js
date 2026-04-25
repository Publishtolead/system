// ==========================================================================
// PTL — Page: Roles
// ==========================================================================
// CRUD for roles. Roles are reused across people and (later) workflow steps.
// A role cannot be deleted while assigned to people.
// ==========================================================================

(function() {
  'use strict';

  const { sb, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast } = utils;

  const COLOR_PALETTE = [
    '#0d1b2a','#1e3a5f','#2d4a6b','#5a3a1e',
    '#704a1a','#8b6914','#a88436','#c9a961',
    '#2d7a4a','#5a8a3e','#a83232','#7a3a5a',
    '#1a5a7a','#3a3a3a',
  ];

  async function renderRoles() {
    const [rolesRes, peopleRes] = await Promise.all([
      sb.from('roles').select('*').order('display_order'),
      sb.from('people').select('id, person_roles(role_id)').eq('active', true),
    ]);

    const roles = rolesRes.data || [];
    const people = peopleRes.data || [];

    const roleCounts = {};
    people.forEach(p => {
      (p.person_roles || []).forEach(pr => {
        roleCounts[pr.role_id] = (roleCounts[pr.role_id] || 0) + 1;
      });
    });

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Roles</div>
          <h1 class="page-title">إدارة الأدوار</h1>
          <p class="page-sub">الأدوار اللي بيتقسم عليها الشغل بين الفريق</p>
        </div>
        ${PTL.perms.canEdit() ? `
          <button class="btn btn-primary" id="add-role-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة دور
          </button>
        ` : ''}
      </header>

      <div class="panel">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>اللون</th>
                <th>الدور</th>
                <th>الوصف</th>
                <th>الأشخاص</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${roles.map(r => renderRow(r, roleCounts[r.id] || 0)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="alert alert-info" style="margin-top: 16px;">
        <strong>ملاحظة:</strong> الأدوار بتستعمل في توزيع الشغل في خطوات الفلو. لما نضيف كتاب جديد في Phase 3، النظام هيسأل: "مين الـ Content Writer لهذا الكتاب؟" وهيعرض كل الأشخاص اللي عندهم دور Content Writer.
      </div>
    `;

    if (PTL.perms.canEdit()) {
      const addBtn = $('add-role-btn');
      if (addBtn) addBtn.onclick = () => openRoleModal(null);
    }
    document.querySelectorAll('.edit-role').forEach(btn => {
      btn.onclick = () => openRoleModal(roles.find(r => r.id === btn.dataset.id));
    });
    document.querySelectorAll('.delete-role').forEach(btn => {
      btn.onclick = () => deleteRole(
        btn.dataset.id,
        btn.dataset.name,
        parseInt(btn.dataset.count, 10)
      );
    });
  }

  function renderRow(r, count) {
    return `
      <tr>
        <td><div style="width:24px;height:24px;border-radius:50%;background:${escapeHtml(r.color)};"></div></td>
        <td>
          <div class="name-cell-text">
            <div class="name">${escapeHtml(r.name_ar || r.name)}</div>
            <div class="meta latin">${escapeHtml(r.name)}</div>
          </div>
        </td>
        <td style="font-size: 13px; color: var(--ink-500); max-width: 380px;">
          ${escapeHtml(r.description || '—')}
        </td>
        <td>
          <span class="status-tag ${count > 0 ? 'linked' : 'unlinked'}">
            ${count} شخص
          </span>
        </td>
        <td class="actions-cell">
          ${PTL.perms.canEdit() ? `
            <button class="btn-icon edit-role" data-id="${r.id}" title="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger delete-role" data-id="${r.id}" data-name="${escapeHtml(r.name_ar || r.name)}" data-count="${count}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  function openRoleModal(role) {
    const isEdit = !!role;
    const currentColor = role?.color || COLOR_PALETTE[0];

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>الاسم بالعربي <span class="req">*</span></label>
          <input id="m-name-ar" type="text" value="${escapeHtml(role?.name_ar || '')}" />
        </div>
        <div class="form-group">
          <label>الاسم بالإنجليزي <span class="req">*</span></label>
          <input id="m-name-en" type="text" class="ltr" value="${escapeHtml(role?.name || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label>الوصف</label>
        <textarea id="m-desc" placeholder="إيه اللي بيعمله الشخص في هذا الدور؟">${escapeHtml(role?.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>اللون</label>
        <div id="m-color" class="color-grid">
          ${COLOR_PALETTE.map(c => `
            <div class="color-swatch ${currentColor === c ? 'selected' : ''}"
                 style="background:${c}" data-color="${c}"></div>
          `).join('')}
        </div>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? `تعديل دور` : 'إضافة دور جديد',
      body,
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => saveRole(modal, role),
    });

    // Color swatch click handlers
    modal.querySelectorAll('#m-color .color-swatch').forEach(sw => {
      sw.onclick = () => {
        modal.querySelectorAll('#m-color .color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
      };
    });
  }

  async function saveRole(modal, role) {
    const isEdit = !!role;
    const nameAr = modal.querySelector('#m-name-ar').value.trim();
    const nameEn = modal.querySelector('#m-name-en').value.trim();
    const description = modal.querySelector('#m-desc').value.trim() || null;
    const colorEl = modal.querySelector('#m-color .color-swatch.selected');
    const color = colorEl?.dataset.color || COLOR_PALETTE[0];

    if (!nameAr) { toast('الاسم بالعربي مطلوب', 'error'); return false; }
    if (!nameEn) { toast('الاسم بالإنجليزي مطلوب', 'error'); return false; }

    const payload = { name: nameEn, name_ar: nameAr, description, color };

    if (isEdit) {
      const { error } = await sb.from('roles').update(payload).eq('id', role.id);
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم حفظ التعديلات');
    } else {
      const { error } = await sb.from('roles').insert({ ...payload, display_order: 99 });
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم إضافة الدور');
    }

    await renderRoles();
    return true;
  }

  async function deleteRole(id, name, count) {
    if (count > 0) {
      return toast(
        `لا يمكن حذف "${name}" لأنه مستخدم من ${count} شخص. شيله من الأشخاص أولاً.`,
        'error'
      );
    }
    const confirmed = await confirmDialog({
      title: 'حذف دور',
      message: `هل أنت متأكد من حذف "${name}"؟`,
      confirmLabel: 'نعم، احذف',
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await sb.from('roles').delete().eq('id', id);
    if (error) toast('مشكلة في الحذف: ' + error.message, 'error');
    else { toast('تم الحذف'); await renderRoles(); }
  }

  PTL.routes['/roles'] = renderRoles;
})();
