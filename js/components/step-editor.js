// ==========================================================================
// PTL — Component: Book Step Editor
// ==========================================================================
// Inline modal for managing the workflow steps of a single book:
//   - Edit step name
//   - Edit duration (default_duration_days)
//   - Change assignee
//   - Delete a step
//   - Add a custom step
// All changes apply to THIS book only — they don't touch the workflow template.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast } = utils;

  const STEP_STATUS_LABELS = {
    pending:           { label: 'لم تبدأ',      color: '#888888' },
    in_progress:       { label: 'جاري',          color: '#1e3a5f' },
    awaiting_approval: { label: 'مراجعة',        color: '#b8860b' },
    needs_revision:    { label: 'تعديل',         color: '#a83232' },
    approved:          { label: 'مكتمل',         color: '#2d7a4a' },
    skipped:           { label: 'متخطى',         color: '#666666' },
  };

  const stepEditor = {
    // Open the editor modal
    // bookId: the book to edit steps for
    // steps: current book_steps (already loaded by caller)
    // people: active people list (for assignee dropdowns)
    // onSaved: callback after any save (to refresh the parent page)
    open(bookId, steps, people, onSaved) {
      const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order);

      const body = `
        <div style="font-size:13px; color:var(--ink-500); margin-bottom:14px; line-height:1.6;">
          عدّل الاسم، المدة بالأيام، أو المسؤول لكل مرحلة. التغييرات تنطبق على هذا الكتاب فقط.
          المراحل المكتملة لا يمكن تعديل اسمها أو مدتها.
        </div>

        <div class="step-list" id="step-edit-list">
          ${sortedSteps.map(s => renderEditRow(s, people)).join('')}
        </div>

        <div class="add-step-form" id="add-step-form">
          <input type="text" id="new-step-name" placeholder="اسم المرحلة الجديدة" style="padding:8px 10px; border:1px solid var(--line); border-radius:3px; font-size:13.5px;" />
          <input type="number" id="new-step-duration" placeholder="أيام" min="1" value="5" style="padding:8px 10px; border:1px solid var(--line); border-radius:3px; font-size:13px; text-align:center;" />
          <button type="button" class="btn btn-gold btn-sm" id="add-step-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            أضف
          </button>
        </div>
      `;

      const { modal, close } = openModal({
        title: 'تعديل مراحل الكتاب',
        body,
        size: 'lg',
        saveLabel: 'حفظ كل التغييرات',
        onSave: async () => {
          const ok = await saveAllChanges(modal, sortedSteps, bookId);
          if (ok && onSaved) onSaved();
          return ok;
        },
      });

      // Wire up delete buttons
      modal.querySelectorAll('.delete-step-btn').forEach(btn => {
        btn.onclick = async () => {
          const stepId = btn.dataset.id;
          const stepName = btn.dataset.name;
          const stepStatus = btn.dataset.status;
          const isCompleted = stepStatus === 'approved' || stepStatus === 'skipped';

          const confirmed = await confirmDialog({
            title: 'حذف مرحلة',
            message: isCompleted
              ? `"${stepName}" مرحلة مكتملة. حذفها هيشيل تاريخ إنجازها. هل أنت متأكد؟`
              : `هل أنت متأكد من حذف "${stepName}" من هذا الكتاب؟`,
            confirmLabel: 'احذف',
            destructive: true,
          });
          if (!confirmed) return;

          const { error } = await sb.from('book_steps').delete().eq('id', stepId);
          if (error) { toast(error.message, 'error'); return; }
          toast('تم الحذف');
          // Remove the row from the modal
          btn.closest('.step-list-item').remove();
          // Trigger reload after a short delay so user sees the toast
          if (onSaved) setTimeout(() => onSaved(), 300);
        };
      });

      // Add new step button
      modal.querySelector('#add-step-btn').onclick = async () => {
        const nameInput = modal.querySelector('#new-step-name');
        const durInput = modal.querySelector('#new-step-duration');
        const name = nameInput.value.trim();
        const duration = parseInt(durInput.value, 10) || 5;

        if (!name) { toast('اكتب اسم للمرحلة', 'error'); return; }

        // Find max step_order
        const maxOrder = Math.max(0, ...sortedSteps.map(s => s.step_order));

        const { data: newStep, error } = await sb.from('book_steps').insert({
          book_id: bookId,
          step_order: maxOrder + 1,
          name_ar: name,
          status: 'pending',
          default_duration_days: duration,
          has_revision_loop: false,
          is_parallel: false,
        }).select().single();

        if (error) { toast(error.message, 'error'); return; }

        toast('تم إضافة المرحلة');
        // Add it visually to the list
        const list = modal.querySelector('#step-edit-list');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderEditRow(newStep, people);
        list.appendChild(tempDiv.firstElementChild);
        // Reset inputs
        nameInput.value = '';
        durInput.value = '5';
        // Track for save
        sortedSteps.push(newStep);
      };
    },
  };

  function renderEditRow(s, people) {
    const isCompleted = ['approved', 'skipped'].includes(s.status);
    const status = STEP_STATUS_LABELS[s.status] || STEP_STATUS_LABELS.pending;

    return `
      <div class="step-list-item ${isCompleted ? 'is-completed' : ''}" data-step-id="${s.id}" data-original-name="${escapeHtml(s.name_ar)}" data-original-duration="${s.default_duration_days || 5}" data-original-assignee="${s.assignee_id || ''}">
        <div class="order">${s.step_order}</div>
        <input type="text" class="name-input" value="${escapeHtml(s.name_ar)}" ${isCompleted ? 'readonly' : ''} />
        <div style="display:flex; align-items:center; gap:4px;">
          <input type="number" class="duration-input" value="${s.default_duration_days || 5}" min="1" ${isCompleted ? 'readonly' : ''} />
          <span class="duration-suffix">يوم</span>
        </div>
        <select class="assignee-select">
          <option value="">— مسؤول —</option>
          ${people.map(p => `<option value="${p.id}" ${s.assignee_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn-icon danger delete-step-btn" data-id="${s.id}" data-name="${escapeHtml(s.name_ar)}" data-status="${s.status}" title="حذف">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
        </button>
      </div>
    `;
  }

  async function saveAllChanges(modal, originalSteps, bookId) {
    const rows = modal.querySelectorAll('.step-list-item');
    const updates = [];

    rows.forEach(row => {
      const stepId = row.dataset.stepId;
      const origName = row.dataset.originalName;
      const origDuration = parseInt(row.dataset.originalDuration, 10);
      const origAssignee = row.dataset.originalAssignee || null;

      const newName = row.querySelector('.name-input').value.trim();
      const newDuration = parseInt(row.querySelector('.duration-input').value, 10) || 5;
      const newAssignee = row.querySelector('.assignee-select').value || null;

      const changes = {};
      if (newName && newName !== origName) changes.name_ar = newName;
      if (newDuration !== origDuration) changes.default_duration_days = newDuration;
      if (newAssignee !== origAssignee) changes.assignee_id = newAssignee;

      if (Object.keys(changes).length > 0) {
        changes.updated_at = new Date().toISOString();
        updates.push({ stepId, changes });
      }
    });

    if (updates.length === 0) {
      toast('مفيش تغييرات للحفظ', 'info');
      return true;
    }

    // Apply updates sequentially (could be parallel but easier to debug)
    let failed = 0;
    for (const u of updates) {
      const { error } = await sb.from('book_steps').update(u.changes).eq('id', u.stepId);
      if (error) { failed++; console.error('Update failed:', error); }
    }

    if (failed === updates.length) {
      toast('فشل حفظ التغييرات', 'error');
      return false;
    } else if (failed > 0) {
      toast(`تم حفظ ${updates.length - failed} من ${updates.length} تغيير`, 'warn');
    } else {
      toast(`تم حفظ ${updates.length} تغيير`);
    }

    return true;
  }

  PTL.components.stepEditor = stepEditor;
})();
