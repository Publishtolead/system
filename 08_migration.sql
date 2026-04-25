-- ============================================================================
-- Publish to Lead — Migration v8 (Phase 7.0 - Pricing & Settings)
-- ============================================================================
-- Adds:
--   1. system_settings table (singleton: exchange rate, packages, add-ons)
--   2. Pricing fields on books (package, total, currency)
--   3. book_addons table (which add-ons each book has, with custom prices)
--   4. Default payment plan template (extends payment_plans/installments)
-- ============================================================================

-- 1. SYSTEM SETTINGS — singleton key-value store
create table if not exists system_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  description text,
  updated_at timestamptz default now(),
  updated_by uuid references people(id) on delete set null
);

create index if not exists idx_settings_key on system_settings(key);

-- Seed default settings (only if not exists)
insert into system_settings (key, value, description) values
  ('exchange_rate_usd_egp', '50'::jsonb,
    'سعر صرف الدولار الأمريكي إلى الجنيه المصري — يستخدم في عرض الأسعار')
on conflict (key) do nothing;

insert into system_settings (key, value, description) values
  ('packages', '[
    {"id": "starter", "name_ar": "Starter", "name_en": "Starter", "price_usd": 1000, "description_ar": "100-250 صفحة"},
    {"id": "core",    "name_ar": "Core",    "name_en": "Core",    "price_usd": 1350, "description_ar": "250-500 صفحة"},
    {"id": "pro",     "name_ar": "Pro",     "name_en": "Pro",     "price_usd": 1750, "description_ar": "500+ صفحة"}
  ]'::jsonb, 'الباقات الأساسية المتاحة للكتب')
on conflict (key) do nothing;

insert into system_settings (key, value, description) values
  ('addons', '[
    {"id": "digital_templates", "name_ar": "Digital Template Assets", "price_usd": 200, "description_ar": "نسخ رقمية قابلة للتعديل لكل القوالب"},
    {"id": "printed_templates", "name_ar": "Printed Templates",       "price_usd": 150, "description_ar": "4-10 قوالب مطبوعة جاهزة للاستخدام"},
    {"id": "landing_page",      "name_ar": "Selling Landing Page",    "price_usd": 80,  "description_ar": "صفحة هبوط عالية التحويل مخصصة لبيع الكتاب"},
    {"id": "playbook",          "name_ar": "Playbook / Journal",      "price_usd": 200, "description_ar": "تصميم مخصص لكل Playbook أو Journal"},
    {"id": "full_website",      "name_ar": "Full Digital Website",    "price_usd": 300, "description_ar": "موقع كامل مع لوحة تحكم وتسجيلات ومحتوى رقمي ($100/سنة بعد كده)"}
  ]'::jsonb, 'الإضافات الاختيارية المتاحة للكتب')
on conflict (key) do nothing;

insert into system_settings (key, value, description) values
  ('default_payment_plan', '[
    {"order": 1, "label": "بدء المشروع",   "percentage": 20, "description": "مقدم لتأمين البدء وإطلاق الـ Onboarding"},
    {"order": 2, "label": "أول تسليم",      "percentage": 25, "description": "عند تسليم أول فصل والأجزاء الهيكلية"},
    {"order": 3, "label": "اعتماد المسودة", "percentage": 25, "description": "بعد موافقة العميل على المسودة الكاملة"},
    {"order": 4, "label": "التسليم النهائي", "percentage": 30, "description": "عند استلام النسخ المطبوعة والإضافات النهائية"}
  ]'::jsonb, 'خطة الدفع الافتراضية للكتب الجديدة (يمكن تعديلها لكل كتاب)')
on conflict (key) do nothing;

-- 2. BOOK PRICING — extend books table
alter table books
  add column if not exists package_id text,
  add column if not exists total_price_usd numeric(12, 2);

create index if not exists idx_books_package on books(package_id);

-- 3. BOOK ADDONS — which add-ons each book has, with optional custom price override
create table if not exists book_addons (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  addon_id text not null,                     -- e.g. 'landing_page'
  custom_price_usd numeric(12, 2),            -- null = use default from settings
  notes text,
  created_at timestamptz default now(),
  unique(book_id, addon_id)
);

create index if not exists idx_book_addons_book on book_addons(book_id);

-- RLS
alter table system_settings enable row level security;
drop policy if exists "auth_read_settings" on system_settings;
create policy "auth_read_settings" on system_settings
  for select to authenticated using (true);

drop policy if exists "auth_write_settings" on system_settings;
create policy "auth_write_settings" on system_settings
  for all to authenticated using (true) with check (true);

alter table book_addons enable row level security;
drop policy if exists "auth_all_addons" on book_addons;
create policy "auth_all_addons" on book_addons
  for all to authenticated using (true) with check (true);

-- Verification
select 'system_settings table' as item, count(*) > 0 as ok
from information_schema.tables where table_name = 'system_settings'
union all
select 'book_addons table', count(*) > 0
from information_schema.tables where table_name = 'book_addons'
union all
select 'books.package_id', count(*) > 0
from information_schema.columns where table_name = 'books' and column_name = 'package_id'
union all
select 'books.total_price_usd', count(*) > 0
from information_schema.columns where table_name = 'books' and column_name = 'total_price_usd'
union all
select 'default settings seeded', count(*) >= 4
from system_settings where key in ('exchange_rate_usd_egp', 'packages', 'addons', 'default_payment_plan');
