// ==========================================================================
// PTL — Page: Authors
// ==========================================================================
// CRUD for authors (the clients). Each author can have multiple books.
// ==========================================================================

(function() {
  'use strict';

  const { sb, utils } = PTL;
  const { $, escapeHtml, avatarHTML, openModal, confirmDialog, toast } = utils;

  async function renderAuthors() {
    const { data: authors, error } = await sb
      .from('authors')
      .select('*, books(id)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Authors</div>
          <h1 class="page-title">المؤلفين</h1>
          <p class="page-sub">قاعدة بيانات المؤلفين اللي شغّالين معاهم</p>
        </div>
        ${PTL.perms.canEdit() ? `
          <button class="btn btn-primary" id="add-author-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>
            إضافة مؤلف
          </button>
        ` : ''}
      </header>

      <div class="panel">
        ${(authors || []).length === 0 ? renderEmpty() : renderTable(authors)}
      </div>
    `;

    if (PTL.perms.canEdit()) {
      const addBtn = $('add-author-btn');
      if (addBtn) addBtn.onclick = () => openAuthorModal(null);
    }
    document.querySelectorAll('.edit-author').forEach(btn => {
      btn.onclick = () => {
        const author = authors.find(a => a.id === btn.dataset.id);
        openAuthorModal(author);
      };
    });
    document.querySelectorAll('.delete-author').forEach(btn => {
      btn.onclick = () => deleteAuthor(
        btn.dataset.id,
        btn.dataset.name,
        parseInt(btn.dataset.books, 10)
      );
    });
  }

  function renderEmpty() {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">✍️</div>
        <div class="empty-state-title">مفيش مؤلفين في النظام بعد</div>
        <div class="empty-state-sub">ابدأ بإضافة أول مؤلف عشان تقدر تضيف كتب</div>
        <button class="btn btn-primary" onclick="document.getElementById('add-author-btn').click()">إضافة مؤلف</button>
      </div>
    `;
  }

  function renderTable(authors) {
    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>التواصل</th>
              <th>الكوهورت</th>
              <th>الكتب</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${authors.map(a => renderRow(a)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderRow(a) {
    const bookCount = a.books?.length || 0;
    return `
      <tr>
        <td>
          <div class="name-cell">
            ${avatarHTML(a.name, 36)}
            <div class="name-cell-text">
              <div class="name">${escapeHtml(a.name)}</div>
              ${a.bio ? `<div class="meta">${escapeHtml(a.bio.slice(0, 60))}${a.bio.length > 60 ? '...' : ''}</div>` : ''}
            </div>
          </div>
        </td>
        <td>
          ${a.email ? `<div class="contact-line">${escapeHtml(a.email)}</div>` : ''}
          ${a.phone ? `<div class="contact-line contact-phone">${escapeHtml(a.phone)}</div>` : ''}
          ${!a.email && !a.phone ? '<span style="color:var(--ink-400);">—</span>' : ''}
        </td>
        <td style="font-size: 13px;">${escapeHtml(a.cohort || '—')}</td>
        <td>
          <span class="status-tag ${bookCount > 0 ? 'linked' : 'unlinked'}">
            ${bookCount} كتاب
          </span>
        </td>
        <td class="actions-cell">
          ${PTL.perms.canEdit() ? `
            <button class="btn-icon edit-author" data-id="${a.id}" title="تعديل">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger delete-author" data-id="${a.id}" data-name="${escapeHtml(a.name)}" data-books="${bookCount}" title="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          ` : '<span style="color:var(--ink-400);font-size:11.5px;">— عرض فقط —</span>'}
        </td>
      </tr>
    `;
  }

  function openAuthorModal(author, options = {}) {
    const isEdit = !!author;
    const onCreated = options.onCreated; // callback for quick-add from other pages
    const body = `
      <div class="form-group">
        <label>اسم المؤلف <span class="req">*</span></label>
        <input id="m-name" type="text" value="${escapeHtml(author?.name || '')}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input id="m-email" type="email" class="ltr" value="${escapeHtml(author?.email || '')}" />
        </div>
        <div class="form-group">
          <label>رقم الواتساب</label>
          <input id="m-phone" type="tel" class="ltr" value="${escapeHtml(author?.phone || '')}" placeholder="+201001234567" />
        </div>
      </div>
      <div class="form-group">
        <label>الكوهورت <span class="opt">(اختياري — مثلاً: الدفعة الأولى)</span></label>
        <input id="m-cohort" type="text" value="${escapeHtml(author?.cohort || '')}" />
      </div>
      <div class="form-group">
        <label>نبذة قصيرة عن المؤلف</label>
        <textarea id="m-bio" placeholder="مين المؤلف؟ خبراته؟ مجاله؟">${escapeHtml(author?.bio || '')}</textarea>
      </div>
      <div class="form-group">
        <label>ملاحظات داخلية <span class="opt">(للفريق فقط)</span></label>
        <textarea id="m-notes">${escapeHtml(author?.notes || '')}</textarea>
      </div>
    `;

    const { modal } = openModal({
      title: isEdit ? `تعديل ${author.name}` : 'إضافة مؤلف جديد',
      body,
      saveLabel: isEdit ? 'حفظ' : 'إضافة',
      onSave: async () => saveAuthor(modal, author, onCreated),
    });
  }

  async function saveAuthor(modal, author, onCreated) {
    const isEdit = !!author;
    const name = modal.querySelector('#m-name').value.trim();
    if (!name) { toast('اسم المؤلف مطلوب', 'error'); return false; }

    const payload = {
      name,
      email: modal.querySelector('#m-email').value.trim() || null,
      phone: modal.querySelector('#m-phone').value.trim() || null,
      cohort: modal.querySelector('#m-cohort').value.trim() || null,
      bio: modal.querySelector('#m-bio').value.trim() || null,
      notes: modal.querySelector('#m-notes').value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (isEdit) {
      const { error } = await sb.from('authors').update(payload).eq('id', author.id);
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم حفظ التعديلات');
      // Don't re-render if called from another page
      if (!onCreated) await renderAuthors();
    } else {
      const { data: newAuthor, error } = await sb.from('authors').insert(payload).select().single();
      if (error) { toast(error.message, 'error'); return false; }
      toast('تم إضافة المؤلف');
      if (onCreated) {
        onCreated(newAuthor);
      } else {
        await renderAuthors();
      }
    }
    return true;
  }

  async function deleteAuthor(id, name, booksCount) {
    const message = booksCount > 0
      ? `المؤلف "${name}" مرتبط بـ ${booksCount} كتاب. لو حذفته، الكتب هتفضل بس بدون مؤلف. هل أنت متأكد؟`
      : `هل أنت متأكد من حذف "${name}"؟`;

    const confirmed = await confirmDialog({
      title: 'حذف مؤلف',
      message,
      confirmLabel: 'نعم، احذف',
      destructive: true,
    });
    if (!confirmed) return;

    const { error } = await sb.from('authors').delete().eq('id', id);
    if (error) toast('مشكلة في الحذف: ' + error.message, 'error');
    else { toast('تم الحذف'); await renderAuthors(); }
  }

  PTL.routes['/authors'] = renderAuthors;
  PTL.pages.authors = { openAuthorModal };
})();
