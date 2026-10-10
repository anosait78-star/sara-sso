# دليل النشر — SSO (المرحلة 8)

| الجزء | المكان | ملاحظات |
|---|---|---|
| قاعدة البيانات + Auth + Storage + Edge Functions | **Supabase Cloud** | المنطقة المقترحة: Frankfurt (eu-central-1) — الأقرب لمصر |
| لوحة الإدارة `apps/admin` | **Vercel** (مشروع 1) | Vite — `apps/admin/vercel.json` |
| تطبيق العميل `apps/client` | **Vercel** (مشروع 2) كتطبيق ويب | Expo web — `apps/client/vercel.json`. يُنشر لاحقًا على Google Play بنفس الكود |
| الكود | **GitHub** (repo خاص) | كل `push` على `main` يُنشر تلقائيًا، وكل فرع يأخذ رابط Preview |

> **قاعدة أمان ثابتة:** في Vercel يوضع **الـ anon (publishable) key فقط**. مفتاح الـ Service Role لا يوضع في Vercel ولا في أي تطبيق — Edge Functions تأخذه تلقائيًا من Supabase.

---

## 1) GitHub
1. أنشئ repo **خاص (Private)** فارغ على github.com (بدون README).
2. من مجلد المشروع:
   ```bash
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
   (أول مرة سيفتح المتصفح لتسجيل الدخول في GitHub.)

## 2) مشروع Supabase
1. supabase.com → **New project** → المنطقة Frankfurt → احفظ **Database password** في مكان آمن.
2. من مجلد المشروع (تسجيل الدخول يتم منك في المتصفح):
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push
   pnpm exec supabase functions deploy
   ```
   - `db push` يطبق كل الـ migrations (الجداول، الصلاحيات، RLS، الـ cron، القوائم المرجعية، قوالب الإشعارات).
     **لا يشغل** `seed.sql` — حسابات التجربة لا تصل للإنتاج أبدًا.
   - `functions deploy` يرفع: `invite-employee`, `set-employee-status`, `client-register`, `client-access`, `dispatch-notification`.
3. **Authentication → Sign In / Providers → Email**: فعّل Email، و**أوقف "Allow new users to sign up"**
   (تسجيل العملاء يتم عبر الـ Edge Function `client-register`، والموظفون بالدعوة فقط)، وأوقف "Confirm email".
4. **Authentication → Policies (Passwords)**: أقل طول 8، ويتطلب حروفًا وأرقامًا.

## 3) أول مدير نظام (Super Admin)
1. **Authentication → Users → Add user → Create new user**: البريد + كلمة سر قوية + ✅ Auto Confirm.
2. **SQL Editor**:
   ```sql
   select app.bootstrap_super_admin('owner@company.com', 'الاسم الكامل');
   ```
   (تعمل مرة واحدة فقط — لو يوجد مدير نظام بالفعل ترفض.)

## 4) كتالوج الخدمات المبدئي
**SQL Editor** → الصق محتوى [`supabase/production/catalog.sql`](supabase/production/catalog.sql) → Run.
ينشئ 11 خدمة بخطواتها وحقولها ومستنداتها وأسعارها (بدون عملاء أو طلبات تجريبية). يُعدل لاحقًا من Workflow Builder.

## 5) إشعارات Push (Vault)
**SQL Editor**:
```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/dispatch-notification',
                           'push_dispatch_url', 'dispatch-notification endpoint for pg_cron');
```
الـ cron يرسل كل دقيقة ما ينتظر الإرسال. (على الويب لا يوجد Push — الإشعارات داخل التطبيق تعمل كالمعتاد.
الـ Push الحقيقي يعمل مع تطبيق Android بعد رفعه على Google Play.)

## 6) Vercel — مشروعان من نفس الـ repo
vercel.com → **Add New → Project** → اختر الـ repo مرتين:

| الإعداد | لوحة الإدارة | تطبيق العميل |
|---|---|---|
| Project name | `sso-admin` | `sso-app` |
| Root Directory | `apps/admin` | `apps/client` |
| Framework | Vite (من vercel.json) | Other (من vercel.json) |
| Environment Variables | `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`<br>`VITE_SUPABASE_ANON_KEY` = anon key | `EXPO_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`<br>`EXPO_PUBLIC_SUPABASE_ANON_KEY` = anon key |

القيم من Supabase → **Project Settings → API**. بعد إضافة/تغيير أي متغير اعمل **Redeploy** (القيم تدخل وقت الـ build).

## 7) ربط الروابط في Supabase
**Authentication → URL Configuration**:
- **Site URL**: رابط لوحة الإدارة (مثال `https://sso-admin.vercel.app`)
- **Redirect URLs**: رابط لوحة الإدارة + رابط تطبيق العميل

## 8) بعد أول دخول (من لوحة الإدارة)
1. **الإعدادات**: بيانات الشركة (الاسم، الهاتف، واتساب، العنوان) — تظهر في الإيصالات وأزرار التواصل في التطبيق.
2. **الموظفون**: دعوة الفريق وتحديد الأدوار والأقسام.
3. **الإعدادات → القوائم المرجعية**: شركات التأمين وجهات التمويل المتعامل معها فعليًا.

## 9) فحص سريع بعد النشر
- [ ] دخول مدير النظام على لوحة الإدارة، وظهور الكتالوج (11 خدمة).
- [ ] دعوة موظف والدخول بحسابه.
- [ ] من رابط تطبيق العميل: **تسجيل جديد** بهاتف حقيقي → يظهر العميل في لوحة الإدارة.
- [ ] طلب خدمة من التطبيق → رفع مستند → قبوله من الإدارة → يظهر الإشعار للعميل.
- [ ] تسجيل دفعة → فتح الإيصال وطباعته.

## تحديثات لاحقة
- **كود الواجهات**: `git push` → Vercel ينشر تلقائيًا.
- **قاعدة البيانات**: migration جديد في `supabase/migrations` ثم `pnpm exec supabase db push`.
- **Edge Functions**: `pnpm exec supabase functions deploy`.
- **النسخ الاحتياطي**: Supabase يأخذ نسخة يومية (الخطة المجانية تحتفظ بها 7 أيام؛ Pro يتيح Point-in-Time Recovery).
