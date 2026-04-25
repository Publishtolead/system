// ==========================================================================
// PTL — Component: Book Tasks
// ==========================================================================
// Manages custom/ad-hoc tasks attached to a specific book.
// These are separate from the workflow steps (which are the structured 20).
// Tasks are quick TODOs that come up during the work.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast, formatDate, todayISO, avatarHTML } = utils;

  const TASK_STATUS = {
    pending:     { label: 'في الانتظار', color: '#888888', bg: '#f4ede0' },
    in_progress: { label: 'جاري العمل',  color: '#1e3a5f', bg: '#dde7f0' },
    done:        { label: 'مكتمل',       color: '#2d7a4a', bg: '#d4ebda' },
  };

  const PRIORITY = {
    low:    { label: 'منخفضة', color: '#888888' },
    medium: { label: 'متوسطة', color: '#b8860b' },
    high:   { label: 'عالية',  color: '#a83232' },
    urgent: { label: 'عاجلة',  color: '#a83232' },
  };

  // ----- Public API -----
  const bookTasks = {
    async load(bookId, mountId, people) {
      const mount = $(mountId);
      if (!mount) return;
      mount.innerHTML = '<div class="loading"><span>جاري التحميل</span><span class="spinner"></span></div>';

      const { data: tasks, error } = await sb.from('book_tasks')
        .select('*, assignee:people!assignee_id(id, name)')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });

      if (error) {
        mount.innerHTML = `<div class="alert alert-error">مشكلة في تحميل المهام: ${escapeHtml(error.message)}</div>`;
        return;
      }

      render(mount, tasks || [], bookId, people);
    },
  };

  function render(mount, tasks, bookId, people) {
    const today = todayISO();
    const pending = tasks.filter(t => t.status !== 'done');
    const done = tasks.filter(t => t.status === 'done');

    mount.innerHTML = `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">مهام إضافية <span class="panel-title-meta">· مهام برّا الفلو</span></h3>
          ${PTL.perms.canEdit() ? `
            <button class="btn btn-primary btn-sm" id="add-task-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
              إضافة مهمة
            </button>
          ` : ''}
        </div>
        <div class="panel-body">
          ${tasks.length === 0
            ? `<div class="empty-state" style="padding: 32px;">
                <div style="font-size:13px;">${PTL.perms.canEdit() ? 'مفيش مهام إضافية لسه. أضف واحدة لو محتاج تتبع حاجة برّا الـ workflow.' : 'مفيش مهام إضافية للكتاب ده.'}</div>
              </div>`
            : `
              ${pending.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: ${done.length > 0 ? '20px' : '0'};">
                  ${pending.map(t => renderTaskCard(t, today)).join('')}
                </div>
              ` : ''}
              ${done.length > 0 ? `
                <details>
                  <summary style="cursor:pointer; font-size:13px; color:var(--ink-500); margin-bottom:10px;">عرض المهام المكتملة (${done.length})</summary>
                  <div style="display:flex; flex-direction:column; gap:6px; opacity:0.7;">
                    ${done.map(t => renderTaskCard(t, today)).join('')}
                  </div>
                </details>
              ` : ''}
            `}
        </div>
      </section>
    `;

    // Wire up — managers don't get any actions
    if (!PTL.perms.canEdit()) return;

    const addBtn = $('add-task-btn');
    if (addBtn) addBtn.onclick = () => openTaskModal(null, bookId, people);

    mount.querySelectorAll('.task-row').forEach(el => {
      el.querySelector('.task-status-btn').onclick = (e) => {
        e.stopPropagation();
        toggleTaskStatus(el.dataset.id, el.dataset.status, bookId, people);
      };
      el.onclick = () => {
        const task = tasks.find(t => t.id === el.dataset.id);
        openTaskModal(task, bookId, people);
      };
    });

    mount.querySelectorAll('.delete-task').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.id;
        const taskTitle = btn.dataset.title;
        const confirmed = await confirmDialog({
          title: 'حذف المهمة',
          message: `هل أنت متأكد من حذف "${taskTitle}"؟`,
          confirmLabel: 'احذف',
          destructive: true,
        });
        if (!confirmed) return;
        await sb.from('book_tasks').delete().eq('id', taskId);
        toast('تم الحذف');
        await bookTasks.load(bookId, mount.id, people);
      };
    });
  }

  function renderTaskCard(t, today) {
    const status = TASK_STATUS[t.status] || TASK_STATUS.pending;
    const priority = PRIORITY[t.priority] || PRIORITY.medium;
    const isOverdue = t.due_date && t.due_date < today && t.status !== 'done';
    const isDone = t.status === 'done';

    return `
      <div class="task-row" data-id="${t.id}" data-status="${t.status}" style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:${isDone ? 'var(--cream-50)' : 'white'}; border:1px solid var(--line); border-right:3px solid ${status.color}; border-radius:3px; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderRightWidth='4px';" onmouseout="this.style.borderRightWidth='3px';">
        <button type="button" class="task-status-btn" title="تغيير الحالة" style="width:22px; height:22px; border:2px solid ${status.color}; border-radius:4px; background:${isDone ? status.color : 'transparent'}; color:white; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${isDone ? '✓' : ''}
        </button>
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:600; color:var(--navy-800); ${isDone ? 'text-decoration:line-through; color:var(--ink-500);' : ''}">${escapeHtml(t.title)}</div>
          <div style="display:flex; gap:10px; align-items:center; margin-top:3px; font-size:12px; color:var(--ink-500); flex-wrap:wrap;">
            ${t.assignee ? `<span>👤 ${escapeHtml(t.assignee.name)}</span>` : ''}
            ${t.due_date ? `<span class="latin" style="color:${isOverdue ? 'var(--danger)' : 'var(--ink-500)'}; font-weight:${isOverdue ? '700' : '400'};">${isOverdue ? '⚠ ' : '📅 '}${escapeHtml(formatDate(t.due_date))}</span>` : ''}
            ${!isDone && t.priority && t.priority !== 'medium' ? `<span style="color:${priority.color}; font-weight:600;">⚡ ${priority.label}</span>` : ''}
          </div>
        </div>
        <button class="btn-icon danger delete-task" data-id="${t.id}" data-title="${escapeHtml(t.title)}" title="حذف" onclick="event.stopPropagation();">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
        </button>
      </div>
    `;
  }

  async function toggleTaskStatus(taskId, currentStatus, bookId, people) {
    let newStatus = 'in_progress';
    if (currentStatus === 'pending') newStatus = 'done';
    else if (currentStatus === 'in_progress') newStatus = 'done';
    else newStatus = 'pending'; // toggle back

    const updates = {
      status: newStatus,
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('book_tasks').update(updates).eq('id', taskId);
    if (error) { toast(error.message, 'error'); return; }
    await bookTasks.load(bookId, 'tasks-mount', people);
  }

  function openTaskModal(task, bookId, people) {
    const isEdit = !!task;
    const body = `
      <div class="form-group">
        <label>عنوان المهمة <span class="req">*</span></label>
        <input id="m-title" type="text" value="${escapeHtml(task?.title || '')}" placeholder="مثلاً: اتصل بالمطبعة لتأكيد الأسعار" />
      </div>
      <div class="form-group">
        <label>الوصف <span class="opt">(اختياري)</span></label>
        <textarea id="m-desc">${escapeHtml(task?.description || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>المسؤول</label>
          <select id="m-assignee">
            <option value="">— لم يُعيّن —</option>
            ${people.map(p => `<option value="${p.id}" ${task?.assignee_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>تاريخ الاستحقاق</label>
          <input id="m-due" type="date" class="ltr" value="${escapeHtml(task?.due_date || '')}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>الأولوية</label>
          <select id="m-priority">
            ${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${(task?.priority || 'medium') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>الحالة</label>
          <select id="m-status">
            ${Object.entries(TASK_STATUS).map(([k, v]) => `<option value="${k}" ${(task?.status || 'pending') === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? 'تعديل المهمة' : 'إضافة مهمة جديدة',
      body,
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => {
        const title = modal.querySelector('#m-title').value.trim();
        if (!title) { toast('عنوان المهمة مطلوب', 'error'); return false; }

        const status = modal.querySelector('#m-status').value;
        const payload = {
          title,
          description: modal.querySelector('#m-desc').value.trim() || null,
          assignee_id: modal.querySelector('#m-assignee').value || null,
          due_date: modal.querySelector('#m-due').value || null,
          priority: modal.querySelector('#m-priority').value,
          status,
          completed_at: status === 'done' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        };

        if (isEdit) {
          const { error } = await sb.from('book_tasks').update(payload).eq('id', task.id);
          if (error) { toast(error.message, 'error'); return false; }
          toast('تم الحفظ');
        } else {
          payload.book_id = bookId;
          payload.created_by = state.person.id;
          const { error } = await sb.from('book_tasks').insert(payload);
          if (error) { toast(error.message, 'error'); return false; }
          toast('تم إضافة المهمة');
        }

        await bookTasks.load(bookId, 'tasks-mount', people);
        return true;
      },
    });
  }

  PTL.components.bookTasks = bookTasks;
})();
