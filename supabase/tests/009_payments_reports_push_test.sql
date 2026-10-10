-- pgTAP: Phase 7 — payments (paid_amount sync, overpay guard, immutable receipts, void with approve),
-- request fee, reports scoped by RLS, push queue (templates, preferences, staff skipped).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select set_config('test.r1', (select id::text from public.service_requests where request_no = 'REQ-000001'), true);
select set_config('test.r3', (select id::text from public.service_requests where request_no = 'REQ-000003'), true);

-- ===================== seed state =====================
select is((select paid_amount from public.service_requests where id = current_setting('test.r1')::uuid), 10000::numeric(14, 2), 'paid amount = sum of paid receipts');
select is((select paid_amount from public.service_requests where id = current_setting('test.r3')::uuid), 0::numeric(14, 2), 'cancelled receipt does not count');
select ok((select bool_and(payment_no ~ '^PAY-\d{6}$') from public.payments), 'receipt numbers PAY-XXXXXX');

-- ===================== accountant =====================
select pg_temp.login('55555555-5555-4555-8555-555555555555');
set local role authenticated;
select lives_ok($$ insert into public.payments (customer_id, service_request_id, amount, method) values
  ((select customer_id from public.service_requests where id = current_setting('test.r1')::uuid), current_setting('test.r1')::uuid, 3000, 'card') returning id $$,
  'accountant records a payment (insert … returning)');
select is((select paid_amount from public.service_requests where id = current_setting('test.r1')::uuid), 13000::numeric(14, 2), 'paid amount follows');
select throws_ok($$ insert into public.payments (customer_id, service_request_id, amount) values
  ((select customer_id from public.service_requests where id = current_setting('test.r1')::uuid), current_setting('test.r1')::uuid, 2500.01) $$,
  'P0001', 'payment exceeds the outstanding amount', 'cannot pay more than the outstanding amount');
select throws_ok($$ update public.payments set amount = 1 where payment_no = 'PAY-000002' $$,
  'P0001', null, 'a recorded payment cannot be rewritten');
select throws_ok($$ update public.payments set status = 'refunded' where payment_no = 'PAY-000002' $$,
  'P0001', 'a reason is required', 'refund needs a reason');
update public.payments set status = 'refunded', void_reason = 'العميل ألغى الخدمة' where payment_no = 'PAY-000002';
select is((select paid_amount from public.service_requests where id = current_setting('test.r1')::uuid), 8000::numeric(14, 2), 'refund reduces the paid amount');
select ok(exists (select 1 from public.activity_events where event_type = 'payment.refunded' and visible_to_client), 'refund reaches the client timeline');
select throws_ok($$ select public.set_request_amount(current_setting('test.r1')::uuid, 5000) $$,
  'P0001', 'the amount is less than what was already paid', 'fee cannot go below what was paid');
select lives_ok($$ select public.set_request_amount(current_setting('test.r3')::uuid, 6000) $$, 'accountant sets a request fee');
select is((public.report_finance(current_date - 90, current_date) ->> 'outstanding')::numeric, 7000 + 6000 + 500::numeric, 'finance report: outstanding across open requests');
select ok((public.report_finance(current_date - 90, current_date) -> 'aging') ? 'd60_plus', 'finance report has aging buckets');

-- ===================== scope =====================
select pg_temp.login('44444444-4444-4444-8444-444444444444');
set local role authenticated;
select is((select count(*) from public.payments)::int, 0, 'sales sees only payments of own requests (none)');
select throws_ok($$ insert into public.payments (customer_id, amount) values ((select id from public.customers limit 1), 100) $$,
  '42501', null, 'sales cannot record payments');
select is((public.dashboard_summary() ->> 'collected_month')::numeric, 0::numeric, 'dashboard numbers are scoped by RLS');

select pg_temp.login('22222222-2222-4222-8222-222222222222');
set local role authenticated;
update public.payments set status = 'cancelled', void_reason = 'x' where payment_no = 'PAY-000003';
select is((select status from public.payments where payment_no = 'PAY-000003'), 'paid'::public.payment_status, 'manager (view only) cannot void a receipt');

-- ===================== client =====================
reset role;
select pg_temp.login('c1c1c1c1-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from public.payments)::int, 4, 'client sees own receipts');

-- ===================== push queue =====================
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.push_tokens (user_id, token, platform) values ('c1c1c1c1-0000-4000-8000-000000000001', 'ExponentPushToken[test-009]', 'ios');
select app.notify('c1c1c1c1-0000-4000-8000-000000000001', 'document.rejected', 'REQ-000001', 'الصورة غير واضحة');
select is((select push_status from public.notifications where event_key = 'document.rejected' order by created_at desc limit 1), 'pending', 'client with a device: push queued');
select is((select push_title from public.notifications where event_key = 'document.rejected' order by created_at desc limit 1), 'مستند يحتاج إعادة رفع', 'title rendered from the template');
insert into public.notification_preferences (user_id, category, push) values ('c1c1c1c1-0000-4000-8000-000000000001', 'documents', false);
select app.notify('c1c1c1c1-0000-4000-8000-000000000001', 'document.approved', 'REQ-000001', 'تم قبول المستند');
select is((select push_status from public.notifications where event_key = 'document.approved' order by created_at desc limit 1), 'skipped', 'opted-out category is skipped');
select app.notify('11111111-1111-4111-8111-111111111111', 'admin.step.assigned', 'REQ-000001', 'خطوة جديدة');
select is((select push_status from public.notifications where recipient_user_id = '11111111-1111-4111-8111-111111111111' order by created_at desc limit 1), null, 'staff notifications are not pushed');
select is((select count(*) from public.claim_push_batch(10) where 'ExponentPushToken[test-009]' = any (tokens))::int, 1, 'dispatcher claims the queued push with its device tokens');

select * from finish();
rollback;
