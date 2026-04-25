// ==========================================================================
// PTL — Page: Books (List)
// ==========================================================================
// Lists all books with status, current stage, and overdue indicators.
// Creating a book auto-instantiates all workflow steps as book_steps.
// ==========================================================================

(function() {
  'use strict';

  const { sb, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast, formatDate, todayISO } = utils;

  // Status labels for books
  const BOOK_STATUS = {
    active: { label: 'نشط', color: '#2d7a4a', bg: '#d4ebda' },
    paused: { label: 'متوقف مؤقتاً', color: '#b8860b', bg: '#fdf9f0' },
    completed: { label: 'مكتمل', color: '#1e3a5f', bg: '#dde7f0' },
    cancelled: { label: 'ملغي', color: '#666666', bg: '#eeeeee' },
  };

  // Language labels
  const LANGUAGES = {
    arabic_white: 'عربي أبيض',
    arabic_fusha: 'فصحى',
    arabic_ammeya: 'عامية',
    english: 'English',
  };

  async function renderBooks() {
    const today = todayISO();

    const [booksRes, authorsRes, peopleRes] = await Promise.all([
      sb.from('books')
        .select(`
          *,
          author:authors(id, name),
          owner:people!owner_id(id, name),
          book_steps(id, status, name_ar, started_at, due_date, step_order)
        `)
        .order('created_at', { ascending: false }),
      sb.from('authors').select('id, name').order('name'),
      sb.from('people')
        .select('id, name, person_roles(role_id)')
        .eq('active', true).order('name'),
    ]);

    const books = booksRes.data || [];
    const authors = authorsRes.data || [];
    const people = peopleRes.data || [];

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Books</div>
          <h1 class="page-title">الكتب</h1>
          <p class="page-sub">كل الكتب اللي شغّالين عليها مع مرحلتها الحالية</p>
        </div>
        ${PTL.perms.canEdit() ? `
          <button class="btn btn-primary" id="add-book-btn" ${authors.length === 0 ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة كتاب
          </button>
        ` : ''}
      </header>

      ${authors.length === 0 ? `
        <div class="alert alert-warn">
          <strong>محتاج تضيف مؤلفين الأول.</strong>
          كل كتاب لازم يكون مرتبط بمؤلف.
          <button class="btn btn-sm btn-ghost" style="margin-right:8px;" onclick="window.location.hash='#/authors'">روح للمؤلفين</button>
        </div>
      ` : ''}

      <div class="panel">
        ${books.length === 0 ? renderEmpty(authors.length > 0) : renderTable(books, today)}
      </div>
    `;

    if (authors.length > 0 && PTL.perms.canEdit()) {
      const addBtn = $('add-book-btn');
      if (addBtn) addBtn.onclick = () => openBookModal(null, authors, people);
    }

    document.querySelectorAll('.book-row').forEach(row => {
      row.onclick = (e) => {
        if (e.target.closest('.actions-cell')) return;
        window.location.hash = `#/book/${row.dataset.id}`;
      };
    });

    document.querySelectorAll('.edit-book').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const book = books.find(b => b.id === btn.dataset.id);
        openBookModal(book, authors, people);
      };
    });

    document.querySelectorAll('.delete-book').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteBook(btn.dataset.id, btn.dataset.title);
      };
    });
  }

  function renderEmpty(canAdd) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">مفيش كتب في النظام بعد</div>
        <div class="empty-state-sub">${canAdd ? 'ابدأ بإضافة أول كتاب' : 'لازم تضيف مؤلف الأول'}</div>
        ${canAdd ? '<button class="btn btn-primary" onclick="document.getElementById(\'add-book-btn\').click()">إضافة كتاب</button>' : ''}
      </div>
    `;
  }

  function getCurrentStage(steps, today) {
    if (!steps?.length) return null;
    // Sort by step_order
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
    // Find first non-approved/skipped step
    const current = sorted.find(s => !['approved', 'skipped'].includes(s.status));
    if (!current) return { label: 'مكتمل', overdue: false, daysIn: null };

    const daysIn = current.started_at
      ? Math.floor((Date.now() - new Date(current.started_at).getTime()) / 86400000)
      : null;
    const overdue = current.due_date && current.due_date < today;
    return {
      label: current.name_ar,
      status: current.status,
      overdue,
      daysIn,
      dueDate: current.due_date,
    };
  }

  function renderTable(books, today) {
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>الكتاب</th>
              <th>المؤلف</th>
              <th>المسؤول</th>
              <th>المرحلة الحالية</th>
              <th>الحالة</th>
              <th>تاريخ البداية</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${books.map(b => renderRow(b, today)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderRow(b, today) {
    const stage = getCurrentStage(b.book_steps, today);
    const totalSteps = (b.book_steps || []).length;
    const completedSteps = (b.book_steps || []).filter(s => ['approved', 'skipped'].includes(s.status)).length;
    const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const status = BOOK_STATUS[b.status] || BOOK_STATUS.active;

    return `
      <tr class="book-row" data-id="${b.id}" style="cursor:pointer;">
        <td>
          <div class="name-cell-text">
            <div class="name">${escapeHtml(b.title)}</div>
            ${b.subtitle ? `<div class="meta">${escapeHtml(b.subtitle)}</div>` : ''}
          </div>
        </td>
        <td style="font-size: 13.5px; color: var(--ink-700);">
          ${b.author ? escapeHtml(b.author.name) : '<span style="color:var(--ink-400);">—</span>'}
        </td>
        <td style="font-size: 13px; color: var(--ink-700);">
          ${b.owner ? escapeHtml(b.owner.name) : '<span style="color:var(--ink-400);">—</span>'}
        </td>
        <td>
          ${stage ? `
            <div style="font-size: 13px; font-weight: 600; color: var(--navy-800);">${escapeHtml(stage.label)}</div>
            <div style="margin-top:4px; display:flex; align-items:center; gap:8px;">
              <div style="flex:1; max-width: 120px; height: 4px; background: var(--cream-100); border-radius: 2px; overflow: hidden;">
                <div style="height:100%; width:${progressPct}%; background:${stage.overdue ? 'var(--danger)' : 'var(--gold-500)'};"></div>
              </div>
              <span style="font-size: 11px; color: var(--ink-500);">${completedSteps}/${totalSteps}</span>
            </div>
            ${stage.overdue ? '<div style="font-size:11px;color:var(--danger);margin-top:3px;font-weight:600;">⚠ متأخر</div>' : ''}
          ` : '<span style="color:var(--ink-400);font-size:13px;">—</span>'}
        </td>
        <td>
          <span class="status-tag" style="background:${status.bg};color:${status.color};">${status.label}</span>
        </td>
        <td style="font-size: 13px; color: var(--ink-500);" class="latin">
          ${formatDate(b.start_date)}
        </td>
        <td class="actions-cell">
          ${PTL.perms.canEdit() ? `
            <button class="btn-icon edit-book" data-id="${b.id}" title="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger delete-book" data-id="${b.id}" data-title="${escapeHtml(b.title)}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          ` : '<span style="color:var(--ink-400);font-size:11.5px;">— عرض فقط —</span>'}
        </td>
      </tr>
    `;
  }

  function openBookModal(book, authors, people) {
    const isEdit = !!book;
    const currentOwnerId = book?.owner_id || (isEdit ? null : PTL.state.person.id);
    const currentStartDate = book?.start_date || todayISO();

    const body = `
      <div class="form-group">
        <label>عنوان الكتاب <span class="req">*</span></label>
        <input id="m-title" type="text" value="${escapeHtml(book?.title || '')}" placeholder="مثلاً: طريقك لبناء Startup" />
      </div>
      <div class="form-group">
        <label>العنوان الفرعي <span class="opt">(اختياري)</span></label>
        <input id="m-subtitle" type="text" value="${escapeHtml(book?.subtitle || '')}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>المؤلف <span class="req">*</span></label>
          <div style="display:flex; gap:6px;">
            <select id="m-author" style="flex:1;">
              <option value="">اختار مؤلف...</option>
              ${authors.map(a => `<option value="${a.id}" ${book?.author_id === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
            </select>
            <button type="button" id="m-add-author" class="btn btn-ghost btn-sm" style="padding: 8px 12px; flex-shrink:0;" title="إضافة مؤلف جديد">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
        <div class="form-group">
          <label>المسؤول عن الكتاب <span class="opt">(Owner)</span></label>
          <select id="m-owner">
            <option value="">— لم يُحدّد —</option>
            ${people.map(p => `<option value="${p.id}" ${currentOwnerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>اللغة</label>
          <select id="m-language">
            ${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${book?.language === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>النوع <span class="opt">(اختياري)</span></label>
          <input id="m-genre" type="text" value="${escapeHtml(book?.genre || '')}" placeholder="مثلاً: تطوير ذاتي، أعمال" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>تاريخ البداية</label>
          <input id="m-start-date" type="date" class="ltr" value="${escapeHtml(currentStartDate)}" />
        </div>
        <div class="form-group">
          <label>تاريخ النهاية المستهدف</label>
          <input id="m-target-date" type="date" class="ltr" value="${escapeHtml(book?.target_launch_date || '')}" />
        </div>
      </div>
      ${isEdit ? `
        <div class="form-group">
          <label>الحالة</label>
          <select id="m-status">
            ${Object.entries(BOOK_STATUS).map(([k, v]) => `<option value="${k}" ${book?.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label>ملاحظات</label>
        <textarea id="m-notes">${escapeHtml(book?.notes || '')}</textarea>
      </div>
      ${!isEdit ? `
        <div class="alert alert-info" style="margin-bottom:0;">
          <strong>هيحصل إيه بعد الإضافة؟</strong><br>
          النظام هيعمل تلقائياً كل الـ 20 خطوة كـ tasks للكتاب، وأي دور فيه شخص واحد بس هيتعيّن مباشرة.
        </div>
      ` : ''}
    `;

    const { modal } = openModal({
      title: isEdit ? `تعديل ${book.title}` : 'إضافة كتاب جديد',
      body,
      size: 'lg',
      saveLabel: isEdit ? 'حفظ' : 'إنشاء الكتاب',
      onSave: async () => saveBook(modal, book, people),
    });

    // Quick-add author button
    const addAuthorBtn = modal.querySelector('#m-add-author');
    if (addAuthorBtn) {
      addAuthorBtn.onclick = (e) => {
        e.preventDefault();
        if (!PTL.pages.authors?.openAuthorModal) return;
        PTL.pages.authors.openAuthorModal(null, {
          onCreated: (newAuthor) => {
            // Add the new author to the dropdown and select it
            const sel = modal.querySelector('#m-author');
            const opt = document.createElement('option');
            opt.value = newAuthor.id;
            opt.textContent = newAuthor.name;
            opt.selected = true;
            sel.appendChild(opt);
          }
        });
      };
    }
  }

  async function saveBook(modal, book, people) {
    const isEdit = !!book;
    const title = modal.querySelector('#m-title').value.trim();
    const author_id = modal.querySelector('#m-author').value;

    if (!title) { toast('عنوان الكتاب مطلوب', 'error'); return false; }
    if (!author_id) { toast('لازم تختار مؤلف', 'error'); return false; }

    const payload = {
      title,
      subtitle: modal.querySelector('#m-subtitle').value.trim() || null,
      author_id,
      owner_id: modal.querySelector('#m-owner').value || null,
      language: modal.querySelector('#m-language').value,
      genre: modal.querySelector('#m-genre').value.trim() || null,
      start_date: modal.querySelector('#m-start-date').value || null,
      target_launch_date: modal.querySelector('#m-target-date').value || null,
      notes: modal.querySelector('#m-notes').value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (isEdit) {
      payload.status = modal.querySelector('#m-status').value;
      const { error } = await sb.from('books').update(payload).eq('id', book.id);
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم حفظ التعديلات');
      PTL.app.navigate();
    } else {
      // Create the book
      const { data: newBook, error: bookErr } = await sb.from('books')
        .insert(payload).select().single();
      if (bookErr) { toast(bookErr.message, 'error'); return false; }

      // Auto-instantiate book_steps from workflow_steps
      const { data: workflowSteps, error: wfErr } = await sb.from('workflow_steps')
        .select('*').eq('active', true).order('step_order');
      if (wfErr) { toast('تم إنشاء الكتاب لكن مشكلة في تحميل الفلو: ' + wfErr.message, 'warn'); }
      else if (workflowSteps?.length) {
        const stepRows = workflowSteps.map(ws => ({
          book_id: newBook.id,
          workflow_step_id: ws.id,
          step_order: ws.step_order,
          name_ar: ws.name_ar,
          status: 'pending',
          has_revision_loop: ws.has_revision_loop || false,
          is_parallel: ws.is_parallel || false,
          parallel_group: ws.parallel_group || null,
          default_duration_days: ws.default_duration_days || 5,
        }));
        const { error: stepsErr } = await sb.from('book_steps').insert(stepRows);
        if (stepsErr) { toast('الكتاب اتعمل لكن في مشكلة في إنشاء المراحل: ' + stepsErr.message, 'warn'); }

        // Auto-assign: for each unique role used in the workflow,
        // if exactly one person has that role, assign them automatically
        const usedRoleIds = [...new Set(workflowSteps.map(ws => ws.default_role_id).filter(Boolean))];
        const autoAssignments = [];
        usedRoleIds.forEach(roleId => {
          const eligible = (people || []).filter(p =>
            (p.person_roles || []).some(pr => pr.role_id === roleId)
          );
          if (eligible.length === 1) {
            autoAssignments.push({
              book_id: newBook.id,
              role_id: roleId,
              person_id: eligible[0].id,
            });
          }
        });
        if (autoAssignments.length) {
          await sb.from('book_assignments').insert(autoAssignments);
        }
      }

      // Activity log
      await sb.from('activity_log').insert({
        book_id: newBook.id,
        action: 'book_created',
        actor_id: PTL.state.person.id,
        description: `تم إنشاء الكتاب: ${title}`,
      });

      toast('تم إنشاء الكتاب وإعداد كل المراحل! 🎉');
      window.location.hash = `#/book/${newBook.id}`;
    }
    return true;
  }

  async function deleteBook(id, title) {
    const confirmed = await confirmDialog({
      title: 'حذف كتاب',
      message: `هل أنت متأكد من حذف "${title}"؟ هذا سيمسح كل المراحل والمهام المرتبطة بالكتاب. لا يمكن التراجع.`,
      confirmLabel: 'نعم، احذف',
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await sb.from('books').delete().eq('id', id);
    if (error) toast('مشكلة في الحذف: ' + error.message, 'error');
    else { toast('تم الحذف'); await renderBooks(); }
  }

  PTL.routes['/books'] = renderBooks;
  PTL.pages.books = { openBookModal };
})();
