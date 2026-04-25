// ==========================================================================
// PTL — Component: Book Assets
// ==========================================================================
// Manages uploaded files (manuscripts, covers, images, tools) per book.
// Uses Supabase Storage bucket 'book-assets' (must be created manually).
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast, formatDate, avatarHTML } = utils;

  const BUCKET = 'book-assets';

  const ASSET_TYPES = {
    manuscript: { label: 'مسودة', icon: '📄', color: '#1e3a5f' },
    cover:      { label: 'غلاف',  icon: '🎨', color: '#704a1a' },
    image:      { label: 'صورة',  icon: '🖼️', color: '#5a3a1e' },
    tool:       { label: 'أداة',  icon: '🛠️', color: '#2d7a4a' },
    other:      { label: 'أخرى',  icon: '📎', color: '#666666' },
  };

  function isImage(mime) {
    return mime?.startsWith('image/');
  }

  function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  const bookAssets = {
    async load(bookId, mountId, steps) {
      const mount = $(mountId);
      if (!mount) return;
      mount.innerHTML = '<div class="loading"><span>جاري التحميل</span><span class="spinner"></span></div>';

      const { data: assets, error } = await sb.from('book_assets')
        .select('*, uploader:people!uploaded_by(id, name)')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });

      if (error) {
        mount.innerHTML = `<div class="alert alert-error">مشكلة في تحميل الملفات: ${escapeHtml(error.message)}</div>`;
        return;
      }

      render(mount, assets || [], bookId, steps);
    },
  };

  function render(mount, assets, bookId, steps) {
    mount.innerHTML = `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الملفات والأصول <span class="panel-title-meta">· ${assets.length} ملف</span></h3>
          ${PTL.perms.canEdit() ? `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" id="add-link-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                إضافة رابط
              </button>
              <button class="btn btn-primary btn-sm" id="upload-asset-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                رفع ملف
              </button>
            </div>
          ` : ''}
        </div>
        <div class="panel-body">
          ${assets.length === 0
            ? `<div class="empty-state" style="padding: 40px 24px;">
                <div style="font-size:36px; margin-bottom:10px;">📁</div>
                <div class="empty-state-title">مفيش ملفات لسه</div>
                <div class="empty-state-sub">${PTL.perms.canEdit() ? 'ارفع ملف، أو أضف رابط من Google Drive / Dropbox / أي مكان' : 'لم يتم إضافة ملفات بعد'}</div>
              </div>`
            : `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px;">
                ${assets.map(a => renderAssetCard(a)).join('')}
              </div>`}
        </div>
      </section>
    `;

    if (!PTL.perms.canEdit()) return;

    const uploadBtn = $('upload-asset-btn');
    if (uploadBtn) uploadBtn.onclick = () => openUploadModal(bookId, steps);

    const linkBtn = $('add-link-btn');
    if (linkBtn) linkBtn.onclick = () => openLinkModal(bookId, steps);

    mount.querySelectorAll('.delete-asset').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const asset = assets.find(a => a.id === btn.dataset.id);
        const confirmed = await confirmDialog({
          title: 'حذف الملف',
          message: `هل أنت متأكد من حذف "${asset.name}"؟`,
          confirmLabel: 'احذف',
          destructive: true,
        });
        if (!confirmed) return;
        await deleteAsset(asset, bookId, steps);
      };
    });
  }

  function renderAssetCard(asset) {
    const type = ASSET_TYPES[asset.asset_type] || ASSET_TYPES.other;
    const isLink = asset.asset_kind === 'link';

    // Build the open URL: external link OR Supabase storage public URL
    let openUrl;
    if (isLink) {
      openUrl = asset.external_url;
    } else {
      const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(asset.storage_path);
      openUrl = publicUrl;
    }

    const showPreview = !isLink && isImage(asset.mime_type);
    const linkProvider = isLink ? guessLinkProvider(asset.external_url) : null;

    return `
      <div style="background:white; border:1px solid var(--line); border-right:4px solid ${type.color}; border-radius:3px; overflow:hidden; transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='';this.style.boxShadow='';">
        ${showPreview
          ? `<div style="height:120px; background:var(--cream-50) center/cover no-repeat; background-image:url('${escapeHtml(openUrl)}'); border-bottom:1px solid var(--line);"></div>`
          : `<div style="height:80px; background:var(--cream-50); display:flex; align-items:center; justify-content:center; font-size:40px; border-bottom:1px solid var(--line); position:relative;">
              ${isLink ? '🔗' : type.icon}
              ${isLink && linkProvider ? `<span style="position:absolute; bottom:6px; left:8px; font-size:10px; color:var(--ink-500); background:white; padding:1px 6px; border-radius:8px;">${linkProvider}</span>` : ''}
            </div>`}
        <div style="padding:12px 14px;">
          <div style="font-size:13px; font-weight:700; color:var(--navy-800); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
            <span style="font-size:10.5px; padding:2px 8px; border-radius:10px; background:${type.color}15; color:${type.color}; font-weight:700;">${type.label}</span>
            ${isLink
              ? '<span style="font-size:10.5px; padding:2px 8px; border-radius:10px; background:#dde7f0; color:#1e3a5f; font-weight:700;">رابط</span>'
              : `<span style="font-size:11px; color:var(--ink-500);" class="latin">${formatBytes(asset.file_size)}</span>`}
          </div>
          ${asset.description ? `<div style="font-size:11.5px; color:var(--ink-500); margin-bottom:8px; line-height:1.4;">${escapeHtml(asset.description.slice(0, 80))}${asset.description.length > 80 ? '...' : ''}</div>` : ''}
          <div style="font-size:11px; color:var(--ink-400); margin-bottom:10px;">
            ${asset.uploader ? escapeHtml(asset.uploader.name) + ' · ' : ''}<span class="latin">${escapeHtml(formatDate(asset.created_at))}</span>
          </div>
          <div style="display:flex; gap:6px;">
            <a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="flex:1; justify-content:center;">
              ${isLink
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg> فتح'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> تحميل'}
            </a>
            ${PTL.perms.canEdit() ? `
              <button class="btn-icon danger delete-asset" data-id="${asset.id}" title="حذف">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function guessLinkProvider(url) {
    if (!url) return null;
    if (url.includes('drive.google.com')) return 'Google Drive';
    if (url.includes('docs.google.com')) return 'Google Docs';
    if (url.includes('dropbox.com')) return 'Dropbox';
    if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) return 'OneDrive';
    if (url.includes('wetransfer.com')) return 'WeTransfer';
    if (url.includes('notion.so') || url.includes('notion.site')) return 'Notion';
    if (url.includes('figma.com')) return 'Figma';
    return null;
  }

  function openUploadModal(bookId, steps) {
    const body = `
      <div class="form-group">
        <label>اختار ملف <span class="req">*</span></label>
        <input id="m-file" type="file" style="padding:10px; background:var(--cream-50); border:1px dashed var(--line-dark); border-radius:3px; width:100%;" />
        <div class="form-help">حد أقصى للحجم: 50 MB</div>
      </div>
      <div class="form-group">
        <label>اسم الملف <span class="opt">(لو فاضي يستعمل اسم الملف الأصلي)</span></label>
        <input id="m-name" type="text" placeholder="مثلاً: المسودة الأولى - الفصل الأول" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>النوع</label>
          <select id="m-type">
            ${Object.entries(ASSET_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>متعلق بمرحلة <span class="opt">(اختياري)</span></label>
          <select id="m-step">
            <option value="">— لا أحد —</option>
            ${(steps || []).map(s => `<option value="${s.id}">${s.step_order}. ${escapeHtml(s.name_ar)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>وصف <span class="opt">(اختياري)</span></label>
        <textarea id="m-desc" placeholder="نبذة عن الملف..."></textarea>
      </div>
      <div class="alert alert-info" style="margin-bottom:0;">
        <strong>💡 نصيحة:</strong> للملفات الكبيرة (أكتر من 5 MB)، الأفضل ترفعها على Google Drive واستعمل خيار "إضافة رابط" بدل ما ترفعها هنا — أسرع وما يستهلكش مساحة.
      </div>
    `;

    const { modal } = openModal({
      title: 'رفع ملف جديد',
      body,
      size: 'md',
      saveLabel: 'رفع',
      onSave: async () => {
        const fileInput = modal.querySelector('#m-file');
        const file = fileInput.files?.[0];
        if (!file) { toast('اختار ملف', 'error'); return false; }
        if (file.size > 50 * 1024 * 1024) { toast('الملف أكبر من 50 MB', 'error'); return false; }

        const customName = modal.querySelector('#m-name').value.trim();
        const assetType = modal.querySelector('#m-type').value;
        const stepId = modal.querySelector('#m-step').value || null;
        const description = modal.querySelector('#m-desc').value.trim() || null;

        // Upload to storage
        const ext = file.name.split('.').pop();
        const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
        const storagePath = `${bookId}/${Date.now()}_${safeBase}`;

        const { error: uploadErr } = await sb.storage
          .from(BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });

        if (uploadErr) {
          if (uploadErr.message?.includes('Bucket not found')) {
            toast('Bucket "book-assets" مش موجود. اعمله في Supabase Dashboard أولاً', 'error');
          } else {
            toast('مشكلة في الرفع: ' + uploadErr.message, 'error');
          }
          return false;
        }

        // Save metadata
        const { error: dbErr } = await sb.from('book_assets').insert({
          book_id: bookId,
          book_step_id: stepId,
          name: customName || file.name,
          description,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          asset_type: assetType,
          uploaded_by: state.person.id,
        });

        if (dbErr) {
          // Cleanup orphan file
          await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
          toast('مشكلة في حفظ البيانات: ' + dbErr.message, 'error');
          return false;
        }

        toast('تم رفع الملف ✓');
        await bookAssets.load(bookId, 'assets-mount', steps);
        return true;
      },
    });
  }

  async function deleteAsset(asset, bookId, steps) {
    // Only try to delete from storage if this is an uploaded file (not a link)
    if (asset.asset_kind !== 'link' && asset.storage_path) {
      await sb.storage.from(BUCKET).remove([asset.storage_path]).catch(err => {
        console.warn('Storage delete failed:', err);
      });
    }
    // Then from DB
    const { error } = await sb.from('book_assets').delete().eq('id', asset.id);
    if (error) { toast('مشكلة: ' + error.message, 'error'); return; }
    toast('تم الحذف');
    await bookAssets.load(bookId, 'assets-mount', steps);
  }

  // ============================================================================
  // ADD EXTERNAL LINK (Drive, Dropbox, etc.)
  // ============================================================================
  function openLinkModal(bookId, steps) {
    const body = `
      <div class="form-group">
        <label>الرابط <span class="req">*</span></label>
        <input id="m-url" type="url" class="ltr" placeholder="https://drive.google.com/..." style="direction:ltr;" />
        <div class="form-help">رابط من Google Drive، Dropbox، OneDrive، WeTransfer، Notion، أو أي مكان تاني</div>
      </div>
      <div class="form-group">
        <label>اسم الملف <span class="req">*</span></label>
        <input id="m-name" type="text" placeholder="مثلاً: المسودة الأولى - الفصل الأول" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>النوع</label>
          <select id="m-type">
            ${Object.entries(ASSET_TYPES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>متعلق بمرحلة <span class="opt">(اختياري)</span></label>
          <select id="m-step">
            <option value="">— لا أحد —</option>
            ${(steps || []).map(s => `<option value="${s.id}">${s.step_order}. ${escapeHtml(s.name_ar)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>وصف <span class="opt">(اختياري)</span></label>
        <textarea id="m-desc" placeholder="نبذة عن الملف..."></textarea>
      </div>
      <div class="alert alert-info" style="margin-bottom:0;">
        <strong>💡 نصيحة:</strong> تأكد إن صلاحيات الرابط مفتوحة (Anyone with the link can view) عشان كل الفريق يقدر يفتحه.
      </div>
    `;

    const { modal } = openModal({
      title: 'إضافة رابط خارجي',
      body,
      size: 'md',
      saveLabel: 'حفظ الرابط',
      onSave: async () => {
        const url = modal.querySelector('#m-url').value.trim();
        const name = modal.querySelector('#m-name').value.trim();
        const assetType = modal.querySelector('#m-type').value;
        const stepId = modal.querySelector('#m-step').value || null;
        const description = modal.querySelector('#m-desc').value.trim() || null;

        if (!url) { toast('الرابط مطلوب', 'error'); return false; }
        if (!name) { toast('الاسم مطلوب', 'error'); return false; }

        // Basic URL validation
        try { new URL(url); } catch (e) { toast('الرابط شكله مش صحيح', 'error'); return false; }

        const { error } = await sb.from('book_assets').insert({
          book_id: bookId,
          book_step_id: stepId,
          name,
          description,
          asset_kind: 'link',
          external_url: url,
          asset_type: assetType,
          uploaded_by: state.person.id,
        });

        if (error) { toast('مشكلة في الحفظ: ' + error.message, 'error'); return false; }

        toast('تم إضافة الرابط ✓');
        await bookAssets.load(bookId, 'assets-mount', steps);
        return true;
      },
    });
  }

  PTL.components.bookAssets = bookAssets;
})();
