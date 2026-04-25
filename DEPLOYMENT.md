# دليل النشر — GitHub Pages

النظام هيكون متاح على لينك زي:
`https://your-username.github.io/publish-to-lead/`

كل اللي محتاجه: **حساب GitHub مجاني** + **15 دقيقة**.

---

## المتطلبات

- متصفح
- Git مثبّت على جهازك (لو معندكش، نزله من https://git-scm.com)
- حساب GitHub (لو معندكش، اعمل واحد على https://github.com)

---

## الخطوات

### الخطوة 1: اعمل Repository جديد على GitHub

1. ادخل https://github.com وسجّل دخول
2. فوق على اليمين، دوس **+** → **New repository**
3. املأ:
   - **Repository name:** `publish-to-lead` (أو أي اسم تختاره)
   - **Description:** "نظام إدارة Publish to Lead الداخلي"
   - **Public** ✅ (لازم Public عشان GitHub Pages يشتغل مجاناً)
   - ❌ **لا** تختار "Add a README file" (إحنا عندنا واحد بالفعل)
   - ❌ **لا** تختار `.gitignore` ولا `License`
4. دوس **Create repository**

هتظهرلك صفحة فيها أوامر — احتفظ بالـ URL اللي شكله:
```
https://github.com/YOUR-USERNAME/publish-to-lead.git
```

---

### الخطوة 2: ارفع الكود

افتح **Terminal** (أو Command Prompt على Windows):

#### على Mac/Linux:

```bash
# روح للفولدر اللي فيه ptl
cd ~/Downloads/ptl   # أو المكان اللي فككت فيه الـ ZIP

# ابدأ git
git init
git add .
git commit -m "Initial commit — Publish to Lead v5.0"

# اربط بالـ repo اللي عملته (غيّر YOUR-USERNAME)
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/publish-to-lead.git
git push -u origin main
```

#### على Windows:

```cmd
cd C:\Users\YOUR-NAME\Downloads\ptl

git init
git add .
git commit -m "Initial commit — Publish to Lead v5.0"

git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/publish-to-lead.git
git push -u origin main
```

**ملحوظة:** أول مرة git push، GitHub هيطلب منك تسجيل دخول. لو طلب password، استعمل **Personal Access Token** (مش الـ password العادي):
- روح Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
- اختار scope: ✅ `repo`
- انسخ الـ token واستعمله بدل الـ password

---

### الخطوة 3: فعّل GitHub Pages

1. روح للـ repo على GitHub
2. دوس **Settings** فوق على اليمين
3. في الـ sidebar الشمال، دوس **Pages**
4. تحت **Source**:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
   - دوس **Save**
5. استنى دقيقتين، هيظهر فوق:
   ```
   ✓ Your site is live at https://YOUR-USERNAME.github.io/publish-to-lead/
   ```

افتح اللينك ده — النظام شغّال! 🎉

---

### الخطوة 4 (اختيارية): Custom Domain

لو عندك دومين (مثلاً `publishtolead.com`):

1. في GitHub Pages settings، تحت **Custom domain** اكتب:
   ```
   system.publishtolead.com
   ```
2. دوس Save
3. روح لـ DNS provider بتاعك (Namecheap, GoDaddy, Cloudflare, إلخ)
4. أضف **CNAME record**:
   - **Type:** CNAME
   - **Name:** `system` (أو أي subdomain تختاره)
   - **Value:** `YOUR-USERNAME.github.io`
   - **TTL:** 3600 (أو Auto)
5. استنى 10-30 دقيقة، يفعّل HTTPS تلقائياً
6. النظام هيكون على `https://system.publishtolead.com`

---

## التحديثات المستقبلية

أي تعديل في الكود:

```bash
cd ~/Downloads/ptl
git add .
git commit -m "وصف التعديل (مثلاً: أضفت تذكيرات مسائية)"
git push
```

GitHub Pages هيعمل deploy تلقائياً في خلال 1-2 دقيقة.

---

## مشاركة النظام مع الفريق

بعد ما يشتغل، شارك اللينك مع الفريق:

```
أهلاً بكم في نظام Publish to Lead الداخلي 🎉

اللينك:
https://YOUR-USERNAME.github.io/publish-to-lead/

اعمل حساب جديد بإيميلك، وأنا هـ assignلك دورك.
```

---

## مشاكل شائعة

### 404 لما أفتح اللينك
- استنى 5 دقايق إضافية، GitHub Pages بيحتاج وقت أول مرة
- اتأكد إن في صفحة Settings → Pages مكتوب "Your site is live"
- اتأكد إن `index.html` في الـ root (مش في فولدر فرعي)

### الصفحة بيضاء
- افتح Console (F12) → Network tab
- شوف لو في 404 على أي ملف
- اتأكد إن كل الـ scripts مرفوعة (افتح GitHub repo وشوف الفولدرات)

### invitation links مش شغّالة
- لازم تكون فاتح اللينك بنفس الـ HTTPS URL
- اتأكد إن في الإعدادات: **Enforce HTTPS** ✓

### Supabase مش بيتصل
- في Supabase Dashboard → Authentication → URL Configuration
- أضف الـ URL بتاعك في **Site URL** و **Redirect URLs**:
  - `https://YOUR-USERNAME.github.io/publish-to-lead/`
  - أو الـ custom domain لو عاملها

---

## أمان

⚠️ **مهم:** الـ Supabase anon key اللي في `js/config.js` آمن للنشر العام (هو ده الغرض منه). لكن:
- ✅ تأكد إن **Row Level Security (RLS)** مفعّل على كل الجداول في Supabase
- ✅ تأكد إن RLS policies بتمنع الـ unauthenticated access
- ❌ ما تحطش الـ `service_role` key في الكود أبداً
