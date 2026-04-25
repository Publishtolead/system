// ==========================================================================
// PTL — Page: Book Detail
// ==========================================================================
// Single book view with:
//   - Header (title, author, status, dates, edit)
//   - 3 countdown cards (total days, days in current stage, expected completion)
//   - Assignments panel (who's the AM/Writer/Editor/etc.)
//   - Timeline grouped by phase, with action buttons per step
//   - Stage transitions (start, approve, send for revision, skip)
//   - Auto-advance to next step (or parallel group) on approval
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, openModal, confirmDialog, toast, formatDate, todayISO, avatarHTML } = utils;

  const PHASES = {
    sales:               { label: 'المبيعات والتعاقد', short: 'Sales',         icon: '💼' },
    discovery:           { label: 'الاكتشاف والاستراتيجية', short: 'Discovery',    icon: '🧭' },
    writing:             { label: 'الكتابة والمراجعة',  short: 'Writing',       icon: '✍️' },
    parallel_production: { label: 'الإنتاج المتوازي',  short: 'Parallel',      icon: '🎨' },
    production:          { label: 'الإنتاج النهائي',    short: 'Production',    icon: '📦' },
    other:               { label: 'أخرى',              short: 'Other',         icon: '·' },
  };

  const STEP_STATUS = {
    pending:            { label: 'في الانتظار',     color: '#888888', bg: '#f4ede0' },
    in_progress:        { label: 'جاري العمل',      color: '#1e3a5f', bg: '#dde7f0' },
    awaiting_approval:  { label: 'بانتظار الموافقة', color: '#b8860b', bg: '#fdf9f0' },
    needs_revision:     { label: 'يحتاج تعديل',      color: '#a83232', bg: '#fdf2f2' },
    approved:           { label: 'مكتمل',            color: '#2d7a4a', bg: '#d4ebda' },
    skipped:            { label: 'متخطى',            color: '#666666', bg: '#eeeeee' },
  };

  const BOOK_STATUS_LABELS = {
    active: 'نشط', paused: 'متوقف مؤقتاً', completed: 'مكتمل', cancelled: 'ملغي',
  };

  const LANGUAGE_LABELS = {
    arabic_white: 'عربي أبيض', arabic_fusha: 'فصحى',
    arabic_ammeya: 'عامية', english: 'English',
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================
  async function renderBookDetail(params) {
    const bookId = params.id;
    if (!bookId) {
      $('app-content').innerHTML = '<div class="alert alert-error">معرف الكتاب مش موجود</div>';
      return;
    }

    // Fetch all data
    const [bookRes, stepsRes, rolesRes, peopleRes, assignmentsRes, workflowRes] = await Promise.all([
      sb.from('books').select('*, author:authors(id, name), owner:people!owner_id(id, name)').eq('id', bookId).maybeSingle(),
      sb.from('book_steps')
        .select('*, workflow_step:workflow_steps(default_role_id, phase, is_optional, default_duration_days)')
        .eq('book_id', bookId).order('step_order'),
      sb.from('roles').select('*').order('display_order'),
      sb.from('people')
        .select('id, name, person_roles(role_id)')
        .eq('active', true).order('name'),
      sb.from('book_assignments').select('role_id, person_id').eq('book_id', bookId),
      sb.from('workflow_steps').select('id, default_role_id, phase').eq('active', true),
    ]);

    if (bookRes.error || !bookRes.data) {
      const errMsg = bookRes.error?.message || 'الكتاب غير موجود';
      console.error('Book load failed:', bookRes.error);
      $('app-content').innerHTML = `
        <div class="alert alert-error">
          <strong>مشكلة في تحميل الكتاب:</strong><br>
          ${escapeHtml(errMsg)}
          ${errMsg.includes('owner_id') || errMsg.includes('column') ? '<br><br><strong>هل شغّلت <code>04_migration.sql</code>؟</strong> ده بيضيف عمود <code>owner_id</code> للكتاب.' : ''}
        </div>
      `;
      return;
    }

    const book = bookRes.data;
    const steps = stepsRes.data || [];
    const roles = rolesRes.data || [];
    const people = peopleRes.data || [];
    const assignments = assignmentsRes.data || [];
    const workflowSteps = workflowRes.data || [];

    // Build assignments map (role_id → person_id)
    const assignMap = {};
    assignments.forEach(a => { assignMap[a.role_id] = a.person_id; });

    // Get unique role IDs used by this book's workflow
    const usedRoleIds = [...new Set(workflowSteps.map(ws => ws.default_role_id).filter(Boolean))];
    const usedRoles = roles.filter(r => usedRoleIds.includes(r.id));

    // Calculate countdowns + projected dates for all steps
    const countdowns = calculateCountdowns(book, steps);
    const projectedDates = calculateProjectedDates(book, steps);

    // Group steps by phase
    const stepsByPhase = groupByPhase(steps);

    // Render
    $('app-content').innerHTML = `
      ${renderHeader(book, countdowns)}
      ${renderCountdownCards(countdowns)}
      ${renderAssignments(usedRoles, people, assignMap, book.id)}
      ${renderTimeline(stepsByPhase, people, assignMap, steps, projectedDates)}
      <div id="tasks-mount"></div>
      <div id="assets-mount"></div>
    `;

    // Wire up handlers
    wireUpHandlers(book, steps, people, assignMap);

    // Load components
    if (PTL.components?.bookTasks) PTL.components.bookTasks.load(book.id, 'tasks-mount', people);
    if (PTL.components?.bookAssets) PTL.components.bookAssets.load(book.id, 'assets-mount', steps);
  }

  // ==========================================================================
  // PROJECTED DATES (for steps that haven't started yet)
  // ==========================================================================
  // Returns Map<step_id, { projectedStart: Date, projectedDue: Date }>
  function calculateProjectedDates(book, steps) {
    const projections = new Map();
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
    let cursor = book.start_date ? new Date(book.start_date) : new Date();

    let i = 0;
    while (i < sorted.length) {
      const step = sorted[i];

      if (step.parallel_group) {
        // Collect all consecutive steps in the same parallel group
        const groupSteps = [];
        let j = i;
        while (j < sorted.length && sorted[j].parallel_group === step.parallel_group) {
          groupSteps.push(sorted[j]);
          j++;
        }
        const maxDur = Math.max(...groupSteps.map(s => s.default_duration_days || 5));

        groupSteps.forEach(s => {
          // For completed/in-progress steps, anchor to actual data
          if (s.status === 'approved' && s.completed_at) {
            // No projection needed (use actual)
            projections.set(s.id, { projectedStart: s.started_at ? new Date(s.started_at) : new Date(cursor), projectedDue: new Date(s.completed_at) });
          } else if (s.started_at) {
            projections.set(s.id, { projectedStart: new Date(s.started_at), projectedDue: s.due_date ? new Date(s.due_date) : new Date(new Date(s.started_at).getTime() + (s.default_duration_days || 5) * 86400000) });
          } else {
            const dur = s.default_duration_days || 5;
            projections.set(s.id, { projectedStart: new Date(cursor), projectedDue: new Date(cursor.getTime() + dur * 86400000) });
          }
        });
        // Move cursor by the latest end
        const groupEnds = groupSteps.map(s => projections.get(s.id).projectedDue.getTime());
        cursor = new Date(Math.max(...groupEnds));
        i = j;
      } else {
        const dur = step.default_duration_days || 5;
        if (step.status === 'approved' && step.completed_at) {
          projections.set(step.id, { projectedStart: step.started_at ? new Date(step.started_at) : new Date(cursor), projectedDue: new Date(step.completed_at) });
          cursor = new Date(step.completed_at);
        } else if (step.started_at) {
          const due = step.due_date ? new Date(step.due_date) : new Date(new Date(step.started_at).getTime() + dur * 86400000);
          projections.set(step.id, { projectedStart: new Date(step.started_at), projectedDue: due });
          cursor = due;
        } else {
          projections.set(step.id, { projectedStart: new Date(cursor), projectedDue: new Date(cursor.getTime() + dur * 86400000) });
          cursor = new Date(cursor.getTime() + dur * 86400000);
        }
        i++;
      }
    }

    return projections;
  }

  // ==========================================================================
  // CALCULATIONS
  // ==========================================================================
  function calculateCountdowns(book, steps) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day for date math
    const startDate = book.start_date ? new Date(book.start_date) : today;
    const totalDays = Math.floor((today - startDate) / 86400000);

    // Find current step (first non-approved/skipped, in step_order)
    const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
    const currentStep = sorted.find(s => !['approved', 'skipped'].includes(s.status));
    const daysInCurrentStage = currentStep?.started_at
      ? Math.floor((today - new Date(currentStep.started_at)) / 86400000)
      : null;

    // Expected completion: sum of remaining sequential durations + max of remaining parallel groups
    let remainingDays = 0;
    const parallelGroups = new Map();
    const remainingSteps = sorted.filter(s => !['approved', 'skipped'].includes(s.status));
    remainingSteps.forEach(s => {
      const dur = s.default_duration_days || 5;
      if (s.parallel_group) {
        if (!parallelGroups.has(s.parallel_group)) parallelGroups.set(s.parallel_group, []);
        parallelGroups.get(s.parallel_group).push(dur);
      } else {
        remainingDays += dur;
      }
    });
    for (const durs of parallelGroups.values()) remainingDays += Math.max(...durs);

    const expectedDate = new Date(today.getTime() + remainingDays * 86400000);
    const isComplete = remainingSteps.length === 0;

    // Total + completed for progress
    const totalSteps = sorted.length;
    const completedSteps = sorted.filter(s => ['approved', 'skipped'].includes(s.status)).length;
    const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Target date analysis
    let daysUntilTarget = null;
    let scheduleStatus = null;       // 'on_time' | 'ahead' | 'behind' | 'no_target' | 'past_target'
    let scheduleDelta = null;         // days difference (positive = ahead, negative = behind)

    if (book.target_launch_date) {
      const targetDate = new Date(book.target_launch_date);
      targetDate.setHours(0, 0, 0, 0);
      daysUntilTarget = Math.floor((targetDate - today) / 86400000);

      if (isComplete) {
        scheduleStatus = 'completed';
      } else if (daysUntilTarget < 0) {
        scheduleStatus = 'past_target';
        scheduleDelta = daysUntilTarget; // negative
      } else {
        scheduleDelta = daysUntilTarget - remainingDays;
        if (Math.abs(scheduleDelta) <= 3) scheduleStatus = 'on_time';
        else if (scheduleDelta > 0) scheduleStatus = 'ahead';
        else scheduleStatus = 'behind';
      }
    } else {
      scheduleStatus = 'no_target';
    }

    return {
      totalDays,
      daysInCurrentStage,
      expectedDate: isComplete ? null : expectedDate,
      remainingDays,
      currentStep,
      isComplete,
      progressPct,
      completedSteps,
      totalSteps,
      // Target/schedule
      targetDate: book.target_launch_date ? new Date(book.target_launch_date) : null,
      daysUntilTarget,
      scheduleStatus,
      scheduleDelta,
    };
  }

  function groupByPhase(steps) {
    const grouped = {};
    steps.forEach(s => {
      const phase = s.workflow_step?.phase || 'other';
      if (!grouped[phase]) grouped[phase] = [];
      grouped[phase].push(s);
    });
    // Sort each phase by step_order
    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.step_order - b.step_order));
    return grouped;
  }

  // ==========================================================================
  // RENDER PARTS
  // ==========================================================================
  function renderHeader(book, c) {
    const statusLabel = BOOK_STATUS_LABELS[book.status] || book.status;
    return `
      <header class="page-header" style="align-items:flex-start;">
        <div style="flex:1; min-width:0;">
          <div class="page-eyebrow">
            <a href="#/books" style="color:var(--gold-700); text-decoration:underline; text-underline-offset:3px;">← كل الكتب</a>
          </div>
          <h1 class="page-title">${escapeHtml(book.title)}</h1>
          ${book.subtitle ? `<p style="font-size:17px; color:var(--ink-500); margin:0 0 8px 0;">${escapeHtml(book.subtitle)}</p>` : ''}
          <p class="page-sub" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>${book.author ? `بواسطة <strong style="color:var(--navy-800)">${escapeHtml(book.author.name)}</strong>` : 'بدون مؤلف'}</span>
            <span style="color:var(--ink-300);">·</span>
            <span>${escapeHtml(LANGUAGE_LABELS[book.language] || book.language)}</span>
            <span style="color:var(--ink-300);">·</span>
            <span class="status-tag linked" style="font-size:10.5px;">${escapeHtml(statusLabel)}</span>
          </p>
          <div style="display:flex; gap:18px; margin-top:10px; flex-wrap:wrap; font-size:13px;">
            ${book.owner ? `
              <div style="display:flex; align-items:center; gap:6px;">
                ${avatarHTML(book.owner.name, 24)}
                <span style="color:var(--ink-500);">المسؤول:</span>
                <strong style="color:var(--navy-800);">${escapeHtml(book.owner.name)}</strong>
              </div>` : ''}
            ${book.start_date ? `<span style="color:var(--ink-500);">📅 البداية: <span class="latin">${escapeHtml(formatDate(book.start_date))}</span></span>` : ''}
            ${book.target_launch_date ? `<span style="color:var(--ink-500);">🎯 المستهدف: <span class="latin">${escapeHtml(formatDate(book.target_launch_date))}</span></span>` : ''}
          </div>
        </div>
        ${PTL.perms.canEdit() ? `
          <button class="btn btn-ghost" id="edit-book-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            تعديل بيانات الكتاب
          </button>
        ` : '<span class="status-tag" style="background:#dde7f0;color:#1e3a5f;">عرض فقط</span>'}
      </header>

      <div style="margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:13px;">
          <span style="color:var(--ink-500);">تقدم الكتاب: <strong style="color:var(--navy-800);">${c.completedSteps} من ${c.totalSteps} مرحلة</strong></span>
          <span style="font-weight:700; color:${c.isComplete ? 'var(--success)' : 'var(--gold-700)'};">${c.progressPct}%</span>
        </div>
        <div style="height: 8px; background: var(--cream-100); border-radius: 4px; overflow: hidden;">
          <div style="height:100%; width:${c.progressPct}%; background: linear-gradient(90deg, var(--gold-500), var(--gold-400)); transition: width 0.5s;"></div>
        </div>
      </div>
    `;
  }

  function renderCountdownCards(c) {
    const overdueColor = c.daysInCurrentStage > 7 ? 'danger' : (c.daysInCurrentStage > 3 ? 'warn' : '');
    const overdueClass = overdueColor === 'danger' ? 'danger' : '';

    return `
      <div class="stats-grid stagger" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <div class="stat-card">
          <div class="stat-label">إجمالي الأيام</div>
          <div class="stat-value sm">${c.totalDays}</div>
          <div class="stat-meta">يوم من بداية الكتاب</div>
        </div>
        <div class="stat-card ${overdueClass}">
          <div class="stat-label">في المرحلة الحالية</div>
          <div class="stat-value sm ${overdueClass}">${c.daysInCurrentStage ?? '—'}</div>
          <div class="stat-meta">${c.currentStep ? escapeHtml(c.currentStep.name_ar.slice(0, 28)) + (c.currentStep.name_ar.length > 28 ? '...' : '') : 'مفيش مرحلة جارية'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">متبقي للانتهاء</div>
          <div class="stat-value sm">${c.isComplete ? '✓' : c.remainingDays}</div>
          <div class="stat-meta">${c.isComplete ? 'الكتاب مكتمل' : `يوم متوقع · انتهاء ${escapeHtml(formatDate(c.expectedDate))}`}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">متبقي للميعاد</div>
          <div class="stat-value sm">${c.daysUntilTarget !== null ? (c.daysUntilTarget < 0 ? 'فات' : c.daysUntilTarget) : '—'}</div>
          <div class="stat-meta">${c.targetDate ? `الميعاد: ${escapeHtml(formatDate(c.targetDate))}` : 'لم يتم تحديد ميعاد'}</div>
        </div>
      </div>

      ${renderScheduleBanner(c)}
    `;
  }

  function renderScheduleBanner(c) {
    if (!c.scheduleStatus || c.scheduleStatus === 'no_target') {
      return `
        <div class="schedule-banner schedule-neutral">
          <div class="schedule-icon">📅</div>
          <div class="schedule-content">
            <div class="schedule-title">لم يتم تحديد ميعاد للكتاب</div>
            <div class="schedule-sub">حدد تاريخ نهاية مستهدف من "تعديل بيانات الكتاب" عشان تقدر تتابع لو احنا في الجدول الزمني</div>
          </div>
        </div>
      `;
    }

    if (c.scheduleStatus === 'completed') {
      return `
        <div class="schedule-banner schedule-on-time">
          <div class="schedule-icon">✓</div>
          <div class="schedule-content">
            <div class="schedule-title">الكتاب مكتمل</div>
            <div class="schedule-sub">كل المراحل خلصت — تمام التمام</div>
          </div>
        </div>
      `;
    }

    if (c.scheduleStatus === 'past_target') {
      return `
        <div class="schedule-banner schedule-behind">
          <div class="schedule-icon">⚠</div>
          <div class="schedule-content">
            <div class="schedule-title">فات الميعاد بـ ${Math.abs(c.scheduleDelta)} يوم</div>
            <div class="schedule-sub">الميعاد المستهدف عدّى وفي ${c.remainingDays} يوم شغل لسه باقي. ممكن تعدّل الميعاد، أو تقلّل المدد لكل مرحلة.</div>
          </div>
        </div>
      `;
    }

    if (c.scheduleStatus === 'on_time') {
      return `
        <div class="schedule-banner schedule-on-time">
          <div class="schedule-icon">✓</div>
          <div class="schedule-content">
            <div class="schedule-title">في الميعاد بالظبط</div>
            <div class="schedule-sub">الباقي ${c.remainingDays} يوم شغل · فاضل ${c.daysUntilTarget} يوم على الميعاد · الجدول متوازن</div>
          </div>
        </div>
      `;
    }

    if (c.scheduleStatus === 'ahead') {
      return `
        <div class="schedule-banner schedule-ahead">
          <div class="schedule-icon">⚡</div>
          <div class="schedule-content">
            <div class="schedule-title">متقدم على الجدول بـ ${c.scheduleDelta} يوم</div>
            <div class="schedule-sub">الشغل الباقي ${c.remainingDays} يوم بس المستهدف بعد ${c.daysUntilTarget} يوم · فيه فسحة كويسة</div>
          </div>
        </div>
      `;
    }

    if (c.scheduleStatus === 'behind') {
      const lateDays = Math.abs(c.scheduleDelta);
      return `
        <div class="schedule-banner schedule-behind">
          <div class="schedule-icon">⚠</div>
          <div class="schedule-content">
            <div class="schedule-title">متأخر على الجدول بـ ${lateDays} يوم</div>
            <div class="schedule-sub">الشغل الباقي ${c.remainingDays} يوم لكن المستهدف بعد ${c.daysUntilTarget} يوم بس · لازم تختصر المدد أو تعدّل الميعاد</div>
          </div>
        </div>
      `;
    }

    return '';
  }

  function renderAssignments(usedRoles, people, assignMap, bookId) {
    return `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">تعيينات الفريق <span class="panel-title-meta">· مين شغّال على إيه</span></h3>
        </div>
        <div class="panel-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
            ${usedRoles.map(role => {
              const assignedId = assignMap[role.id];
              // Show ALL active people in dropdown (not just role-filtered)
              // But mark people who naturally have this role
              const peopleWithRole = new Set(
                people.filter(p => (p.person_roles || []).some(pr => pr.role_id === role.id)).map(p => p.id)
              );
              return `
                <div style="padding:14px 16px; background:var(--cream-50); border:1px solid var(--line); border-radius:3px; border-right:3px solid ${escapeHtml(role.color)};">
                  <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-500); margin-bottom:8px;">
                    ${escapeHtml(role.name_ar || role.name)}
                  </div>
                  <select class="assign-select" data-role-id="${role.id}" data-book-id="${bookId}" ${PTL.perms.canEdit() ? '' : 'disabled'} style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:3px; font-size:13.5px; background:white; ${PTL.perms.canEdit() ? '' : 'opacity:0.7; cursor:not-allowed;'}">
                    <option value="">— لم يتم التعيين —</option>
                    ${people.map(p => {
                      const hasRole = peopleWithRole.has(p.id);
                      return `<option value="${p.id}" ${p.id === assignedId ? 'selected' : ''}>${escapeHtml(p.name)}${hasRole ? '' : ' (دور آخر)'}</option>`;
                    }).join('')}
                  </select>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderTimeline(stepsByPhase, people, assignMap, allSteps, projectedDates) {
    const phaseOrder = ['sales', 'discovery', 'writing', 'parallel_production', 'production', 'other'];
    return `
      <section class="panel fade-in">
        <div class="panel-header">
          <h3 class="panel-title">المراحل <span class="panel-title-meta">· تايم لاين الكتاب</span></h3>
          ${PTL.perms.canEdit() ? `
            <button class="btn btn-ghost btn-sm" id="edit-steps-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              تعديل المراحل
            </button>
          ` : ''}
        </div>
        <div class="panel-body" style="padding: 16px 20px;">
          ${phaseOrder.map(phase => {
            const phaseSteps = stepsByPhase[phase];
            if (!phaseSteps?.length) return '';
            return renderPhase(phase, phaseSteps, people, allSteps, projectedDates);
          }).join('')}
        </div>
      </section>
    `;
  }

  function renderPhase(phase, steps, people, allSteps, projectedDates) {
    const info = PHASES[phase] || PHASES.other;
    const groups = [];
    let currentGroup = null;
    steps.forEach(s => {
      if (s.parallel_group) {
        if (currentGroup?.parallel === s.parallel_group) {
          currentGroup.steps.push(s);
        } else {
          currentGroup = { parallel: s.parallel_group, steps: [s] };
          groups.push(currentGroup);
        }
      } else {
        currentGroup = null;
        groups.push({ parallel: null, steps: [s] });
      }
    });

    return `
      <div style="margin-bottom: 28px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--line);">
          <span style="font-size:18px;">${info.icon}</span>
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--navy-800);">${info.label}</div>
            <div class="latin" style="font-size:11px; color:var(--ink-500); letter-spacing:0.1em; text-transform:uppercase;">${info.short}</div>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${groups.map(g => g.parallel ? renderParallelGroup(g.steps, people, allSteps, projectedDates) : renderStepCard(g.steps[0], people, allSteps, projectedDates)).join('')}
        </div>
      </div>
    `;
  }

  function renderParallelGroup(steps, people, allSteps, projectedDates) {
    return `
      <div style="border:1px dashed var(--line-dark); border-radius:4px; padding:10px; background:rgba(201,169,97,0.04);">
        <div style="font-size:11px; font-weight:700; color:var(--gold-700); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v18M16 3v18"/></svg>
          بالتوازي
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:8px;">
          ${steps.map(s => renderStepCard(s, people, allSteps, projectedDates)).join('')}
        </div>
      </div>
    `;
  }

  function renderStepCard(step, people, allSteps, projectedDates) {
    const status = STEP_STATUS[step.status] || STEP_STATUS.pending;
    const assignee = people.find(p => p.id === step.assignee_id);
    const isOverdue = step.due_date && step.due_date < todayISO() && !['approved', 'skipped'].includes(step.status);
    const isOptional = step.workflow_step?.is_optional;
    const projection = projectedDates?.get(step.id);

    // Determine which date to show
    let dateDisplay = '';
    if (step.status === 'approved' && step.completed_at) {
      dateDisplay = `<span class="latin" style="color:var(--success);">✓ ${escapeHtml(formatDate(step.completed_at))}</span>`;
    } else if (step.due_date) {
      dateDisplay = `<span class="latin" style="color:${isOverdue ? 'var(--danger)' : 'var(--ink-500)'}; font-weight:${isOverdue ? '700' : '400'};">${isOverdue ? '⚠ ' : '📅 '}${escapeHtml(formatDate(step.due_date))}</span>`;
    } else if (projection && step.status === 'pending') {
      dateDisplay = `<span class="latin" style="color:var(--ink-400); font-style:italic;" title="تاريخ متوقع">~ ${escapeHtml(formatDate(projection.projectedDue))}</span>`;
    }

    return `
      <div class="step-card" style="background:white; border:1px solid var(--line); border-right:4px solid ${status.color}; border-radius:3px; padding:14px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <span style="font-size:11px; color:var(--ink-400); font-weight:700;">${step.step_order}</span>
              <span style="font-size:14px; font-weight:700; color:var(--navy-800);">${escapeHtml(step.name_ar)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="status-tag" style="background:${status.bg}; color:${status.color};">${status.label}</span>
              ${step.has_revision_loop ? `<span style="font-size:10.5px; color:var(--gold-700);">🔁 يقبل تعديلات</span>` : ''}
              ${isOptional ? `<span style="font-size:10.5px; color:var(--ink-400);">اختياري</span>` : ''}
              ${step.revision_count > 0 ? `<span style="font-size:10.5px; color:var(--warning);">${step.revision_count} تعديل</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; font-size:12.5px;">
          <div style="display:flex; align-items:center; gap:6px; color:var(--ink-500);">
            ${assignee
              ? `${avatarHTML(assignee.name, 22)}<span style="color:var(--ink-700);font-weight:600;">${escapeHtml(assignee.name)}</span>`
              : '<span style="color:var(--ink-400);">— لم يتم التعيين —</span>'}
          </div>
          ${dateDisplay}
        </div>

        ${renderStepActions(step)}
      </div>
    `;
  }

  function renderStepActions(step) {
    // Managers can't perform any step actions
    if (!PTL.perms.canEdit()) {
      if (step.feedback) {
        return `
          <div style="background:#fdf2f2; border-right:3px solid var(--danger); padding:8px 12px; border-radius:3px; margin-bottom:10px; font-size:12.5px; color:var(--ink-700);">
            <strong style="color:var(--danger);">آخر فيدباك:</strong> ${escapeHtml(step.feedback)}
          </div>
        `;
      }
      return '';
    }

    const actions = [];
    switch (step.status) {
      case 'pending':
        actions.push(`<button class="btn btn-primary btn-sm step-action" data-action="start" data-step-id="${step.id}">ابدأ المرحلة</button>`);
        break;
      case 'in_progress':
        if (step.has_revision_loop) {
          actions.push(`<button class="btn btn-gold btn-sm step-action" data-action="submit" data-step-id="${step.id}">أرسل للمراجعة</button>`);
        } else {
          actions.push(`<button class="btn btn-primary btn-sm step-action" data-action="approve" data-step-id="${step.id}">اعتمد المرحلة</button>`);
        }
        break;
      case 'awaiting_approval':
        actions.push(`<button class="btn btn-primary btn-sm step-action" data-action="approve" data-step-id="${step.id}">اعتمد</button>`);
        if (step.has_revision_loop) {
          actions.push(`<button class="btn btn-ghost btn-sm step-action" data-action="revision" data-step-id="${step.id}">↻ ارجع للتعديل</button>`);
        }
        break;
      case 'needs_revision':
        actions.push(`<button class="btn btn-primary btn-sm step-action" data-action="start" data-step-id="${step.id}">ابدأ التعديل</button>`);
        break;
      case 'approved':
        actions.push(`<button class="btn btn-ghost btn-sm step-action" data-action="reopen" data-step-id="${step.id}">↻ افتح من جديد</button>`);
        break;
      case 'skipped':
        actions.push(`<button class="btn btn-ghost btn-sm step-action" data-action="unskip" data-step-id="${step.id}">↻ ارجع</button>`);
        break;
    }
    if (!['approved', 'skipped'].includes(step.status)) {
      actions.push(`<button class="btn-icon step-action" data-action="skip" data-step-id="${step.id}" title="تخطي"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg></button>`);
    }

    if (step.feedback) {
      return `
        <div style="background:#fdf2f2; border-right:3px solid var(--danger); padding:8px 12px; border-radius:3px; margin-bottom:10px; font-size:12.5px; color:var(--ink-700);">
          <strong style="color:var(--danger);">آخر فيدباك:</strong> ${escapeHtml(step.feedback)}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">${actions.join('')}</div>
      `;
    }
    return `<div style="display:flex; gap:6px; flex-wrap:wrap;">${actions.join('')}</div>`;
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  function wireUpHandlers(book, steps, people, assignMap) {
    // Edit book button — open the modal from the books page module
    $('edit-book-btn').onclick = async () => {
      const [authorsRes, peopleRes] = await Promise.all([
        sb.from('authors').select('id, name').order('name'),
        sb.from('people').select('id, name, person_roles(role_id)').eq('active', true).order('name'),
      ]);
      if (PTL.pages.books?.openBookModal) {
        PTL.pages.books.openBookModal(book, authorsRes.data || [], peopleRes.data || []);
      } else {
        toast('صفحة الكتب لم تُحمّل بعد. اضغط على "كل الكتب" أولاً.', 'error');
      }
    };

    // Assignment dropdowns
    document.querySelectorAll('.assign-select').forEach(sel => {
      sel.onchange = async (e) => {
        const roleId = sel.dataset.roleId;
        const bookId = sel.dataset.bookId;
        const personId = sel.value || null;

        try {
          // Upsert: delete existing for this (book, role) and insert new
          await sb.from('book_assignments').delete().match({ book_id: bookId, role_id: roleId });
          if (personId) {
            const { error } = await sb.from('book_assignments').insert({
              book_id: bookId, role_id: roleId, person_id: personId,
            });
            if (error) throw error;
          }
          toast('تم حفظ التعيين');
        } catch (err) {
          toast('مشكلة في الحفظ: ' + err.message, 'error');
        }
      };
    });

    // Step action buttons
    document.querySelectorAll('.step-action').forEach(btn => {
      btn.onclick = () => handleStepAction(btn.dataset.action, btn.dataset.stepId, book, steps, assignMap);
    });

    // Edit steps button (opens the step editor modal)
    const editStepsBtn = $('edit-steps-btn');
    if (editStepsBtn) {
      editStepsBtn.onclick = () => {
        if (PTL.components?.stepEditor) {
          PTL.components.stepEditor.open(book.id, steps, people, () => {
            renderBookDetail({ id: book.id });
          });
        }
      };
    }
  }

  // ==========================================================================
  // STEP ACTIONS
  // ==========================================================================
  async function handleStepAction(action, stepId, book, allSteps, assignMap) {
    const step = allSteps.find(s => s.id === stepId);
    if (!step) return;

    try {
      switch (action) {
        case 'start':
          await startStep(step, allSteps, assignMap);
          await logActivity(book.id, step.id, 'step_started', `بدأت مرحلة: ${step.name_ar}`);
          toast('تم بدء المرحلة');
          break;
        case 'submit':
          await updateStep(step.id, { status: 'awaiting_approval' });
          await logActivity(book.id, step.id, 'step_submitted', `إرسال للمراجعة: ${step.name_ar}`);
          toast('تم الإرسال للمراجعة');
          break;
        case 'approve':
          await updateStep(step.id, { status: 'approved', completed_at: new Date().toISOString(), feedback: null });
          await logActivity(book.id, step.id, 'step_approved', `اعتماد: ${step.name_ar}`);
          await autoAdvance(step, allSteps, assignMap);
          toast('تم الاعتماد ✓');
          break;
        case 'revision':
          await openRevisionModal(step, book.id);
          break;
        case 'skip':
          await openSkipConfirm(step, book.id, allSteps, assignMap);
          break;
        case 'unskip':
          await updateStep(step.id, { status: 'pending' });
          await logActivity(book.id, step.id, 'step_unskipped', `إلغاء تخطي: ${step.name_ar}`);
          toast('تم إعادة المرحلة');
          break;
        case 'reopen':
          await updateStep(step.id, { status: 'in_progress', completed_at: null });
          await logActivity(book.id, step.id, 'step_reopened', `إعادة فتح: ${step.name_ar}`);
          toast('تم إعادة فتح المرحلة');
          break;
      }
      // Reload page
      await renderBookDetail({ id: book.id });
    } catch (err) {
      console.error('Step action failed:', { action, stepId, error: err });
      toast('مشكلة: ' + (err.message || err), 'error');
    }
  }

  async function startStep(step, allSteps, assignMap) {
    const today = new Date();
    const dur = step.default_duration_days || 5;
    const due = new Date(today.getTime() + dur * 86400000);
    // Fall back to any existing assignee, then to the default role's assignee
    let assigneeId = step.assignee_id || lookupDefaultAssignee(step, allSteps, assignMap);

    const updates = {
      status: 'in_progress',
      started_at: today.toISOString(),
      due_date: due.toISOString().slice(0, 10),
    };
    // Only set assignee_id if we actually have one — don't overwrite with null
    if (assigneeId) updates.assignee_id = assigneeId;

    await updateStep(step.id, updates);
  }

  function lookupDefaultAssignee(step, allSteps, assignMap) {
    // Try the embedded workflow_step first
    let wsRoleId = step.workflow_step?.default_role_id;
    // Fallback: maybe the workflow_step join didn't load — skip silently
    if (!wsRoleId) return null;
    return assignMap[wsRoleId] || null;
  }

  async function autoAdvance(approvedStep, allSteps, assignMap) {
    // If step is in a parallel group, only advance if all siblings are done
    if (approvedStep.parallel_group) {
      const siblings = allSteps.filter(s =>
        s.parallel_group === approvedStep.parallel_group && s.id !== approvedStep.id
      );
      // Re-check each sibling's CURRENT status from DB (since we just approved this one)
      const allDone = siblings.every(s => ['approved', 'skipped'].includes(s.status));
      if (!allDone) return;
    }

    // Find next pending step (lowest step_order)
    const sorted = [...allSteps].sort((a, b) => a.step_order - b.step_order);
    const nextStep = sorted.find(s => s.status === 'pending' && s.id !== approvedStep.id);
    if (!nextStep) return;

    // If next step is parallel, start ALL siblings in same parallel_group
    if (nextStep.parallel_group) {
      const groupSteps = sorted.filter(s =>
        s.parallel_group === nextStep.parallel_group && s.status === 'pending'
      );
      for (const gs of groupSteps) {
        await startStep(gs, allSteps, assignMap);
      }
    } else {
      await startStep(nextStep, allSteps, assignMap);
    }
  }

  async function openRevisionModal(step, bookId) {
    const body = `
      <div class="form-group">
        <label>إيه الفيدباك من المؤلف؟ <span class="req">*</span></label>
        <textarea id="m-feedback" placeholder="اكتب التعديلات المطلوبة..." style="min-height: 120px;"></textarea>
        <div class="form-help">الفيدباك ده هيظهر للمسؤول عن المرحلة عشان يعرف يعدل إيه</div>
      </div>
    `;
    return new Promise(resolve => {
      const { modal } = openModal({
        title: 'إرجاع للتعديل',
        body,
        saveLabel: 'إرسال',
        onSave: async () => {
          const feedback = modal.querySelector('#m-feedback').value.trim();
          if (!feedback) { toast('لازم تكتب الفيدباك', 'error'); return false; }

          const newCount = (step.revision_count || 0) + 1;
          await updateStep(step.id, {
            status: 'needs_revision',
            feedback,
            revision_count: newCount,
          });
          await logActivity(bookId, step.id, 'step_revision', `إرجاع للتعديل (${newCount}): ${step.name_ar}`);
          toast('تم الإرجاع للتعديل');
          resolve(true);
          return true;
        },
      });
    });
  }

  async function openSkipConfirm(step, bookId, allSteps, assignMap) {
    const isOptional = step.workflow_step?.is_optional;
    const message = isOptional
      ? `هذه المرحلة اختيارية. هل تريد تخطيها؟`
      : `⚠ هذه المرحلة ليست اختيارية. هل أنت متأكد من تخطيها؟ مينفعش يكون ده بدلاً من إنجازها.`;

    const confirmed = await confirmDialog({
      title: 'تخطي المرحلة',
      message,
      confirmLabel: 'نعم، تخطّى',
      destructive: !isOptional,
    });
    if (!confirmed) return;

    await updateStep(step.id, { status: 'skipped', completed_at: new Date().toISOString() });
    await logActivity(bookId, step.id, 'step_skipped', `تخطي: ${step.name_ar}`);
    await autoAdvance(step, allSteps, assignMap);
    toast('تم التخطي');
  }

  // ==========================================================================
  // DATA HELPERS
  // ==========================================================================
  async function updateStep(stepId, updates) {
    const { error } = await sb.from('book_steps')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', stepId);
    if (error) throw error;
  }

  async function logActivity(bookId, stepId, action, description) {
    await sb.from('activity_log').insert({
      book_id: bookId,
      book_step_id: stepId,
      action,
      actor_id: state.person.id,
      description,
    }).then(({ error }) => {
      if (error) console.warn('Activity log failed:', error);
    });
  }

  PTL.routes['/book/:id'] = renderBookDetail;
})();
