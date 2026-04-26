// ==========================================================================
// PTL — Page: Tasks (Cross-Books)
// ==========================================================================
// Aggregates ALL pending work across the system:
//   - Active workflow steps (book_steps that are in_progress / awaiting_approval / needs_revision)
//   - Custom book_tasks (status != done)
// Filters: by assignee, by status, by overdue, "my tasks only"
// Includes a "Send WhatsApp reminders" panel that generates wa.me links
//   for each person who has overdue work.
// ==========================================================================

(function() {
  'use strict';

  const { sb, state, utils } = PTL;
  const { $, escapeHtml, toast, formatDate, todayISO, avatarHTML } = utils;

  const STEP_STATUS = {
    pending:           { label: 'لم تبدأ',          color: '#888888', bg: '#f4ede0' },
    in_progress:       { label: 'جاري العمل',       color: '#1e3a5f', bg: '#dde7f0' },
    awaiting_approval: { label: 'بانتظار الموافقة', color: '#b8860b', bg: '#fdf9f0' },
    needs_revision:    { label: 'يحتاج تعديل',      color: '#a83232', bg: '#fdf2f2' },
  };

  const TASK_STATUS = {
    pending:     { label: 'في الانتظار', color: '#888888', bg: '#f4ede0' },
    in_progress: { label: 'جاري العمل',  color: '#1e3a5f', bg: '#dde7f0' },
  };

  let currentFilters = {
    scope: 'all',     // 'all' | 'mine'
    overdue: false,
    person: null,
  };

  async function renderTasksPage() {
    const today = todayISO();

    const [stepsRes, tasksRes, peopleRes] = await Promise.all([
      // All non-completed workflow steps from active books that have an assignee
      sb.from('book_steps')
        .select(`
          id, book_id, name_ar, status, due_date, started_at, step_order, default_duration_days,
          book:books!inner(id, title, status, owner:people!owner_id(name)),
          assignee:people(id, name, phone)
        `)
        .not('status', 'in', '(approved,skipped)')
        .not('assignee_id', 'is', null)
        .eq('book.status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false }),
      // All custom tasks not done. Note: filtering on a joined column
      // (book.status) doesn't always work reliably in Supabase, so we filter
      // in JS after the data loads.
      sb.from('book_tasks')
        .select(`
          id, book_id, title, status, priority, due_date, description,
          book:books(id, title, status),
          assignee:people(id, name, phone)
        `)
        .neq('status', 'done')
        .order('due_date', { ascending: true, nullsFirst: false }),
      sb.from('people').select('id, name, phone').eq('active', true).order('name'),
    ]);

    const steps = (stepsRes.data || []).map(s => ({ ...s, _kind: 'step' }));
    // Filter out tasks whose book is not active (handle in JS, not in query)
    const tasks = (tasksRes.data || [])
      .filter(t => t.book?.status === 'active')
      .map(t => ({ ...t, _kind: 'task' }));
    const people = peopleRes.data || [];

    // ============ DEBUG START ============
    console.log('========== PTL TASKS DEBUG v8.0 ==========');
    console.log('Steps Response Error:', stepsRes.error);
    console.log('Tasks Response Error:', tasksRes.error);
    console.log('Raw tasks from DB (before filter):', tasksRes.data);
    console.log('Raw tasks count:', (tasksRes.data || []).length);
    console.log('Tasks after active filter:', tasks);
    console.log('Tasks count after filter:', tasks.length);
    if (tasks.length > 0) {
      tasks.forEach(t => {
        console.log(`Task: "${t.title}" | assignee: ${t.assignee?.name || 'NONE'} | book: ${t.book?.title || 'NONE'} (${t.book?.status})`);
      });
    } else if ((tasksRes.data || []).length > 0) {
      console.log('Tasks were loaded but filtered out. Raw books:');
      (tasksRes.data || []).forEach(t => {
        console.log(`  Task "${t.title}": book =`, t.book);
      });
    }
    console.log('==========================================');
    // ============ DEBUG END ============

    const all = [...steps, ...tasks];
    const filtered = applyFilters(all, today, state.person.id);

    // Build per-person work summary (ALL active work, not just overdue)
    const workByPerson = buildWorkByPerson(all, people, today);

    $('app-content').innerHTML = `
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Tasks</div>
          <h1 class="page-title">المهام</h1>
          <p class="page-sub">كل الشغل الجاري عبر كل الكتب · ${all.length} مهمة (${filtered.length} ظاهرة)</p>
        </div>
      </header>

      ${renderDailyUpdatesPanel(workByPerson)}

      ${renderFiltersBar(people, all)}

      ${renderTasksList(filtered, today)}
    `;

    wireUp(all, today, people, workByPerson);
  }

  // ==========================================================================
  // FILTERS
  // ==========================================================================
  function applyFilters(items, today, myId) {
    return items.filter(item => {
      if (currentFilters.scope === 'mine' && item.assignee?.id !== myId) return false;
      if (currentFilters.person && item.assignee?.id !== currentFilters.person) return false;
      if (currentFilters.overdue) {
        if (!item.due_date || item.due_date >= today) return false;
      }
      return true;
    });
  }

  // ----- Build per-person work summary (ALL active work, not just overdue) -----
  function buildWorkByPerson(items, people, today) {
    const map = new Map();
    items.forEach(item => {
      if (!item.assignee?.id) return;
      const key = item.assignee.id;
      if (!map.has(key)) {
        map.set(key, {
          person: item.assignee,
          items: [],
          buckets: { overdue: [], today: [], soon: [], upcoming: [], no_date: [], awaiting: [], revision: [] },
        });
      }
      const entry = map.get(key);
      entry.items.push(item);

      // Categorize
      if (item._kind === 'step' && item.status === 'awaiting_approval') {
        entry.buckets.awaiting.push(item);
      } else if (item._kind === 'step' && item.status === 'needs_revision') {
        entry.buckets.revision.push(item);
      } else if (!item.due_date) {
        entry.buckets.no_date.push(item);
      } else {
        const daysToDeadline = daysBetween(today, item.due_date);
        if (daysToDeadline < 0) entry.buckets.overdue.push({ ...item, daysLate: -daysToDeadline });
        else if (daysToDeadline === 0) entry.buckets.today.push(item);
        else if (daysToDeadline <= 3) entry.buckets.soon.push({ ...item, daysLeft: daysToDeadline });
        else entry.buckets.upcoming.push({ ...item, daysLeft: daysToDeadline });
      }
    });

    // Sort: people with overdue first, then today, then by total work
    return [...map.values()].sort((a, b) => {
      if (a.buckets.overdue.length !== b.buckets.overdue.length)
        return b.buckets.overdue.length - a.buckets.overdue.length;
      if (a.buckets.today.length !== b.buckets.today.length)
        return b.buckets.today.length - a.buckets.today.length;
      return b.items.length - a.items.length;
    });
  }

  function daysBetween(todayISOStr, dateISOStr) {
    const a = new Date(todayISOStr); a.setHours(0,0,0,0);
    const b = new Date(dateISOStr); b.setHours(0,0,0,0);
    return Math.round((b - a) / 86400000);
  }

  // Determine the "urgency level" of a person's work — drives card color
  function urgencyLevel(buckets) {
    if (buckets.overdue.length > 0) return 'overdue';
    if (buckets.today.length > 0 || buckets.revision.length > 0) return 'today';
    if (buckets.awaiting.length > 0) return 'awaiting';
    if (buckets.soon.length > 0) return 'soon';
    return 'normal';
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  function renderDailyUpdatesPanel(workByPerson) {
    if (workByPerson.length === 0) {
      return `
        <div class="schedule-banner schedule-on-time" style="margin-bottom: 28px;">
          <div class="schedule-icon">✓</div>
          <div class="schedule-content">
            <div class="schedule-title">مفيش شغل نشط حالياً</div>
            <div class="schedule-sub">كل المراحل لم تبدأ، أو لم يتم تعيين أحد لها</div>
          </div>
        </div>
      `;
    }

    return `
      <section class="panel fade-in" style="margin-bottom: 28px;">
        <div class="panel-header">
          <h3 class="panel-title">التواصل اليومي <span class="panel-title-meta">· ${workByPerson.length} عضو فريق عنده شغل نشط</span></h3>
          <span style="font-size:12px; color:var(--ink-500);">دوس "ابعت رسالة" يفتح واتساب برسالة جاهزة حسب حالة كل مهمة</span>
        </div>
        <div class="panel-body">
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px;">
            ${workByPerson.map(entry => renderPersonCard(entry)).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderPersonCard({ person, items, buckets }) {
    const urgency = urgencyLevel(buckets);
    const styles = {
      overdue:  { bg: '#fdf2f2', border: '#f5c2c2', accent: 'var(--danger)',   icon: '⚠' },
      today:    { bg: '#fdf9f0', border: '#e8d3a3', accent: 'var(--warning)',  icon: '🔴' },
      awaiting: { bg: '#fdf9f0', border: '#e8d3a3', accent: 'var(--warning)',  icon: '⏳' },
      soon:     { bg: 'var(--cream-50)', border: 'var(--cream-200)', accent: 'var(--gold-700)', icon: '🟡' },
      normal:   { bg: '#f0f9f3', border: '#b8d8c2', accent: 'var(--success)',  icon: '✓' },
    };
    const s = styles[urgency];

    // Build summary chips
    const chips = [];
    if (buckets.overdue.length) chips.push({ label: `${buckets.overdue.length} متأخرة`, color: 'var(--danger)', bg: '#fdf2f2' });
    if (buckets.today.length) chips.push({ label: `${buckets.today.length} اليوم`, color: 'var(--warning)', bg: '#fdf9f0' });
    if (buckets.revision.length) chips.push({ label: `${buckets.revision.length} تعديل`, color: 'var(--danger)', bg: '#fdf2f2' });
    if (buckets.awaiting.length) chips.push({ label: `${buckets.awaiting.length} انتظار`, color: 'var(--warning)', bg: '#fdf9f0' });
    if (buckets.soon.length) chips.push({ label: `${buckets.soon.length} قريبة`, color: 'var(--gold-700)', bg: 'var(--cream-100)' });
    if (buckets.upcoming.length) chips.push({ label: `${buckets.upcoming.length} لاحقاً`, color: 'var(--ink-500)', bg: '#eee' });
    if (buckets.no_date.length) chips.push({ label: `${buckets.no_date.length} بلا تاريخ`, color: 'var(--ink-500)', bg: '#eee' });

    return `
      <div style="padding:16px; background:${s.bg}; border:1px solid ${s.border}; border-right:4px solid ${s.accent}; border-radius:3px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          ${avatarHTML(person.name, 38)}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; color:var(--navy-800); font-size:15px;">${escapeHtml(person.name)}</div>
            <div style="font-size:12px; color:var(--ink-500); margin-top:2px;">${items.length} مهمة نشطة</div>
          </div>
          <div style="font-size:22px;">${s.icon}</div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
          ${chips.map(c => `<span style="font-size:10.5px; padding:3px 8px; border-radius:10px; background:${c.bg}; color:${c.color}; font-weight:700;">${c.label}</span>`).join('')}
        </div>

        <button class="btn btn-gold btn-sm preview-msg-btn" data-person-id="${person.id}" style="width:100%; justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          معاينة الرسالة
        </button>
      </div>
    `;
  }

  // Smart message: tone changes based on what work the person has
  function buildSmartMessage(name, buckets) {
    const lines = [];
    const today = new Date().toLocaleDateString('ar-EG', { weekday: 'long' });

    // Greeting depends on urgency
    if (buckets.overdue.length > 0) {
      lines.push(`أهلاً ${name} 👋`);
      lines.push(``);
      lines.push(`عندك ${buckets.overdue.length} مهمة متأخرة محتاجة متابعة:`);
    } else if (buckets.today.length > 0 || buckets.revision.length > 0) {
      lines.push(`صباح الخير ${name} ☀️`);
      lines.push(``);
      lines.push(`في شغل مهم النهاردة:`);
    } else if (buckets.awaiting.length > 0) {
      lines.push(`أهلاً ${name} 👋`);
      lines.push(``);
      lines.push(`في حاجات بانتظار رأيك:`);
    } else {
      lines.push(`صباح الخير ${name} ☀️`);
      lines.push(``);
      lines.push(`update يومي للشغل:`);
    }
    lines.push(``);

    // Overdue first
    if (buckets.overdue.length > 0) {
      lines.push(`⚠️ متأخرات:`);
      buckets.overdue.slice(0, 4).forEach(it => {
        lines.push(formatItemLine(it, `متأخرة بـ ${it.daysLate} يوم`));
      });
      if (buckets.overdue.length > 4) lines.push(`  + ${buckets.overdue.length - 4} متأخرة أخرى`);
      lines.push(``);
    }

    // Due today
    if (buckets.today.length > 0) {
      lines.push(`🔴 اليوم آخر يوم:`);
      buckets.today.slice(0, 3).forEach(it => {
        lines.push(formatItemLine(it, `النهاردة`));
      });
      lines.push(``);
    }

    // Needs revision
    if (buckets.revision.length > 0) {
      lines.push(`↻ تحتاج تعديل:`);
      buckets.revision.slice(0, 3).forEach(it => {
        lines.push(formatItemLine(it, `محتاجة تعديلات`));
      });
      lines.push(``);
    }

    // Awaiting approval
    if (buckets.awaiting.length > 0) {
      lines.push(`⏳ بانتظار الاعتماد:`);
      buckets.awaiting.slice(0, 3).forEach(it => {
        lines.push(formatItemLine(it, `محتاجة موافقة المؤلف`));
      });
      lines.push(``);
    }

    // Soon
    if (buckets.soon.length > 0) {
      lines.push(`🟡 قريبة:`);
      buckets.soon.slice(0, 3).forEach(it => {
        lines.push(formatItemLine(it, `متبقي ${it.daysLeft} ${it.daysLeft === 1 ? 'يوم' : 'أيام'}`));
      });
      lines.push(``);
    }

    // Upcoming (further out) — show with details, not just count.
    // Even if a deadline is 20 days away, if it's the next thing they
    // should be working on, they should see what it is.
    if (buckets.upcoming.length > 0) {
      lines.push(`📅 جاي بعد كده:`);
      buckets.upcoming.slice(0, 5).forEach(it => {
        lines.push(formatItemLine(it, `بعد ${it.daysLeft} ${it.daysLeft === 1 ? 'يوم' : 'أيام'}`));
      });
      if (buckets.upcoming.length > 5) lines.push(`  + ${buckets.upcoming.length - 5} مهمة أخرى`);
      lines.push(``);
    }

    // No deadline — show all with details (steps and tasks both)
    if (buckets.no_date.length > 0) {
      lines.push(`📋 بدون deadline:`);
      buckets.no_date.slice(0, 5).forEach(it => {
        lines.push(formatItemLine(it, `مفتوحة`));
      });
      if (buckets.no_date.length > 5) lines.push(`  + ${buckets.no_date.length - 5} مهمة أخرى`);
      lines.push(``);
    }

    // Closing
    if (buckets.overdue.length > 0) {
      lines.push(`محتاج update عاجل على المتأخرات 🙏`);
    } else if (buckets.awaiting.length > 0) {
      lines.push(`لو خلصت المعاينة قولي 🙏`);
    } else {
      lines.push(`محتاج update سريع لو في تحديث 🙏`);
    }

    return lines.join('\n');
  }

  function formatItemLine(item, statusText) {
    const title = item.name_ar || item.title;
    const bookTitle = item.book?.title;
    let line = `  • ${title}`;
    if (bookTitle) line += ` (${bookTitle})`;
    line += ` — ${statusText}`;
    return line;
  }

  function renderFiltersBar(people, all) {
    const overdueCount = all.filter(it => it.due_date && it.due_date < todayISO()).length;
    const myCount = all.filter(it => it.assignee?.id === state.person.id).length;

    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px; align-items:center;">
        <button class="filter-pill ${currentFilters.scope === 'all' ? 'active' : ''}" data-filter="scope" data-value="all">
          كل المهام (${all.length})
        </button>
        <button class="filter-pill ${currentFilters.scope === 'mine' ? 'active' : ''}" data-filter="scope" data-value="mine">
          مهامي (${myCount})
        </button>
        <button class="filter-pill danger ${currentFilters.overdue ? 'active' : ''}" data-filter="overdue" data-value="toggle">
          ⚠ المتأخرات فقط (${overdueCount})
        </button>
        <div style="margin-right:auto;">
          <select id="person-filter" style="padding:7px 12px; border:1px solid var(--line); border-radius:18px; font-size:13px; background:white;">
            <option value="">كل الأشخاص</option>
            ${people.map(p => `<option value="${p.id}" ${currentFilters.person === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }

  function renderTasksList(items, today) {
    if (items.length === 0) {
      return `
        <div class="panel">
          <div class="empty-state">
            <div class="empty-state-icon">✓</div>
            <div class="empty-state-title">مفيش مهام بالفلترة دي</div>
            <div class="empty-state-sub">جرّب تغيير الفلترة أو امسحها</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="panel">
        <div class="panel-body" style="padding: 12px;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${items.map(it => renderTaskRow(it, today)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskRow(item, today) {
    const isStep = item._kind === 'step';
    const status = isStep
      ? (STEP_STATUS[item.status] || STEP_STATUS.in_progress)
      : (TASK_STATUS[item.status] || TASK_STATUS.pending);
    const title = item.name_ar || item.title;
    const isOverdue = item.due_date && item.due_date < today;

    return `
      <div onclick="window.location.hash='#/book/${item.book_id}'" style="cursor:pointer; display:flex; align-items:center; gap:12px; padding:12px 14px; background:white; border:1px solid var(--line); border-right:3px solid ${status.color}; border-radius:3px; transition:all 0.15s;" onmouseover="this.style.background='var(--cream-50)';" onmouseout="this.style.background='white';">
        <div style="font-size:18px;">${isStep ? '📋' : '✏️'}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap;">
            <span style="font-weight:700; color:var(--navy-800); font-size:14px;">${escapeHtml(title)}</span>
            <span class="status-tag" style="background:${status.bg}; color:${status.color}; font-size:10px;">${status.label}</span>
            ${!isStep ? '<span style="font-size:10.5px; color:var(--gold-700);">مهمة إضافية</span>' : ''}
          </div>
          <div style="font-size:12px; color:var(--ink-500);">
            📚 ${escapeHtml(item.book?.title || '—')}
          </div>
        </div>
        <div style="text-align:left; font-size:12px;">
          ${item.assignee
            ? `<div style="display:flex; align-items:center; gap:6px; justify-content:flex-end;">
                ${avatarHTML(item.assignee.name, 22)}
                <span style="color:var(--ink-700); font-weight:600;">${escapeHtml(item.assignee.name)}</span>
              </div>`
            : '<span style="color:var(--ink-400);">— لم يُعيَّن —</span>'}
          ${item.due_date ? `<div class="latin" style="color:${isOverdue ? 'var(--danger)' : 'var(--ink-500)'}; font-weight:${isOverdue ? '700' : '400'}; margin-top:4px;">
            ${isOverdue ? '⚠ ' : '📅 '}${escapeHtml(formatDate(item.due_date))}
          </div>` : ''}
        </div>
      </div>
    `;
  }

  function wireUp(allItems, today, people, workByPerson) {
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.onclick = () => {
        const filter = btn.dataset.filter;
        const value = btn.dataset.value;
        if (filter === 'scope') currentFilters.scope = value;
        else if (filter === 'overdue') currentFilters.overdue = !currentFilters.overdue;
        renderTasksPage();
      };
    });

    const personFilter = $('person-filter');
    if (personFilter) {
      personFilter.onchange = () => {
        currentFilters.person = personFilter.value || null;
        renderTasksPage();
      };
    }

    // Preview message buttons
    document.querySelectorAll('.preview-msg-btn').forEach(btn => {
      btn.onclick = () => {
        const personId = btn.dataset.personId;
        const entry = (workByPerson || []).find(e => e.person.id === personId);
        if (!entry) return;

        const message = buildSmartMessage(entry.person.name, entry.buckets);
        const contextHTML = buildContextSummary(entry);

        PTL.components.messagePreview.open({
          title: `رسالة لـ ${entry.person.name}`,
          message,
          phone: entry.person.phone,
          personName: entry.person.name,
          contextHTML,
        });
      };
    });
  }

  // Quick visual summary above the message textarea
  function buildContextSummary(entry) {
    const { person, items, buckets } = entry;
    const summary = [];
    if (buckets.overdue.length) summary.push({ count: buckets.overdue.length, label: 'متأخرة', color: 'var(--danger)', bg: '#fdf2f2' });
    if (buckets.today.length) summary.push({ count: buckets.today.length, label: 'النهاردة', color: 'var(--warning)', bg: '#fdf9f0' });
    if (buckets.revision.length) summary.push({ count: buckets.revision.length, label: 'تعديل', color: 'var(--danger)', bg: '#fdf2f2' });
    if (buckets.awaiting.length) summary.push({ count: buckets.awaiting.length, label: 'انتظار', color: 'var(--warning)', bg: '#fdf9f0' });
    if (buckets.soon.length) summary.push({ count: buckets.soon.length, label: 'قريبة', color: 'var(--gold-700)', bg: 'var(--cream-100)' });
    if (buckets.upcoming.length) summary.push({ count: buckets.upcoming.length, label: 'لاحقاً', color: 'var(--ink-500)', bg: '#eee' });

    return `
      <div style="padding:14px; background:var(--cream-50); border:1px solid var(--line); border-radius:3px; margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px;">
          ملخص الشغل لـ ${escapeHtml(person.name)}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${summary.map(s => `<span style="font-size:12px; padding:4px 10px; border-radius:12px; background:${s.bg}; color:${s.color}; font-weight:700;">${s.count} ${s.label}</span>`).join('')}
        </div>
      </div>
    `;
  }

  PTL.routes['/tasks'] = renderTasksPage;
})();
