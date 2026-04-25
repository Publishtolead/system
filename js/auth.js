// ==========================================================================
// PTL — Authentication & Onboarding
// ==========================================================================
// Handles: login, signup, session check, onboarding (first-time profile setup),
// and logout. Wires up all auth-related DOM events.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, show, hide, showAlert, clearAlert, toast, parseAuthError } = utils;

  const auth = {};

  // Pending invitation data (loaded from URL token)
  let pendingInvitation = null;

  // ----- Detect invitation token in URL -----
  // Format: ?invite=<token>  (preserved across login/signup)
  function getInviteToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('invite');
  }

  async function loadInvitation(token) {
    if (!token) return null;
    const { data, error } = await sb
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error) {
      console.warn('Invitation lookup failed:', error);
      return null;
    }
    if (!data) return { error: 'الدعوة غير موجودة' };
    if (data.used) return { error: 'الدعوة دي اتستخدمت قبل كده' };
    if (data.expires_at && new Date(data.expires_at) < new Date()) return { error: 'الدعوة دي انتهت صلاحيتها' };
    return data;
  }

  // ----- Bootstrap on page load -----
  auth.bootstrap = async function() {
    // Check for invitation token first
    const token = getInviteToken();
    if (token) {
      const inv = await loadInvitation(token);
      if (inv?.error) {
        // Show error in login alert
        showAlert('login-alert', inv.error);
      } else if (inv) {
        pendingInvitation = inv;
        // Auto-switch to signup mode
        if (!state.isSignupMode) {
          state.isSignupMode = true;
          $('login-title').textContent = 'إنشاء حساب جديد';
          $('login-sub').textContent = `مرحباً ${inv.name}! اكتب إيميل وكلمة سر للدخول`;
          $('login-submit').textContent = 'إنشاء حساب';
          $('toggle-text').textContent = 'عندك حساب؟';
          $('toggle-mode').textContent = 'تسجيل الدخول';
        }
        // Pre-fill email if invitation has it
        if (inv.email && !$('login-email').value) {
          $('login-email').value = inv.email;
        }
        showAlert('login-alert', `📨 دعوة من فريق Publish to Lead — مكتوبة باسم "${inv.name}"`, 'success');
      }
    }

    const { data: { session } } = await sb.auth.getSession();
    if (!session) return auth.showLogin();
    state.authUser = session.user;
    await auth.afterLogin();
  };

  // ----- Show login screen -----
  auth.showLogin = function() {
    hide('app-shell');
    hide('onboarding-screen');
    show('login-screen');
  };

  // ----- After successful sign-in: check if person exists -----
  auth.afterLogin = async function() {
    const { data: person, error } = await sb
      .from('people')
      .select('*, person_roles(role_id, roles(id, name, name_ar, color))')
      .eq('auth_user_id', state.authUser.id)
      .maybeSingle();

    if (error) {
      showAlert('login-alert', 'مشكلة في الاتصال بقاعدة البيانات: ' + error.message);
      return;
    }

    if (!person) return auth.showOnboarding();

    state.person = person;
    state.personRoles = person.person_roles || [];
    PTL.app.showApp();
  };

  // ----- Show onboarding (first-time profile setup) -----
  auth.showOnboarding = async function() {
    hide('login-screen');
    hide('app-shell');
    show('onboarding-screen');

    const { data: roles, error } = await sb.from('roles').select('id, name_ar, name').order('display_order');
    const container = $('onboarding-roles');
    if (error || !roles?.length) {
      container.innerHTML = '<div class="alert alert-error">لم نتمكن من تحميل الأدوار. تأكد من تشغيل الـ schema في Supabase.</div>';
      return;
    }

    // If we have a pending invitation, pre-fill name + roles
    let preselectedRoleIds = [];
    if (pendingInvitation) {
      $('onboarding-name').value = pendingInvitation.name || '';
      if (pendingInvitation.phone) $('onboarding-phone').value = pendingInvitation.phone;
      preselectedRoleIds = pendingInvitation.invited_role_ids || [];

      // Show invitation banner
      const alertEl = $('onboarding-alert');
      if (alertEl) {
        alertEl.innerHTML = `<div class="alert alert-success">📨 دعوة جاهزة لـ <strong>${pendingInvitation.name}</strong>. عدّل البيانات لو محتاج، وادوس حفظ.</div>`;
      }
    }

    utils.setupMultiPillSelect(
      container,
      roles.map(r => ({ id: r.id, label: r.name_ar || r.name })),
      preselectedRoleIds
    );
  };

  // ----- Logout -----
  auth.logout = async function() {
    await sb.auth.signOut();
    PTL.state.authUser = null;
    PTL.state.person = null;
    PTL.state.personRoles = [];
    PTL.state.isSignupMode = false;
    window.location.hash = '';
    auth.showLogin();
  };

  // ==========================================================================
  // EVENT WIRING
  // ==========================================================================

  // ----- Login form: toggle signup/login mode -----
  $('toggle-mode').addEventListener('click', () => {
    state.isSignupMode = !state.isSignupMode;
    $('login-title').textContent = state.isSignupMode ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
    $('login-sub').textContent = state.isSignupMode
      ? 'سجّل أول مرة عشان تنضم للفريق'
      : 'ادخل بحسابك لمتابعة الكتب والمهام';
    $('login-submit').textContent = state.isSignupMode ? 'إنشاء حساب' : 'دخول';
    $('toggle-text').textContent = state.isSignupMode ? 'عندك حساب؟' : 'حساب جديد؟';
    $('toggle-mode').textContent = state.isSignupMode ? 'تسجيل الدخول' : 'إنشاء حساب';
    clearAlert('login-alert');
  });

  // ----- Login form: submit -----
  $('login-submit').addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return showAlert('login-alert', 'الإيميل وكلمة المرور مطلوبين');
    if (password.length < 6) return showAlert('login-alert', 'كلمة المرور لازم 6 حروف على الأقل');

    const btn = $('login-submit');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner" style="border-top-color:white;margin:0;"></span>';

    try {
      if (state.isSignupMode) {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          showAlert('login-alert', 'تم إنشاء الحساب! اتفقد إيميلك لتأكيد الحساب', 'success');
          btn.disabled = false; btn.textContent = originalText;
          return;
        }
        state.authUser = data.user;
        await auth.afterLogin();
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        state.authUser = data.user;
        await auth.afterLogin();
      }
    } catch (err) {
      showAlert('login-alert', parseAuthError(err));
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // ----- Onboarding: submit -----
  $('onboarding-submit').addEventListener('click', async () => {
    const name = $('onboarding-name').value.trim();
    const phone = $('onboarding-phone').value.trim();
    const selectedRoleIds = utils.getMultiPillSelected($('onboarding-roles'));
    clearAlert('onboarding-alert');

    if (!name) return showAlert('onboarding-alert', 'لازم تكتب اسمك');
    if (selectedRoleIds.length === 0) return showAlert('onboarding-alert', 'اختار دور واحد على الأقل');

    const btn = $('onboarding-submit');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.innerHTML = '<span class="spinner" style="border-top-color:white;margin:0;"></span>';

    try {
      // First registered user becomes admin automatically
      const { count: adminCount } = await sb
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', true);
      const isFirstAdmin = !adminCount || adminCount === 0;

      const { data: newPerson, error: personErr } = await sb.from('people').insert({
        name,
        phone: phone || null,
        email: state.authUser.email,
        auth_user_id: state.authUser.id,
        active: true,
        is_admin: isFirstAdmin,
      }).select().single();
      if (personErr) throw personErr;

      const roleRows = selectedRoleIds.map(rid => ({ person_id: newPerson.id, role_id: rid }));
      const { error: prErr } = await sb.from('person_roles').insert(roleRows);
      if (prErr) throw prErr;

      // Mark invitation as used (if any)
      if (pendingInvitation) {
        await sb.from('invitations')
          .update({
            used: true,
            used_by: newPerson.id,
            used_at: new Date().toISOString(),
          })
          .eq('id', pendingInvitation.id);
        // Clear the invite param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
        pendingInvitation = null;
      }

      toast('أهلاً بك في النظام! 🎉');
      await auth.afterLogin();
    } catch (err) {
      showAlert('onboarding-alert', err.message || 'حصل خطأ');
      btn.disabled = false;
      btn.textContent = orig;
    }
  });

  // ----- Onboarding: logout instead -----
  $('onboarding-logout').addEventListener('click', auth.logout);

  // ----- App shell: logout button -----
  $('logout-btn').addEventListener('click', auth.logout);

  // Expose
  PTL.auth = auth;
})();
