# Publish to Lead — Internal Management System

نظام إدارة داخلي لمتابعة الكتب والفريق والمهام. مبني بـ HTML/CSS/JS عادي + Supabase كـ backend.

## الهيكل

```
publish-to-lead/
├── index.html              ← الصفحة الرئيسية
├── 02_migration.sql        ← Phase 2
├── 03_migration.sql        ← Phase 3
├── 04_migration.sql        ← Phase 3.5
├── STORAGE_SETUP.md        ← دليل setup bucket الـ assets
├── README.md
├── css/
│   └── main.css
└── js/
    ├── config.js
    ├── utils.js
    ├── auth.js
    ├── router.js
    ├── app.js
    ├── components/         ← reusable widgets
    │   ├── book-tasks.js   ← المهام الإضافية في صفحة الكتاب
    │   └── book-assets.js  ← رفع الملفات
    └── pages/
        ├── dashboard.js
        ├── people.js
        ├── authors.js
        ├── roles.js
        ├── books.js
        └── book-detail.js
```

## التشغيل المحلي (للاختبار)

ببساطة افتح `index.html` في المتصفح. كل الملفات هتتحمل صح من الـ paths النسبية.

## التشغيل في Phase 2 (لو ده أول مرة)

1. شغّل `02_migration.sql` في Supabase SQL Editor
2. افتح `index.html`
3. اعمل refresh لو كنت داخل بالفعل

## Namespace

كل الكود بيتشارك state عبر `window.PTL`:

- `PTL.config` — Supabase credentials + version
- `PTL.sb` — Supabase client
- `PTL.state` — current user, person, roles
- `PTL.utils` — helper functions
- `PTL.auth` — auth methods
- `PTL.app` — app shell + routing
- `PTL.routes` — registered route handlers

## إضافة صفحة جديدة

1. اعمل ملف جديد في `js/pages/yourpage.js`
2. الكود الأساسي:

```js
(function() {
  'use strict';
  const { sb, state, utils } = PTL;
  const { $ } = utils;

  async function renderYourPage() {
    $('app-content').innerHTML = `<h1>Your page</h1>`;
  }

  PTL.routes['/yourpage'] = renderYourPage;
})();
```

3. ضيف `<script src="js/pages/yourpage.js"></script>` في `index.html` قبل `js/app.js`
4. ضيف زرار في الـ sidebar:
```html
<button class="nav-item" data-route="/yourpage">صفحتي</button>
```

## النسخة

**v3.0 — Phase 3**
- Books CRUD (إضافة/تعديل/حذف الكتب)
- Auto-instantiation of all 20 workflow steps when a book is created
- Book detail page with timeline grouped by phase
- Stage management: start → in_progress → awaiting_approval → approved (with revision loop)
- Auto-advance to next step (or parallel group) on approval
- Countdown widgets: total days, days in current stage, expected completion date
- Per-book role assignments (who's the AM/Writer/Editor/Designer for this book)
- Activity log for stage transitions
- Skip optional steps support
- Hash routing now supports parameterized routes (e.g. `#/book/:id`)

**v2.0 — Phase 2**
- Onboarding (signup + multi-role select)
- People CRUD
- Authors CRUD
- Roles CRUD
- Dashboard updates (overdue, completion %, authors count)
