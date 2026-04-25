// ==========================================================================
// PTL — Page: People (Team Management)
// ==========================================================================
// CRUD for team members. Each person has name, email, phone, multiple roles,
// admin flag, and active flag. The current user can edit themselves but
// cannot deactivate or delete themselves.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, avatarHTML, openModal, confirmDialog, toast,
          setupMultiPillSelect, getMultiPillSelected } = utils;

  async function renderPeople() {
    // Team management is admin-only
    if (!PTL.perms.canManageSystem()) {
      $('app-content').innerHTML = `
        <header class="page-header">
          <div>
            <div class="page-eyebrow">Team</div>
            <h1 class="page-title">إدارة الفريق</h1>
          </div>
        </header>
        <div class="alert alert-warn">
          <strong>صلاحية محظورة.</strong> إدارة الفريق متاحة للـ Admin فقط.
        </div>
      `;
      return;
    }

    const [peopleRes, rolesRes, invitesRes] = await Promise.all([
      sb.from('people').select('*, person_roles(role_id, roles(id, name_ar))').order('name'),
      sb.from('roles').select('*').order('display_order'),
      sb.from('invitations')
        .select('*, inviter:people!invited_by(name)')
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ]);

    const people = peopleRes.data || [];
    const roles = rolesRes.data || [];
    const invitations = invitesRes.data || [];

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Team</div>
          <h1 class="page-title">إدارة الفريق</h1>
          <p class="page-sub">إضافة وتعديل أعضاء الفريق وأدوارهم</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-gold" id="invite-person-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6"/></svg>
            دعوة عضو
          </button>
          <button class="btn btn-ghost" id="add-person-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة يدوي
          </button>
        </div>
      </header>

      ${invitations.length > 0 ? renderInvitationsPanel(invitations, roles) : ''}

      <div class="panel">
        ${people.length === 0 ? renderEmptyState() : renderTable(people)}
      </div>
    `;

    // Wire up actions
    $('add-person-btn').onclick = () => openPersonModal(null, roles);
    $('invite-person-btn').onclick = () => openInviteModal(roles);
    document.querySelectorAll('.edit-person').forEach(btn => {
      btn.onclick = () => {
        const person = people.find(p => p.id === btn.dataset.id);
        openPersonModal(person, roles);
      };
    });
    document.querySelectorAll('.delete-person').forEach(btn => {
      btn.onclick = () => deletePerson(btn.dataset.id, btn.dataset.name);
    });

    // Wire up invitation actions (now that the panel is in the DOM)
    wireUpInvitationActions(invitations);
  }

  function renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">مفيش أعضاء في الفريق بعد</div>
        <div class="empty-state-sub">ابدأ بإضافة أول عضو</div>
        <button class="btn btn-primary" onclick="document.getElementById('add-person-btn').click()">إضافة عضو</button>
      </div>
    `;
  }

  function renderTable(people) {
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الأدوار</th>
              <th>التواصل</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${people.map(p => renderRow(p)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderRow(p) {
    const personRoles = (p.person_roles || []).map(pr => pr.roles?.name_ar).filter(Boolean);
    const isYou = p.id === state.person.id;
    return `
      <tr>
        <td>
          <div class="name-cell">
            ${avatarHTML(p.name, 36)}
            <div class="name-cell-text">
              <div class="name">${escapeHtml(p.name)}</div>
              ${p.is_admin ? '<span class="status-tag admin" style="margin-top:4px">Admin</span>' : ''}
              ${p.is_manager ? '<span class="status-tag" style="margin-top:4px;background:#dde7f0;color:#1e3a5f;">Manager</span>' : ''}
            </div>
          </div>
        </td>
        <td>
          <div class="role-chips">
            ${personRoles.length
              ? personRoles.map(r => `<span class="role-chip">${escapeHtml(r)}</span>`).join('')
              : '<span style="color:var(--ink-400);font-size:13px;">—</span>'}
          </div>
        </td>
        <td>
          ${p.email ? `<div class="contact-line">${escapeHtml(p.email)}</div>` : ''}
          ${p.phone ? `<div class="contact-line contact-phone">${escapeHtml(p.phone)}</div>` : ''}
          ${!p.email && !p.phone ? '<span style="color:var(--ink-400);">—</span>' : ''}
        </td>
        <td>
          ${isYou ? '<span class="status-tag you">انت</span>'
            : (!p.active ? '<span class="status-tag inactive">معطّل</span>'
              : (p.auth_user_id ? '<span class="status-tag linked">مفعّل</span>'
                : '<span class="status-tag unlinked">لم يدخل</span>'))}
        </td>
        <td class="actions-cell">
          <button class="btn-icon edit-person" data-id="${p.id}" title="تعديل">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${!isYou ? `
            <button class="btn-icon danger delete-person" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  function openPersonModal(person, roles) {
    const isEdit = !!person;
    const personRoleIds = isEdit ? (person.person_roles || []).map(pr => pr.role_id) : [];
    const isYou = isEdit && person.id === state.person.id;

    const body = `
      <div class="form-group">
        <label>الاسم بالكامل <span class="req">*</span></label>
        <input id="m-name" type="text" value="${escapeHtml(person?.name || '')}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>البريد الإلكتروني <span class="opt">(اختياري)</span></label>
          <input id="m-email" type="email" class="ltr" value="${escapeHtml(person?.email || '')}" />
        </div>
        <div class="form-group">
          <label>رقم الواتساب <span class="opt">(اختياري)</span></label>
          <input id="m-phone" type="tel" class="ltr" value="${escapeHtml(person?.phone || '')}" placeholder="+201001234567" />
        </div>
      </div>
      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="margin:0;">الأدوار <span class="req">*</span></label>
          <button type="button" id="m-add-role-quick" class="btn-link" style="font-size:12px; color:var(--gold-700); padding:0;">
            + دور جديد
          </button>
        </div>
        <div id="m-roles" class="multi-pill-select"></div>
      </div>
      <div class="form-group" style="background:var(--cream-50); padding:14px; border-radius:4px; border:1px solid var(--line);">
        <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:10px;">الصلاحيات</div>
        <label class="checkbox-row">
          <input id="m-admin" type="checkbox" ${person?.is_admin ? 'checked' : ''} ${isYou ? 'disabled' : ''}/>
          <span><strong>Admin</strong> — صلاحيات كاملة (إدارة الفريق، الفلو، كل حاجة)</span>
        </label>
        <label class="checkbox-row">
          <input id="m-manager" type="checkbox" ${person?.is_manager ? 'checked' : ''}/>
          <span><strong>Manager</strong> — يشوف كل حاجة (Dashboard، الكتب، التقارير) لكن مش بيعدل (read-only)</span>
        </label>
        ${isEdit && !isYou ? `
          <label class="checkbox-row" style="margin-top:8px; padding-top:10px; border-top:1px dashed var(--line);">
            <input id="m-active" type="checkbox" ${person?.active !== false ? 'checked' : ''} />
            <span>عضو نشط في الفريق</span>
          </label>
        ` : ''}
      </div>
      ${!isEdit ? `
        <div class="alert alert-info" style="margin-top:16px; margin-bottom:0;">
          <strong>ملاحظة:</strong> إضافة عضو من هنا بتعمل profile فقط. العضو نفسه لازم يدخل بإيميل وكلمة سر، ولأول مرة يعرّف اسمه ويربط حسابه. الأفضل ترسله رابط النظام وهو يسجل بنفسه.
        </div>
      ` : ''}
    `;

    const { modal } = openModal({
      title: isEdit ? `تعديل ${person.name}` : 'إضافة عضو جديد',
      body,
      saveLabel: isEdit ? 'حفظ التعديلات' : 'إضافة',
      onSave: async () => savePerson(modal, person, isYou),
    });

    setupMultiPillSelect(
      modal.querySelector('#m-roles'),
      roles.map(r => ({ id: r.id, label: r.name_ar || r.name })),
      personRoleIds
    );

    // Quick-add role from inside the person modal
    modal.querySelector('#m-add-role-quick').onclick = () => openQuickRoleModal(modal, roles, personRoleIds);
  }

  // ---- Quick-add role (called from person modal) -----------------------------
  function openQuickRoleModal(parentModal, currentRoles, currentSelected) {
    const colors = ['#0d1b2a', '#c9a961', '#2d7a4a', '#1e3a5f', '#704a1a', '#a83232', '#5a3a1e', '#3a5e3e'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const body = `
      <div class="form-group">
        <label>اسم الدور بالعربية <span class="req">*</span></label>
        <input id="qr-name-ar" type="text" placeholder="مثلاً: مصمم العلامة التجارية" />
      </div>
      <div class="form-group">
        <label>الاسم بالإنجليزية <span class="opt">(اختياري)</span></label>
        <input id="qr-name-en" type="text" class="ltr" placeholder="Brand Designer" />
      </div>
      <div class="form-group">
        <label>اللون</label>
        <input id="qr-color" type="color" value="${randomColor}" style="width:60px; height:36px; padding:2px; border:1px solid var(--line); border-radius:3px; cursor:pointer;" />
      </div>
      <div class="form-group">
        <label>وصف <span class="opt">(اختياري)</span></label>
        <textarea id="qr-desc" placeholder="وصف مختصر للدور وإيه مسؤولياته"></textarea>
      </div>
      <div class="alert alert-info" style="margin-bottom:0; font-size:12.5px;">
        💡 الدور هيتضاف لقائمة الأدوار العامة، ويتحدد تلقائياً للشخص الحالي.
      </div>
    `;

    const { modal: qrModal, close } = openModal({
      title: 'إضافة دور جديد',
      body,
      size: 'sm',
      saveLabel: 'إضافة',
      onSave: async () => {
        const name_ar = qrModal.querySelector('#qr-name-ar').value.trim();
        const name_en = qrModal.querySelector('#qr-name-en').value.trim() || name_ar;
        const color = qrModal.querySelector('#qr-color').value;
        const description = qrModal.querySelector('#qr-desc').value.trim() || null;

        if (!name_ar) { toast('اسم الدور مطلوب', 'error'); return false; }

        // Get next display_order
        const { data: existing } = await sb.from('roles')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1);
        const nextOrder = (existing?.[0]?.display_order || 0) + 1;

        const { data: newRole, error } = await sb.from('roles').insert({
          name: name_en,
          name_ar,
          color,
          description,
          display_order: nextOrder,
        }).select().single();

        if (error) { toast('مشكلة: ' + error.message, 'error'); return false; }

        toast(`تم إضافة "${name_ar}" ✓`);

        // Add the new role to the parent modal's roles list and re-render the pills
        currentRoles.push(newRole);
        const updatedSelected = [...currentSelected, newRole.id];
        setupMultiPillSelect(
          parentModal.querySelector('#m-roles'),
          currentRoles.map(r => ({ id: r.id, label: r.name_ar || r.name })),
          updatedSelected
        );
        // Update the closure reference so subsequent additions work
        currentSelected.push(newRole.id);

        return true;
      },
    });
  }

  async function savePerson(modal, person, isYou) {
    const isEdit = !!person;
    const name = modal.querySelector('#m-name').value.trim();
    const email = modal.querySelector('#m-email').value.trim() || null;
    const phone = modal.querySelector('#m-phone').value.trim() || null;
    const isAdmin = modal.querySelector('#m-admin').checked;
    const isManager = modal.querySelector('#m-manager').checked;
    const activeEl = modal.querySelector('#m-active');
    const isActive = isEdit && !isYou && activeEl ? activeEl.checked : true;
    const selectedRoleIds = getMultiPillSelected(modal.querySelector('#m-roles'));

    if (!name) { toast('الاسم مطلوب', 'error'); return false; }
    if (selectedRoleIds.length === 0) { toast('اختار دور واحد على الأقل', 'error'); return false; }

    if (isEdit) {
      const { error: updErr } = await sb.from('people').update({
        name, email, phone, is_admin: isAdmin, is_manager: isManager, active: isActive,
        updated_at: new Date().toISOString(),
      }).eq('id', person.id);
      if (updErr) { toast(updErr.message, 'error'); return false; }

      // Sync roles: delete all, insert new
      await sb.from('person_roles').delete().eq('person_id', person.id);
      if (selectedRoleIds.length) {
        const { error: insErr } = await sb.from('person_roles').insert(
          selectedRoleIds.map(rid => ({ person_id: person.id, role_id: rid }))
        );
        if (insErr) { toast(insErr.message, 'error'); return false; }
      }
      toast('تم حفظ التعديلات');
    } else {
      const { data: newPerson, error: insErr } = await sb.from('people')
        .insert({ name, email, phone, is_admin: isAdmin, is_manager: isManager, active: true })
        .select().single();
      if (insErr) { toast(insErr.message, 'error'); return false; }

      if (selectedRoleIds.length) {
        await sb.from('person_roles').insert(
          selectedRoleIds.map(rid => ({ person_id: newPerson.id, role_id: rid }))
        );
      }
      toast('تم إضافة العضو');
    }

    // Refresh state if it's the current user
    if (isEdit && person.id === state.person.id) {
      const { data: refreshed } = await sb.from('people')
        .select('*, person_roles(role_id, roles(id, name, name_ar, color))')
        .eq('id', state.person.id).single();
      if (refreshed) {
        state.person = refreshed;
        state.personRoles = refreshed.person_roles || [];
        PTL.app.refreshUserCard();
      }
    }

    await renderPeople();
    return true;
  }

  async function deletePerson(id, name) {
    const confirmed = await confirmDialog({
      title: 'حذف عضو الفريق',
      message: `هل أنت متأكد من حذف "${name}"؟ هذا الإجراء لا يمكن التراجع عنه. لو العضو شغال على كتب، أوصي بتعطيله بدلاً من حذفه.`,
      confirmLabel: 'نعم، احذف',
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await sb.from('people').delete().eq('id', id);
    if (error) {
      toast('مشكلة في الحذف: ' + error.message, 'error');
    } else {
      toast('تم الحذف');
      await renderPeople();
    }
  }

  // ==========================================================================
  // INVITATIONS
  // ==========================================================================
  function renderInvitationsPanel(invitations, roles) {
    const rolesById = Object.fromEntries(roles.map(r => [r.id, r]));

    return `
      <section class="panel fade-in" style="margin-bottom: 24px;">
        <div class="panel-header">
          <h3 class="panel-title">📨 دعوات معلقة <span class="panel-title-meta">· ${invitations.length} دعوة لم تُستخدم بعد</span></h3>
        </div>
        <div class="panel-body" style="padding: 16px;">
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${invitations.map(inv => {
              const inviteUrl = buildInviteUrl(inv.token);
              const roleNames = (inv.invited_role_ids || [])
                .map(rid => rolesById[rid]?.name_ar || rolesById[rid]?.name)
                .filter(Boolean)
                .join(' · ') || 'بدون دور';
              const expiresIn = Math.ceil((new Date(inv.expires_at) - new Date()) / 86400000);

              return `
                <div style="padding:14px 16px; background:var(--cream-50); border:1px solid var(--cream-200); border-right:3px solid var(--gold-500); border-radius:3px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
                    <div style="flex:1; min-width:0;">
                      <div style="font-weight:700; color:var(--navy-800); font-size:14.5px;">${escapeHtml(inv.name)}</div>
                      <div style="font-size:12.5px; color:var(--ink-500); margin-top:3px;">${escapeHtml(roleNames)}</div>
                      ${inv.email ? `<div style="font-size:12px; color:var(--ink-500); margin-top:2px;" class="latin">${escapeHtml(inv.email)}</div>` : ''}
                      ${inv.phone ? `<div style="font-size:12px; color:var(--gold-700); margin-top:2px;" class="latin">${escapeHtml(inv.phone)}</div>` : ''}
                    </div>
                    <span style="font-size:11px; color:var(--ink-500);">${expiresIn} يوم متبقي</span>
                  </div>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-gold btn-sm preview-invite-msg" data-id="${inv.id}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      معاينة الرسالة
                    </button>
                    <button class="btn btn-ghost btn-sm copy-invite" data-url="${escapeHtml(inviteUrl)}">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      نسخ الرابط فقط
                    </button>
                    <button class="btn-icon danger cancel-invite" data-id="${inv.id}" title="إلغاء الدعوة">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function buildInviteUrl(token) {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?invite=${token}`;
  }

  function buildInviteWhatsAppMessage(name, url) {
    return `أهلاً ${name} 👋

اتدعيت تنضم لفريق Publish to Lead على نظام الإدارة الداخلي.

ادخل من اللينك ده، اعمل حساب، وهتلاقي اسمك ودورك جاهزين:

${url}

اللينك صالح لمدة 30 يوم.`;
  }

  function openInviteModal(roles) {
    const body = `
      <div style="font-size:13px; color:var(--ink-500); margin-bottom:16px; line-height:1.6;">
        ضيف بيانات العضو، النظام هيعمل لينك دعوة تقدر تبعته بالواتساب أو تنسخه.
        لما يدخل، اسمه ودوره هيكونوا جاهزين.
      </div>

      <div class="form-group">
        <label>الاسم بالكامل <span class="req">*</span></label>
        <input id="inv-name" type="text" placeholder="مثلاً: مصطفى عبد الله" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>البريد الإلكتروني <span class="opt">(اختياري)</span></label>
          <input id="inv-email" type="email" class="ltr" placeholder="user@example.com" />
        </div>
        <div class="form-group">
          <label>رقم الواتساب <span class="opt">(للإرسال السريع)</span></label>
          <input id="inv-phone" type="tel" class="ltr" placeholder="+201001234567" />
        </div>
      </div>

      <div class="form-group">
        <label>الدور (الأدوار) <span class="req">*</span></label>
        <div id="inv-roles" class="multi-pill-select"></div>
      </div>
    `;

    const { modal } = openModal({
      title: 'دعوة عضو جديد',
      body,
      saveLabel: 'إنشاء الدعوة',
      onSave: async () => {
        const name = modal.querySelector('#inv-name').value.trim();
        const email = modal.querySelector('#inv-email').value.trim() || null;
        const phone = modal.querySelector('#inv-phone').value.trim() || null;
        const selectedRoleIds = utils.getMultiPillSelected(modal.querySelector('#inv-roles'));

        if (!name) { toast('الاسم مطلوب', 'error'); return false; }
        if (selectedRoleIds.length === 0) { toast('اختار دور واحد على الأقل', 'error'); return false; }

        const { data, error } = await sb.from('invitations').insert({
          name,
          email,
          phone,
          invited_role_ids: selectedRoleIds,
          invited_by: PTL.state.person.id,
        }).select().single();

        if (error) { toast(error.message, 'error'); return false; }

        toast('تم إنشاء الدعوة ✓');
        await renderPeople();
        return true;
      },
    });

    utils.setupMultiPillSelect(
      modal.querySelector('#inv-roles'),
      roles.map(r => ({ id: r.id, label: r.name_ar || r.name })),
      []
    );
  }

  // Copy + cancel handlers — called after page render
  function wireUpInvitationActions(invitations) {
    document.querySelectorAll('.copy-invite').forEach(btn => {
      btn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.url);
          toast('تم نسخ الرابط ✓');
        } catch (e) {
          window.prompt('انسخ الرابط:', btn.dataset.url);
        }
      };
    });

    document.querySelectorAll('.preview-invite-msg').forEach(btn => {
      btn.onclick = () => {
        const inv = (invitations || []).find(i => i.id === btn.dataset.id);
        if (!inv) return;
        const inviteUrl = buildInviteUrl(inv.token);
        const message = buildInviteWhatsAppMessage(inv.name, inviteUrl);

        const contextHTML = `
          <div style="padding:14px; background:var(--cream-50); border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
            <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px;">
              تفاصيل الدعوة
            </div>
            <div style="font-size:13.5px; color:var(--ink-700); line-height: 1.7;">
              <div><strong>الاسم:</strong> ${escapeHtml(inv.name)}</div>
              ${inv.email ? `<div><strong>الإيميل:</strong> <span class="latin">${escapeHtml(inv.email)}</span></div>` : ''}
              ${inv.phone ? `<div><strong>الواتساب:</strong> <span class="latin">${escapeHtml(inv.phone)}</span></div>` : ''}
            </div>
          </div>
        `;

        PTL.components.messagePreview.open({
          title: `دعوة لـ ${inv.name}`,
          message,
          phone: inv.phone,
          personName: inv.name,
          contextHTML,
        });
      };
    });

    document.querySelectorAll('.cancel-invite').forEach(btn => {
      btn.onclick = async () => {
        const confirmed = await confirmDialog({
          title: 'إلغاء الدعوة',
          message: 'الرابط ده مش هيشتغل بعد كده. متأكد؟',
          confirmLabel: 'احذف',
          destructive: true,
        });
        if (!confirmed) return;
        const { error } = await sb.from('invitations').delete().eq('id', btn.dataset.id);
        if (error) { toast(error.message, 'error'); return; }
        toast('تم إلغاء الدعوة');
        await renderPeople();
      };
    });
  }

  PTL.routes['/people'] = renderPeople;
})();
