// ==========================================================================
// PTL — Page: Dashboard
// ==========================================================================
// Overview page showing key stats, team list, roles, and quickstart prompts.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, avatarHTML, formatTodayDate, todayISO } = utils;

  async function renderDashboard() {
    const today = todayISO();

    const [peopleRes, authorsRes, rolesRes, stepsRes, booksRes, allStepsRes, overdueRes] = await Promise.all([
      sb.from('people').select('id, name, active, auth_user_id, is_admin, person_roles(roles(id, name_ar))').eq('active', true).order('name'),
      sb.from('authors').select('id', { count: 'exact', head: true }),
      sb.from('roles').select('*').order('display_order'),
      sb.from('workflow_steps').select('id').eq('active', true),
      sb.from('books')
        .select(`
          id, title, status, start_date,
          author:authors(name),
          owner:people!owner_id(name),
          book_steps(id, status, name_ar, due_date, started_at, step_order)
        `)
        .order('created_at', { ascending: false }),
      // For task-based completion %
      sb.from('book_steps').select('id, status'),
      sb.from('book_steps')
        .select('id', { count: 'exact', head: true })
        .lt('due_date', today)
        .not('status', 'in', '(approved,skipped)'),
    ]);

    const people = peopleRes.data || [];
    const roles = rolesRes.data || [];
    const books = booksRes.data || [];
    const allBookSteps = allStepsRes.data || [];

    const activeBooks = books.filter(b => b.status === 'active');
    const completedBooks = books.filter(b => b.status === 'completed').length;
    const totalBooks = books.length;

    // Task-based completion: completed steps / total steps across all books
    const totalTaskCount = allBookSteps.length;
    const completedTaskCount = allBookSteps.filter(s => ['approved', 'skipped'].includes(s.status)).length;
    const completionPct = totalTaskCount > 0 ? Math.round((completedTaskCount / totalTaskCount) * 100) : null;

    const overdueCount = overdueRes.count || 0;
    const authorsCount = authorsRes.count || 0;

    // Build role-to-people-count map
    const roleCounts = {};
    people.forEach(p => {
      (p.person_roles || []).forEach(pr => {
        const rid = pr.roles?.id;
        if (rid) roleCounts[rid] = (roleCounts[rid] || 0) + 1;
      });
    });

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Dashboard</div>
          <h1 class="page-title">لوحة التحكم</h1>
          <p class="page-sub">نظرة عامة على شغل الفريق <span class="latin">— ${escapeHtml(formatTodayDate())}</span></p>
        </div>
        <div style="font-size:13px; color:var(--ink-500);">
          مرحباً، <strong style="color:var(--navy-800)">${escapeHtml(state.person.name)}</strong>
        </div>
      </header>

      ${authorsCount === 0 ? `
        <div class="quickstart fade-in">
          <div class="quickstart-text">
            <h3>لازال النظام فاضي — يلا نبدأ!</h3>
            <p>أول حاجة، ضيف المؤلفين اللي شغّال معاهم. بعدين هنقدر نضيف كتب ونبدأ الـ pipeline.</p>
          </div>
          <div class="quickstart-actions">
            <button class="btn btn-gold" onclick="window.location.hash='#/authors'">إضافة مؤلف</button>
            <button class="btn btn-on-dark" onclick="window.location.hash='#/people'">إدارة الفريق</button>
          </div>
        </div>
      ` : (totalBooks === 0 ? `
        <div class="quickstart fade-in">
          <div class="quickstart-text">
            <h3>عندك ${authorsCount} مؤلف — يلا نضيف أول كتاب!</h3>
            <p>لما تضيف كتاب، النظام هيعمل تلقائياً كل المراحل العشرين، ويدّيك تايم لاين كامل لمتابعة كل خطوة.</p>
          </div>
          <div class="quickstart-actions">
            <button class="btn btn-gold" onclick="window.location.hash='#/books'">إضافة أول كتاب</button>
          </div>
        </div>
      ` : '')}

      <div class="stats-grid stagger">
        <div class="stat-card">
          <div class="stat-label">الكتب النشطة</div>
          <div class="stat-value">${activeBooks.length}</div>
          <div class="stat-meta">${totalBooks > 0 ? `من إجمالي ${totalBooks} كتاب` : 'لم يتم إضافة كتب بعد'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">المؤلفين</div>
          <div class="stat-value">${authorsCount}</div>
          <div class="stat-meta">مؤلف في النظام</div>
        </div>
        <div class="stat-card ${overdueCount > 0 ? 'danger' : ''}">
          <div class="stat-label">مهام متأخرة</div>
          <div class="stat-value ${overdueCount > 0 ? 'danger' : ''}">${overdueCount}</div>
          <div class="stat-meta">${overdueCount > 0 ? 'تحتاج تدخل سريع' : 'تمام، مفيش متأخرات'}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">نسبة الإنجاز</div>
          <div class="stat-value ${completionPct === null ? 'muted' : ''}">${completionPct === null ? '—' : completionPct + '%'}</div>
          <div class="stat-meta">${completionPct === null ? 'هتظهر بعد إضافة مهام' : `${completedTaskCount} من ${totalTaskCount} مهمة`}</div>
        </div>
      </div>

      ${activeBooks.length > 0 ? renderActiveBooksPanel(activeBooks, today) : ''}

      <div class="stats-grid stagger" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="stat-card">
          <div class="stat-label">أعضاء الفريق</div>
          <div class="stat-value sm">${people.length}</div>
          <div class="stat-meta">${people.filter(p => p.auth_user_id).length} منهم دخل النظام</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">الأدوار</div>
          <div class="stat-value sm">${roles.length}</div>
          <div class="stat-meta">دور وظيفي معرّف</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">خطوات الفلو</div>
          <div class="stat-value sm">${stepsRes.data?.length ?? 0}</div>
          <div class="stat-meta">خطوة في pipeline الكتاب</div>
        </div>
      </div>

      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الفريق <span class="panel-title-meta">· ${people.length} أعضاء</span></h3>
          <button class="btn btn-ghost btn-sm" onclick="window.location.hash='#/people'">إدارة الفريق ←</button>
        </div>
        <div class="panel-body">
          ${people.length === 0 ? `
            <div class="empty-state"><div class="empty-state-title">مفيش أعضاء بعد</div></div>
          ` : `
            <div class="team-grid">
              ${people.map(p => {
                const personRoles = (p.person_roles || []).map(pr => pr.roles?.name_ar).filter(Boolean).join(' · ') || 'بدون دور';
                const isYou = p.id === state.person.id;
                return `
                  <div class="team-grid-card">
                    ${avatarHTML(p.name, 42)}
                    <div class="team-grid-card-info">
                      <div class="team-grid-card-name">${escapeHtml(p.name)}</div>
                      <div class="team-grid-card-roles">${escapeHtml(personRoles)}</div>
                    </div>
                    ${isYou
                      ? '<span class="status-tag you">انت</span>'
                      : (p.auth_user_id
                          ? '<span class="status-tag linked">مفعّل</span>'
                          : '<span class="status-tag unlinked">لم يدخل</span>')}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </section>

      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الأدوار في النظام <span class="panel-title-meta">· ${roles.length} دور</span></h3>
          <button class="btn btn-ghost btn-sm" onclick="window.location.hash='#/roles'">إدارة الأدوار ←</button>
        </div>
        <div class="panel-body">
          <div class="roles-grid">
            ${roles.map(r => `
              <div class="role-pill-card" style="border-right-color:${escapeHtml(r.color)}">
                <div class="role-name">${escapeHtml(r.name_ar || r.name)}</div>
                <div class="role-desc">${escapeHtml(r.description || '—')}</div>
                <div class="role-people-count">${roleCounts[r.id] || 0} شخص في هذا الدور</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <footer style="margin-top:48px; padding-top:24px; border-top:1px solid var(--line); text-align:center; font-size:13px; color:var(--ink-500);">
        <span class="latin">Publish to Lead Internal System</span> ·
        <span class="latin">v${escapeHtml(PTL.config.VERSION)} · ${escapeHtml(PTL.config.PHASE)}</span>
      </footer>
    `;
  }

  function renderActiveBooksPanel(activeBooks, today) {
    const cards = activeBooks.map(b => {
      const steps = b.book_steps || [];
      const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
      const total = sorted.length;
      const done = sorted.filter(s => ['approved', 'skipped'].includes(s.status)).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const current = sorted.find(s => !['approved', 'skipped'].includes(s.status));
      const isOverdue = current?.due_date && current.due_date < today;
      const daysIn = current?.started_at
        ? Math.floor((Date.now() - new Date(current.started_at).getTime()) / 86400000)
        : null;

      return `
        <div onclick="window.location.hash='#/book/${b.id}'" style="cursor:pointer; padding:18px; background:white; border:1px solid var(--line); border-right:4px solid ${isOverdue ? 'var(--danger)' : 'var(--gold-500)'}; border-radius:3px; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='';this.style.boxShadow='';">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:12px;">
            <div style="flex:1; min-width:0;">
              <div style="font-size:15px; font-weight:700; color:var(--navy-800); margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(b.title)}</div>
              <div style="font-size:12.5px; color:var(--ink-500);">
                ${b.author ? escapeHtml(b.author.name) : '—'}
                ${b.owner ? ` · المسؤول: ${escapeHtml(b.owner.name)}` : ''}
              </div>
            </div>
            <span style="font-size:13px; font-weight:700; color:${isOverdue ? 'var(--danger)' : 'var(--gold-700)'};">${pct}%</span>
          </div>
          <div style="height:6px; background:var(--cream-100); border-radius:3px; overflow:hidden; margin-bottom:10px;">
            <div style="height:100%; width:${pct}%; background:${isOverdue ? 'var(--danger)' : 'var(--gold-500)'};"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
            <div>
              <span style="color:var(--ink-500);">المرحلة: </span>
              <strong style="color:var(--navy-800);">${current ? escapeHtml(current.name_ar) : 'مكتمل'}</strong>
            </div>
            ${daysIn !== null ? `<span style="color:${isOverdue ? 'var(--danger)' : 'var(--ink-500)'}; font-weight:${isOverdue ? '700' : '400'};">${isOverdue ? '⚠ ' : ''}${daysIn} يوم</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">الوضع الحالي للكتب <span class="panel-title-meta">· ${activeBooks.length} كتاب نشط</span></h3>
          <button class="btn btn-ghost btn-sm" onclick="window.location.hash='#/books'">كل الكتب ←</button>
        </div>
        <div class="panel-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">
            ${cards}
          </div>
        </div>
      </section>
    `;
  }

  PTL.routes['/dashboard'] = renderDashboard;
})();
