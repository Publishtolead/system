// ==========================================================================
// PTL — Utility Functions
// ==========================================================================
// Generic helpers used across the app: DOM selectors, escaping, formatting,
// toast notifications, modal dialogs, and form widgets.
// All exported on PTL.utils
// ==========================================================================

(function() {
  'use strict';

  const utils = {};

  // ----- DOM helpers -----
  utils.$ = (id) => document.getElementById(id);
  utils.show = (id) => utils.$(id).classList.remove('hidden');
  utils.hide = (id) => utils.$(id).classList.add('hidden');

  // ----- Escaping -----
  utils.escapeHtml = (str) => {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  };

  // ----- Alerts (inline, in a fixed container) -----
  utils.showAlert = (containerId, message, type = 'error') => {
    const el = utils.$(containerId);
    if (el) el.innerHTML = `<div class="alert alert-${type}">${utils.escapeHtml(message)}</div>`;
  };
  utils.clearAlert = (containerId) => {
    const el = utils.$(containerId);
    if (el) el.innerHTML = '';
  };

  // ----- Avatars -----
  utils.initials = (name) => {
    if (!name) return '؟';
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  };

  utils.avatarColor = (name) => {
    let hash = 0;
    const s = name || '';
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#1e3a5f', '#5a3a1e', '#2d4a6b', '#704a1a', '#3a2a14', '#8b6914', '#0d1b2a'];
    return colors[Math.abs(hash) % colors.length];
  };

  utils.avatarHTML = (name, size = 36) => {
    return `<div class="user-avatar" style="background:${utils.avatarColor(name)};color:var(--gold-400);width:${size}px;height:${size}px;font-size:${Math.floor(size*0.42)}px;">${utils.escapeHtml(utils.initials(name))}</div>`;
  };

  // ----- Date formatting -----
  utils.formatDate = (d) => {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  utils.formatTodayDate = () => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  utils.todayISO = () => new Date().toISOString().slice(0, 10);

  // ----- Toast notifications -----
  utils.toast = (message, type = 'success') => {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    utils.$('toast-container').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3500);
  };

  // ----- Modal -----
  // openModal({ title, body, onSave, saveLabel, size })
  // - title: string
  // - body: HTML string
  // - onSave: async function(modalEl) — return false to keep modal open
  // - saveLabel: button text
  // - size: 'sm' | 'md' | 'lg'
  // Returns: { close, modal, backdrop }
  utils.openModal = ({ title, body, onSave, saveLabel = 'حفظ', size = 'md' }) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal-${size}">
        <div class="modal-header">
          <h3>${utils.escapeHtml(title)}</h3>
          <button class="modal-close" type="button" aria-label="إغلاق">×</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn btn-primary modal-save" type="button">${utils.escapeHtml(saveLabel)}</button>
          <button class="btn btn-ghost modal-cancel" type="button">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = () => backdrop.remove();
    backdrop.querySelector('.modal-close').onclick = close;
    backdrop.querySelector('.modal-cancel').onclick = close;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    const saveBtn = backdrop.querySelector('.modal-save');
    if (onSave) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        const orig = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="spinner" style="border-top-color:white;margin:0;"></span>';
        try {
          const result = await onSave(backdrop);
          if (result !== false) close();
          else { saveBtn.disabled = false; saveBtn.innerHTML = orig; }
        } catch (err) {
          utils.toast(err.message || 'حصل خطأ', 'error');
          saveBtn.disabled = false;
          saveBtn.innerHTML = orig;
        }
      };
    }

    return { close, modal: backdrop.querySelector('.modal'), backdrop };
  };

  // Confirmation dialog — returns Promise<boolean>
  utils.confirmDialog = ({ title, message, confirmLabel = 'تأكيد', destructive = false }) => {
    return new Promise(resolve => {
      let resolved = false;
      const { modal } = utils.openModal({
        title,
        size: 'sm',
        body: `<p style="margin:0; color: var(--ink-700); line-height: 1.6;">${utils.escapeHtml(message)}</p>`,
        saveLabel: confirmLabel,
        onSave: () => { resolved = true; resolve(true); return true; },
      });
      if (destructive) {
        const saveBtn = modal.querySelector('.modal-save');
        saveBtn.style.background = 'var(--danger)';
        saveBtn.style.color = 'white';
      }
      const observer = new MutationObserver(() => {
        if (!document.body.contains(modal)) {
          if (!resolved) resolve(false);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  };

  // ----- Multi-pill select widget -----
  // items: [{ id, label }]
  // selectedIds: array of ids
  utils.setupMultiPillSelect = (container, items, selectedIds = []) => {
    container.innerHTML = items.map(item => `
      <button type="button" class="pill ${selectedIds.includes(item.id) ? 'selected' : ''}" data-id="${utils.escapeHtml(item.id)}">
        ${utils.escapeHtml(item.label)}
      </button>
    `).join('');
    container.querySelectorAll('.pill').forEach(btn => {
      btn.onclick = (e) => { e.preventDefault(); btn.classList.toggle('selected'); };
    });
  };

  utils.getMultiPillSelected = (container) => {
    return [...container.querySelectorAll('.pill.selected')].map(b => b.dataset.id);
  };

  // ----- Friendly error parsing -----
  utils.parseAuthError = (err) => {
    if (!err?.message) return 'حصل خطأ';
    if (err.message.includes('Invalid login credentials')) return 'الإيميل أو كلمة المرور غلط';
    if (err.message.includes('User already registered')) return 'الإيميل ده مسجّل قبل كده، اعمل تسجيل دخول';
    if (err.message.includes('Email not confirmed')) return 'لازم تأكد إيميلك من الـ inbox أولاً';
    return err.message;
  };

  // Expose
  PTL.utils = utils;
})();
