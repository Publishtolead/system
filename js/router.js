// ==========================================================================
// PTL — Router & App Shell
// ==========================================================================
// Handles hash-based routing and the app shell (sidebar + content area).
// Each page module registers itself in PTL.routes.
// ==========================================================================

(function() {
  'use strict';

  const { state, utils } = PTL;
  const { $, show, hide, escapeHtml, initials } = utils;

  const app = {};

  // ----- Show app shell (called after auth + person loaded) -----
  app.showApp = function() {
    hide('login-screen');
    hide('onboarding-screen');
    show('app-shell');

    // Update sidebar user card
    $('user-avatar').textContent = initials(state.person.name);
    $('user-name').textContent = state.person.name;
    const rolesText = (state.personRoles || [])
      .map(pr => pr.roles?.name_ar)
      .filter(Boolean)
      .join(' · ') || '—';
    $('user-role').textContent = rolesText;

    // Wire up sidebar nav clicks
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.onclick = () => { window.location.hash = el.dataset.route; };
    });

    // Initial route
    if (!window.location.hash) window.location.hash = '#/dashboard';
    app.navigate();
  };

  // ----- Refresh user info in sidebar (after profile edit) -----
  app.refreshUserCard = function() {
    if (!state.person) return;
    $('user-avatar').textContent = initials(state.person.name);
    $('user-name').textContent = state.person.name;
    const rolesText = (state.personRoles || [])
      .map(pr => pr.roles?.name_ar)
      .filter(Boolean)
      .join(' · ') || '—';
    $('user-role').textContent = rolesText;
  };

  // ----- Match a path against registered routes (supports :param patterns) -----
  // Returns { handler, params } or null
  function matchRoute(path) {
    // Try exact match first
    if (PTL.routes[path]) return { handler: PTL.routes[path], params: {} };

    // Pattern matching for :param routes
    const parts = path.split('/').filter(Boolean);
    for (const route in PTL.routes) {
      if (!route.includes(':')) continue;
      const pattern = route.split('/').filter(Boolean);
      if (pattern.length !== parts.length) continue;

      const params = {};
      let isMatch = true;
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i].startsWith(':')) {
          params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
        } else if (pattern[i] !== parts[i]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) return { handler: PTL.routes[route], params };
    }
    return null;
  }

  // ----- Determine which sidebar nav item should be active for a given path -----
  function activeNavRoute(path) {
    if (document.querySelector(`.nav-item[data-route="${path}"]`)) return path;
    // Map sub-routes back to parent nav (e.g. /book/abc → highlight /books)
    if (path.startsWith('/book/')) return '/books';
    return path;
  }

  // ----- Navigate to current hash route -----
  app.navigate = function() {
    const path = window.location.hash.slice(1) || '/dashboard';
    const matched = matchRoute(path) || { handler: PTL.routes['/dashboard'], params: {} };

    // Update active sidebar nav
    const navRoute = activeNavRoute(path);
    document.querySelectorAll('.nav-item[data-route]').forEach(el => {
      el.classList.toggle('active', el.dataset.route === navRoute);
    });

    // Render
    $('app-content').innerHTML = '<div class="loading"><span>جاري التحميل</span><span class="spinner"></span></div>';

    if (typeof matched.handler === 'function') {
      matched.handler(matched.params).catch(err => {
        console.error('Page render error:', err);
        $('app-content').innerHTML = `
          <div class="alert alert-error">
            <strong>حصل خطأ في تحميل الصفحة:</strong><br>
            ${escapeHtml(err.message || String(err))}
          </div>
        `;
      });
    }
  };

  // ----- Listen for hash changes -----
  window.addEventListener('hashchange', () => app.navigate());

  // Expose
  PTL.app = app;
})();
