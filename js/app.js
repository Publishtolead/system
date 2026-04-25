// ==========================================================================
// PTL — App Bootstrap
// ==========================================================================
// This file MUST be loaded LAST (after all other modules).
// It kicks off the auth flow which determines what to show.
// ==========================================================================

(function() {
  'use strict';

  // Sanity check: make sure all modules loaded
  const required = ['config', 'utils', 'auth', 'app'];
  for (const mod of required) {
    if (!PTL[mod]) {
      console.error(`PTL: required module "${mod}" is missing. Check script load order.`);
      document.body.innerHTML = `
        <div style="padding:40px; font-family:sans-serif; color:#a83232; text-align:center;">
          <h2>خطأ في تحميل النظام</h2>
          <p>الموديول "${mod}" مش موجود. اتأكد من ترتيب الـ scripts في index.html</p>
        </div>
      `;
      return;
    }
  }

  // Verify routes registered
  const expectedRoutes = ['/dashboard', '/people', '/authors', '/roles'];
  for (const route of expectedRoutes) {
    if (!PTL.routes[route]) {
      console.warn(`PTL: route "${route}" not registered`);
    }
  }

  // Start
  PTL.auth.bootstrap().catch(err => {
    console.error('Bootstrap failed:', err);
    document.body.innerHTML = `
      <div style="padding:40px; font-family:sans-serif; color:#a83232; text-align:center;">
        <h2>حصل خطأ في تشغيل النظام</h2>
        <p>${err.message || err}</p>
        <p style="font-size:13px; color:#666;">افتح Console (F12) للمزيد من التفاصيل</p>
      </div>
    `;
  });
})();
