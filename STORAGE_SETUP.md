# Supabase Storage Setup — مهم لـ Phase 3.5

عشان رفع الملفات (مسودات، أغلفة، صور) يشتغل، لازم تعمل bucket في Supabase Storage.

## الخطوات (3 دقايق)

### 1. روح على Storage في Supabase Dashboard

- في الـ sidebar الشمال، دوس على أيقونة **Storage**

### 2. اعمل bucket جديد

- دوس **"New bucket"**
- **Name:** `book-assets` (لازم يكون بالظبط كده)
- **Public bucket:** ✅ فعّلها (عشان الـ files تكون متاحة للـ download مباشرة)
- دوس **"Save"**

### 3. ضيف policies للـ uploads (اختياري، لكن recommended)

لو الـ uploads مش شغّالة، شغّل ده في الـ SQL Editor:

```sql
-- Allow authenticated users to upload to book-assets
insert into storage.policies (id, bucket_id, name, definition, check_definition)
values (
  gen_random_uuid()::text,
  'book-assets',
  'Authenticated upload',
  '(bucket_id = ''book-assets''::text) AND (auth.role() = ''authenticated''::text)',
  '(bucket_id = ''book-assets''::text) AND (auth.role() = ''authenticated''::text)'
)
on conflict do nothing;
```

أو الأسهل — من Dashboard:
- في Storage → اختار bucket `book-assets`
- روح على tab **"Policies"**
- اعمل policy جديد: **"Authenticated users can upload"** مع SELECT + INSERT + UPDATE + DELETE

### 4. اتأكد إن الـ bucket public

- في Storage → bucket `book-assets`
- اضغط على الـ bucket → **"Configuration"**
- اتأكد إن **Public bucket** مفعّل

---

## التأكد إن كله شغّال

افتح الـ app → روح لكتاب → في قسم "الملفات والأصول" دوس "رفع ملف" → اختار صورة صغيرة → دوس رفع.

لو ظهر الملف في القايمة → كله تمام ✅
لو ظهرت رسالة "Bucket not found" → الـ bucket مش متعمل صح، راجع خطوة 2.
