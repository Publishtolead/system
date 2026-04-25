// ==========================================================================
// PTL — Component: Message Preview
// ==========================================================================
// Reusable modal for previewing, editing, copying, and sending messages.
// Used by:
//   - Daily reminders (tasks page)
//   - Member invitations (people page)
//   - Book status updates (book detail page)
//
// Usage:
//   PTL.components.messagePreview.open({
//     title: 'تذكير يومي لمصطفى',
//     message: 'النص الافتراضي...',
//     phone: '+201001234567',  // optional - enables WhatsApp button
//     personName: 'مصطفى',     // optional - shown in modal header
//     contextHTML: '<div>...</div>', // optional - extra context above textarea
//   });
// ==========================================================================

(function() {
  'use strict';

  const { utils } = PTL;
  const { escapeHtml, openModal, toast } = utils;

  const messagePreview = {
    open({ title, message, phone, personName, contextHTML, sendLabel = 'إرسال بالواتساب' }) {
      const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : null;
      const hasPhone = !!cleanPhone;

      const body = `
        ${contextHTML || ''}

        <div class="form-group">
          <label>
            ✏️ نص الرسالة
            <span style="font-weight: 400; color: var(--ink-500); font-size: 12px; margin-right: 8px;">— تقدر تعدل عليها قبل ما تبعت</span>
          </label>
          <textarea id="msg-textarea" style="min-height: 280px; font-family: var(--body); line-height: 1.7; font-size: 14px; direction: rtl; text-align: right;">${escapeHtml(message)}</textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
            <span class="form-help" style="margin: 0;">
              <span id="msg-char-count">${message.length}</span> حرف
            </span>
            ${personName ? `<span class="form-help" style="margin: 0;">للإرسال إلى: <strong style="color: var(--navy-800);">${escapeHtml(personName)}</strong></span>` : ''}
          </div>
        </div>

        ${!hasPhone ? `
          <div class="alert alert-warn" style="margin-bottom: 0;">
            <strong>⚠ مفيش رقم واتساب.</strong> ضيف رقم من إدارة الفريق، أو انسخ الرسالة وابعتها يدوياً.
          </div>
        ` : ''}
      `;

      const { modal, close } = openModal({
        title,
        body,
        size: 'lg',
        // We replace the default footer with our own, so use noop onSave
        // and override the buttons after render.
        saveLabel: '',
        onSave: () => true,
      });

      // Replace the footer with custom action buttons
      const footer = modal.querySelector('.modal-footer');
      if (footer) {
        footer.innerHTML = `
          ${hasPhone ? `
            <a href="#" id="msg-send-btn" class="btn btn-gold" target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              ${escapeHtml(sendLabel)}
            </a>
          ` : ''}
          <button id="msg-copy-btn" class="btn ${hasPhone ? 'btn-ghost' : 'btn-primary'}" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            نسخ النص
          </button>
          <button class="btn btn-ghost modal-cancel" type="button">إغلاق</button>
        `;

        // Wire up custom buttons
        footer.querySelector('.modal-cancel').onclick = close;

        // Live char count
        const textarea = modal.querySelector('#msg-textarea');
        const charCount = modal.querySelector('#msg-char-count');
        textarea.addEventListener('input', () => {
          charCount.textContent = textarea.value.length;
          // Update WhatsApp link href live
          const sendBtn = footer.querySelector('#msg-send-btn');
          if (sendBtn && cleanPhone) {
            sendBtn.href = buildWaUrl(cleanPhone, textarea.value);
          }
        });

        // WhatsApp send link
        const sendBtn = footer.querySelector('#msg-send-btn');
        if (sendBtn && cleanPhone) {
          sendBtn.href = buildWaUrl(cleanPhone, message);
          sendBtn.onclick = () => {
            // Just let it open in new tab — close after a moment
            setTimeout(() => close(), 500);
          };
        }

        // Copy button
        const copyBtn = footer.querySelector('#msg-copy-btn');
        copyBtn.onclick = async () => {
          const text = textarea.value;
          try {
            await navigator.clipboard.writeText(text);
            toast('تم النسخ ✓');
            copyBtn.innerHTML = '✓ تم النسخ';
            setTimeout(() => {
              copyBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                نسخ النص
              `;
            }, 2000);
          } catch (e) {
            // Fallback
            textarea.select();
            try {
              document.execCommand('copy');
              toast('تم النسخ ✓');
            } catch (e2) {
              toast('مش قادر أنسخ. اعمل copy يدوي', 'error');
            }
          }
        };
      }
    },
  };

  function buildWaUrl(phone, text) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  PTL.components.messagePreview = messagePreview;
})();
