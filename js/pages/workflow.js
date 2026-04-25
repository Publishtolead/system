// ==========================================================================
// PTL — Page: Workflow Template Editor
// ==========================================================================
// Manages the workflow_steps table — the master template used when creating
// new books. Each row can be edited (name, duration, role, parallel, optional)
// or deleted. New steps can be added.
//
// Critical option: "طبّق على الكتب الحالية" — by default ON, so changes
// propagate to all existing books that haven't completed those steps.
// ==========================================================================

(function() {
  'use strict';

  const { sb, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast } = utils;

  const PHASE_OPTIONS = {
    sales: 'المبيعات والتعاقد',
    discovery: 'الاكتشاف والاستراتيجية',
    writing: 'الكتابة والمراجعة',
    parallel_production: 'الإنتاج المتوازي',
    production: 'الإنتاج النهائي',
  };

  async function renderWorkflowEditor() {
    const [stepsRes, rolesRes, activeBookCount] = await Promise.all([
      sb.from('workflow_steps').select('*').order('step_order'),
      sb.from('roles').select('*').order('display_order'),
      sb.from('books').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    const steps = stepsRes.data || [];
    const roles = rolesRes.data || [];
    const activeBooks = activeBookCount.count || 0;

    // Workflow editing is admin-only
    if (!PTL.perms.canManageSystem()) {
      $('app-content').innerHTML = `
        <header class="page-header">
          <div>
            <div class="page-eyebrow">Workflow Template</div>
            <h1 class="page-title">إدارة الفلو</h1>
          </div>
        </header>
        <div class="alert alert-warn">
          <strong>صلاحية محظورة.</strong> إدارة الفلو متاحة للـ Admin فقط. لو محتاج تعديل، تواصل مع مدير النظام.
        </div>
      `;
      return;
    }

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Workflow Template</div>
          <h1 class="page-title">إدارة الفلو</h1>
          <p class="page-sub">القالب الأساسي للمراحل اللي بتتولّد لكل كتاب جديد · ${steps.length} مرحلة</p>
        </div>
        <button class="btn btn-primary" id="add-step-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
          إضافة مرحلة
        </button>
      </header>

      ${activeBooks > 0 ? `
        <div class="alert alert-warn" style="margin-bottom: 24px;">
          <strong>⚠ تنبيه:</strong> فيه ${activeBooks} كتاب نشط حالياً. أي تعديل هنا (لو شغّلت "طبّق على الكتب الحالية") هيأثر عليهم.
          المراحل المكتملة في الكتب الحالية لن تتأثر.
        </div>
      ` : ''}

      ${renderStepsTable(steps, roles)}
    `;

    // Wire up
    $('add-step-btn').onclick = () => openStepModal(null, roles, steps);
    document.querySelectorAll('.edit-step').forEach(btn => {
      btn.onclick = () => {
        const step = steps.find(s => s.id === btn.dataset.id);
        openStepModal(step, roles, steps);
      };
    });
    document.querySelectorAll('.delete-step').forEach(btn => {
      btn.onclick = () => deleteWorkflowStep(btn.dataset.id, btn.dataset.name);
    });
    document.querySelectorAll('.move-step').forEach(btn => {
      btn.onclick = () => moveStep(btn.dataset.id, btn.dataset.dir, steps);
    });
  }

  function renderStepsTable(steps, roles) {
    const rolesById = Object.fromEntries(roles.map(r => [r.id, r]));

    if (steps.length === 0) {
      return `
        <div class="panel">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">مفيش مراحل في الفلو</div>
            <div class="empty-state-sub">ابدأ بإضافة أول مرحلة</div>
          </div>
        </div>
      `;
    }

    // Group by phase
    const byPhase = {};
    steps.forEach(s => {
      const phase = s.phase || 'other';
      if (!byPhase[phase]) byPhase[phase] = [];
      byPhase[phase].push(s);
    });

    const phaseOrder = ['sales', 'discovery', 'writing', 'parallel_production', 'production'];

    return `
      <div class="panel">
        <div class="panel-body" style="padding: 12px;">
          ${phaseOrder.map(phase => {
            const phaseSteps = byPhase[phase];
            if (!phaseSteps?.length) return '';
            return `
              <div style="margin-bottom: 24px;">
                <div style="font-size:13px; font-weight:700; color:var(--gold-700); text-transform:uppercase; letter-spacing:0.1em; padding:8px 12px; margin-bottom:8px; border-bottom:1px solid var(--line);">
                  ${escapeHtml(PHASE_OPTIONS[phase] || phase)} · ${phaseSteps.length} مرحلة
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${phaseSteps.map(s => renderStepRow(s, rolesById, steps)).join('')}
                </div>
              </div>
            `;
          }).join('')}
          ${byPhase.other ? `
            <div style="margin-bottom: 24px;">
              <div style="font-size:13px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.1em; padding:8px 12px; margin-bottom:8px; border-bottom:1px solid var(--line);">
                أخرى · ${byPhase.other.length} مرحلة
              </div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${byPhase.other.map(s => renderStepRow(s, rolesById, steps)).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function renderStepRow(s, rolesById, allSteps) {
    const role = s.default_role_id ? rolesById[s.default_role_id] : null;
    const isFirst = s.step_order === Math.min(...allSteps.map(x => x.step_order));
    const isLast = s.step_order === Math.max(...allSteps.map(x => x.step_order));

    return `
      <div style="display:grid; grid-template-columns: 36px 1fr auto auto auto auto; gap:12px; align-items:center; padding:12px 14px; background:white; border:1px solid var(--line); border-right:3px solid ${role?.color || 'var(--ink-300)'}; border-radius:3px;">
        <div style="font-size:13px; font-weight:700; color:var(--ink-400); text-align:center;">${s.step_order}</div>

        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--navy-800);">${escapeHtml(s.name_ar)}</div>
          <div style="display:flex; gap:8px; align-items:center; margin-top:3px; flex-wrap:wrap;">
            ${role ? `<span style="font-size:11px; color:${role.color}; font-weight:600;">${escapeHtml(role.name_ar || role.name)}</span>` : '<span style="font-size:11px; color:var(--ink-400);">بدون دور</span>'}
            <span style="font-size:11px; color:var(--ink-500);">${s.default_duration_days || 5} يوم</span>
            ${s.has_revision_loop ? '<span style="font-size:11px; color:var(--gold-700);">🔁 يقبل تعديلات</span>' : ''}
            ${s.is_parallel ? `<span style="font-size:11px; color:var(--gold-700);">⫶ بالتوازي (${s.parallel_group || 'group'})</span>` : ''}
            ${s.is_optional ? '<span style="font-size:11px; color:var(--ink-400);">اختياري</span>' : ''}
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:2px;">
          <button class="btn-icon move-step" data-id="${s.id}" data-dir="up" title="حرّك لأعلى" ${isFirst ? 'disabled style="opacity:0.3;"' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button class="btn-icon move-step" data-id="${s.id}" data-dir="down" title="حرّك لأسفل" ${isLast ? 'disabled style="opacity:0.3;"' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>

        <button class="btn-icon edit-step" data-id="${s.id}" title="تعديل">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon danger delete-step" data-id="${s.id}" data-name="${escapeHtml(s.name_ar)}" title="حذف">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
        </button>
        <div></div>
      </div>
    `;
  }

  function openStepModal(step, roles, allSteps) {
    const isEdit = !!step;
    const maxOrder = Math.max(0, ...allSteps.map(s => s.step_order));

    const body = `
      <div class="form-group">
        <label>اسم المرحلة <span class="req">*</span></label>
        <input id="m-name-ar" type="text" value="${escapeHtml(step?.name_ar || '')}" placeholder="مثلاً: مراجعة الفصل الأول" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>المرحلة الأساسية</label>
          <select id="m-phase">
            ${Object.entries(PHASE_OPTIONS).map(([k, v]) => `<option value="${k}" ${step?.phase === k ? 'selected' : ''}>${v}</option>`).join('')}
            <option value="" ${!step?.phase ? 'selected' : ''}>أخرى</option>
          </select>
        </div>
        <div class="form-group">
          <label>المدة (بالأيام)</label>
          <input id="m-duration" type="number" min="1" value="${step?.default_duration_days || 5}" />
        </div>
      </div>

      <div class="form-group">
        <label>الدور المسؤول</label>
        <select id="m-role">
          <option value="">— بدون دور محدد —</option>
          ${roles.map(r => `<option value="${r.id}" ${step?.default_role_id === r.id ? 'selected' : ''}>${escapeHtml(r.name_ar || r.name)}</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="checkbox-row">
            <input id="m-revision" type="checkbox" ${step?.has_revision_loop ? 'checked' : ''} />
            <span>🔁 المرحلة دي بتقبل تعديلات (revision loop)</span>
          </label>
          <label class="checkbox-row">
            <input id="m-optional" type="checkbox" ${step?.is_optional ? 'checked' : ''} />
            <span>اختيارية (مش لازم تتم في كل كتاب)</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-row">
            <input id="m-parallel" type="checkbox" ${step?.is_parallel ? 'checked' : ''} />
            <span>⫶ بالتوازي مع غيرها</span>
          </label>
          <input id="m-parallel-group" type="text" value="${escapeHtml(step?.parallel_group || '')}" placeholder="اسم المجموعة (مثلاً: design_phase)" style="margin-top:6px; ${step?.is_parallel ? '' : 'opacity:0.5;'}" />
        </div>
      </div>

      ${!isEdit ? `
        <div class="form-group">
          <label>ترتيب المرحلة</label>
          <input id="m-order" type="number" min="1" value="${maxOrder + 1}" />
          <div class="form-help">رقم 1 هو أول مرحلة. لو حطيت رقم في النص، الـ ranges بتتعدل تلقائياً.</div>
        </div>
      ` : ''}

      <div style="border-top:1px solid var(--line); padding-top:14px; margin-top:8px;">
        <label class="checkbox-row">
          <input id="m-apply-existing" type="checkbox" checked />
          <span><strong>طبّق على الكتب الحالية</strong> — التعديل يأثر على الكتب الشغّالة (المراحل المكتملة لن تتأثر)</span>
        </label>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? `تعديل: ${step.name_ar}` : 'إضافة مرحلة جديدة',
      body,
      size: 'lg',
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => saveWorkflowStep(modal, step, allSteps),
    });

    // Toggle parallel_group field based on parallel checkbox
    const parallelCheck = modal.querySelector('#m-parallel');
    const parallelGroup = modal.querySelector('#m-parallel-group');
    parallelCheck.onchange = () => {
      parallelGroup.style.opacity = parallelCheck.checked ? '1' : '0.5';
      if (!parallelCheck.checked) parallelGroup.value = '';
    };
  }

  async function saveWorkflowStep(modal, step, allSteps) {
    const isEdit = !!step;
    const nameAr = modal.querySelector('#m-name-ar').value.trim();
    if (!nameAr) { toast('اسم المرحلة مطلوب', 'error'); return false; }

    const isParallel = modal.querySelector('#m-parallel').checked;
    const payload = {
      name_ar: nameAr,
      phase: modal.querySelector('#m-phase').value || null,
      default_role_id: modal.querySelector('#m-role').value || null,
      default_duration_days: parseInt(modal.querySelector('#m-duration').value, 10) || 5,
      has_revision_loop: modal.querySelector('#m-revision').checked,
      is_optional: modal.querySelector('#m-optional').checked,
      is_parallel: isParallel,
      parallel_group: isParallel ? (modal.querySelector('#m-parallel-group').value.trim() || null) : null,
    };

    const applyToExisting = modal.querySelector('#m-apply-existing').checked;
    let savedStepId = step?.id;

    if (isEdit) {
      const { error } = await sb.from('workflow_steps').update(payload).eq('id', step.id);
      if (error) { toast(error.message, 'error'); return false; }
    } else {
      payload.step_order = parseInt(modal.querySelector('#m-order').value, 10) || (allSteps.length + 1);
      payload.active = true;

      // Shift other steps if needed
      if (payload.step_order <= allSteps.length) {
        const stepsToShift = allSteps.filter(s => s.step_order >= payload.step_order);
        for (const s of stepsToShift) {
          await sb.from('workflow_steps').update({ step_order: s.step_order + 1 }).eq('id', s.id);
        }
      }

      const { data: newStep, error } = await sb.from('workflow_steps').insert(payload).select().single();
      if (error) { toast(error.message, 'error'); return false; }
      savedStepId = newStep.id;
    }

    // Apply to existing books if requested
    if (applyToExisting && savedStepId) {
      try {
        await applyChangesToActiveBooks(savedStepId, payload, isEdit);
      } catch (e) {
        console.error('Apply to existing failed:', e);
        toast('تم حفظ القالب لكن مشكلة في التطبيق على الكتب الحالية: ' + e.message, 'warn');
        await renderWorkflowEditor();
        return true;
      }
    }

    toast(isEdit ? 'تم حفظ التعديلات' : 'تم إضافة المرحلة');
    await renderWorkflowEditor();
    return true;
  }

  // Propagates template changes to active books
  async function applyChangesToActiveBooks(workflowStepId, payload, isEdit) {
    if (isEdit) {
      // Update matching book_steps that haven't been completed/skipped
      const updates = {};
      if (payload.name_ar) updates.name_ar = payload.name_ar;
      if (payload.default_duration_days) updates.default_duration_days = payload.default_duration_days;
      if (payload.has_revision_loop !== undefined) updates.has_revision_loop = payload.has_revision_loop;
      if (payload.is_parallel !== undefined) updates.is_parallel = payload.is_parallel;
      if (payload.parallel_group !== undefined) updates.parallel_group = payload.parallel_group;
      updates.updated_at = new Date().toISOString();

      await sb.from('book_steps')
        .update(updates)
        .eq('workflow_step_id', workflowStepId)
        .not('status', 'in', '(approved,skipped)');
    } else {
      // For new step: add it to all active books
      const { data: activeBooks } = await sb.from('books').select('id').eq('status', 'active');
      if (activeBooks?.length) {
        const newSteps = activeBooks.map(b => ({
          book_id: b.id,
          workflow_step_id: workflowStepId,
          step_order: payload.step_order,
          name_ar: payload.name_ar,
          status: 'pending',
          has_revision_loop: payload.has_revision_loop,
          is_parallel: payload.is_parallel,
          parallel_group: payload.parallel_group,
          default_duration_days: payload.default_duration_days,
        }));
        await sb.from('book_steps').insert(newSteps);
      }
    }
  }

  async function deleteWorkflowStep(id, name) {
    const confirmed = await confirmDialog({
      title: 'حذف مرحلة من القالب',
      message: `حذف "${name}" من القالب؟ المراحل دي في الكتب الحالية مش هتتأثر تلقائياً (لو عايز تحذفها من كتاب معين، روح للكتاب نفسه).`,
      confirmLabel: 'احذف',
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await sb.from('workflow_steps').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    toast('تم حذف المرحلة من القالب');
    await renderWorkflowEditor();
  }

  async function moveStep(id, dir, allSteps) {
    const sorted = [...allSteps].sort((a, b) => a.step_order - b.step_order);
    const idx = sorted.findIndex(s => s.id === id);
    if (idx === -1) return;

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];

    // Swap orders
    await sb.from('workflow_steps').update({ step_order: b.step_order }).eq('id', a.id);
    await sb.from('workflow_steps').update({ step_order: a.step_order }).eq('id', b.id);

    await renderWorkflowEditor();
  }

  PTL.routes['/workflow'] = renderWorkflowEditor;
})();
