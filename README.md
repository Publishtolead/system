# Publish to Lead — Internal Operations System

نظام إدارة داخلي لـ **Publish to Lead** — يتابع كل كتاب من أول لقاء مع المؤلف لحد التسليم النهائي.

---

## التشغيل السريع

### للنشر على GitHub Pages
راجع **[`DEPLOYMENT.md`](./DEPLOYMENT.md)** للدليل الكامل خطوة بخطوة.

### للتشغيل المحلي
1. شغّل كل الـ migrations في Supabase (راجع تحت)
2. اعمل Storage bucket `book-assets` كـ Public
3. افتح `index.html` في المتصفح

---

## المميزات

- **20 خطوة workflow** قابلة للتعديل لكل كتاب
- **نظام صلاحيات** ثلاثي: Admin / Manager / Member
- **دعوات بالـ link** — أرسل لينك بالواتساب يدخل بيه أي عضو فريق
- **تتبع الكتب** مع timeline + countdowns + projected dates
- **تذكيرات يومية ذكية** بالواتساب (overdue/today/awaiting/revision/soon)
- **رفع ملفات** أو **روابط Drive/Dropbox**
- **Schedule banner** يقولك لو في الميعاد، متقدم، أو متأخر
- **Activity log** لكل تحديث
- **RTL Arabic** بشكل كامل (Cairo + Tajawal fonts)

---

## الـ Stack التقني

- **Frontend:** HTML + CSS + Vanilla JavaScript (بدون أي framework)
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Hosting:** GitHub Pages (مجاني)

---

## الـ Setup

### 1. شغّل الـ Migrations في Supabase

في **Supabase SQL Editor**، شغّل بالترتيب:

| الملف | إيه فيه |
|---|---|
| `01_schema.sql` | الجداول الأساسية (people, roles, books, workflow_steps...) |
| `02_migration.sql` | حذف الـ placeholders |
| `03_migration.sql` | duration للمراحل |
| `04_migration.sql` | owner + assets + tasks |
| `05_migration.sql` | invitations |
| `06_migration.sql` | manager role + drive links |

### 2. اعمل Storage Bucket

- Supabase Dashboard → **Storage** → **New bucket**
- الاسم: `book-assets`
- ✅ **Public bucket**
- (راجع `STORAGE_SETUP.md` للتفاصيل)

### 3. شغّل النظام

افتح `index.html` في المتصفح.

أول مستخدم بيعمل حساب يكون **Admin** تلقائياً.

---

## الـ Architecture

```
publish-to-lead/
├── index.html              ← شل النظام (login + onboarding + sidebar)
├── DEPLOYMENT.md           ← دليل النشر على GitHub Pages
├── STORAGE_SETUP.md        ← دليل setup الـ bucket
├── *.sql                   ← migrations
├── css/
│   └── main.css            ← كل الـ styling (RTL, navy/gold theme)
└── js/
    ├── config.js           ← Supabase client + permissions helpers
    ├── utils.js            ← helpers (modals, toast, multi-pill, etc.)
    ├── auth.js             ← login + signup + onboarding + invitations
    ├── router.js           ← hash-based routing
    ├── app.js              ← bootstrap (يتحمل آخر)
    ├── components/
    │   ├── book-tasks.js       ← مهام إضافية لكل كتاب
    │   ├── book-assets.js      ← رفع ملفات + روابط Drive
    │   ├── step-editor.js      ← تعديل مراحل لكتاب معين
    │   └── message-preview.js  ← معاينة رسائل الواتساب
    └── pages/
        ├── dashboard.js
        ├── people.js       ← إدارة الفريق + دعوات
        ├── authors.js
        ├── roles.js
        ├── books.js
        ├── book-detail.js  ← القلب: timeline + countdowns + assignments
        ├── tasks.js        ← cross-books + WhatsApp reminders
        └── workflow.js     ← تعديل القالب الأساسي
```

---

## نظام الصلاحيات

| الدور | يقدر يعمل |
|---|---|
| **Admin** | كل حاجة (إدارة فريق، فلو، حذف، تعديل) |
| **Manager** | يشوف كل حاجة + يبعت رسائل، **بدون تعديل** |
| **Member** | يشوف ويعدل في الكتب اللي شغّال عليها |

شخص واحد ممكن يكون **Admin + Manager** في نفس الوقت.

---

## التحديثات المستقبلية

```bash
git add .
git commit -m "وصف التعديل"
git push
```

GitHub Pages هيعمل deploy تلقائياً في 1-2 دقيقة.

---

## License

استخدام داخلي لـ Publish to Lead.
