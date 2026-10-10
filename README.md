# SSO Platform — Sara Soliman

نظام إدارة الخدمات والعملاء (لوحة الإدارة + تطبيق العميل) على Supabase.
التخطيط الكامل في [PROJECT_PLAN.md](PROJECT_PLAN.md) والتصور البصري في `SYSTEM_PRODUCT_DESIGN.pdf`.

## الهيكل

```
apps/admin/          لوحة الإدارة — React + Vite + TypeScript + Tailwind (RTL أولًا)
apps/client/         تطبيق العميل — Expo (React Native) + Expo Router، عربي RTL أولًا
packages/shared/     أنواع قاعدة البيانات، كتالوج الصلاحيات، أدوات التحقق المشتركة
supabase/
  migrations/        كل تغييرات قاعدة البيانات (المصدر الوحيد للـSchema)
  functions/         Edge Functions (Deno) — المكان الوحيد الذي يستخدم Service Role
  tests/             اختبارات pgTAP للصلاحيات والـRLS
  seed.sql           بيانات تطوير محلية فقط
brand/               نسخ الـLogo (شفاف، أبيض، أيقونات التطبيق)
```

## المتطلبات

- Node.js 20+ و pnpm 10
- Docker Desktop (لتشغيل Supabase محليًا) — يحتاج ~8 GB مساحة على القرص الذي يخزن فيه Docker صوره

## التشغيل محليًا

```bash
pnpm install
pnpm db:start            # يشغل Supabase محليًا ويطبق الـmigrations والـseed
pnpm exec supabase status   # انسخ API URL و anon key
```

أنشئ `apps/admin/.env.local` من `apps/admin/.env.example` وضع فيه `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` (المفتاح العام فقط).

```bash
pnpm functions:serve     # في نافذة منفصلة — Edge Functions
pnpm dev                 # لوحة الإدارة على http://localhost:5173
```

### تطبيق العميل (Expo)

أنشئ `apps/client/.env.local` من `apps/client/.env.example` (`EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY` — المفتاح العام فقط).

```bash
pnpm client:web          # نسخة الويب للتجربة السريعة
pnpm client              # ثم امسح الـQR بتطبيق Expo Go على الموبايل
```

على الموبايل استخدم عنوان الكمبيوتر على الشبكة (مثل `http://192.168.1.20:54321`) بدل `127.0.0.1`. حساب العميل التجريبي موثق في أعلى `supabase/seed.sql`.

حسابات التطوير وكلمة السر الخاصة بها موثقة في أعلى `supabase/seed.sql` (للتطوير المحلي فقط).

### ملاحظات التشغيل على Windows

- أداة Supabase CLI مثبتة على **الإصدار 2.90.0** عمدًا: الإصدارات 2.100+ فيها مشكلة تشغيل على Windows (`uv_spawn`) لما يكون مسار المشروع فيه مسافات. لا ترفعها قبل التأكد إن المشكلة اتحلت.
- `pnpm db:start` بيشغّل الخدمات المطلوبة للمرحلة الحالية بس (قاعدة البيانات، الدخول، الـAPI، الدوال) عشان Docker يفضل مستقر. شغّل `supabase start` من غير استثناءات لو محتاج Studio أو Storage.
- بيانات Docker على القرص E: (`E:\Docker\DockerDesktopWSL`).
- العملاء بيدخلوا بالهاتف + كلمة السر، والهاتف بيتحوّل لبريد داخلي `<الهاتف>@clients.sso.internal` (Supabase بيطلب مزود SMS للدخول بالهاتف — راجع PROJECT_PLAN §5.2).

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `pnpm db:reset` | إعادة بناء قاعدة البيانات المحلية من الـmigrations + seed |
| `pnpm client:web` | تطبيق العميل على الويب (Expo) |
| `pnpm db:test` | اختبارات pgTAP (الصلاحيات، RLS، التدقيق، CRM، محرك الـWorkflow) |
| `pnpm db:types` | توليد أنواع TypeScript من قاعدة البيانات إلى `packages/shared` |
| `pnpm typecheck` | فحص الأنواع لكل الحزم |
| `pnpm --filter @sso/shared test` | اختبارات أدوات التحقق |

## أول مدير نظام في الإنتاج

1. أنشئ المستخدم من لوحة Supabase: Authentication ← Users ← Add user (بريد + كلمة سر).
2. من SQL Editor نفّذ مرة واحدة:
   ```sql
   select app.bootstrap_super_admin('owner@example.com', 'الاسم الكامل');
   ```
3. ادخل لوحة الإدارة بنفس البريد، ومنها ادعُ باقي الموظفين.

## قواعد الأمان

- التطبيقات تستخدم **المفتاح العام (anon) فقط**. مفتاح Service Role موجود فقط كـSecret داخل Edge Functions.
- RLS مفعل على كل جدول؛ إخفاء الأزرار في الواجهة للتجربة فقط والحماية الحقيقية في قاعدة البيانات.
- لا تُرفع ملفات `.env` إلى Git.
