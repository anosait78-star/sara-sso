-- pgTAP: service catalog + dynamic workflow engine (Phase 3)
-- Main scenario (PROJECT_PLAN §8.3): insert "التأمينات الاجتماعية" between "السجل التجاري" and "التسليم"
-- in a v3 draft of the LLC service, publish it; v2 is archived but kept; published versions are read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create or replace function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ids read with full privileges (no session claims yet)
select set_config('test.service', (select id::text from public.services where code = 'CF-LLC'), true);
select set_config('test.v2', (select w.id::text from public.service_workflows w join public.services s on s.id = w.service_id
                               where s.code = 'CF-LLC' and w.version = 2), true);
select set_config('test.v2_steps', (select count(*) from public.workflow_steps where workflow_id = current_setting('test.v2')::uuid)::text, true);
select set_config('test.v2_fields', (select count(*) from public.required_fields f join public.workflow_steps s on s.id = f.workflow_step_id
                                     where s.workflow_id = current_setting('test.v2')::uuid)::text, true);
select set_config('test.v2_docs', (select count(*) from public.required_documents d join public.workflow_steps s on s.id = d.workflow_step_id
                                   where s.workflow_id = current_setting('test.v2')::uuid)::text, true);
select set_config('test.v2_running', (select count(*) from public.service_requests where workflow_id = current_setting('test.v2')::uuid
                                      and status not in ('completed', 'cancelled'))::text, true);
select set_config('test.v2_delivery', (select id::text from public.workflow_steps
                                       where workflow_id = current_setting('test.v2')::uuid and step_key = 'delivery'), true);

-- ===================== starting point (seed) =====================
select is((select status from public.service_workflows where id = current_setting('test.v2')::uuid), 'published'::public.workflow_status, 'LLC v2 is published');
select is(current_setting('test.v2_steps')::int, 7, 'LLC v2 has 7 steps');
select is((select current_workflow_id from public.services where code = 'CF-LLC'), current_setting('test.v2')::uuid, 'service points at v2');
select is((select status from public.service_workflows w join public.services s on s.id = w.service_id where s.code = 'CF-LLC' and w.version = 1),
          'archived'::public.workflow_status, 'LLC v1 is archived');

-- ===================== locks on published / archived versions (database level) =====================
select throws_ok($$ update public.workflow_steps set name_ar = 'تعديل' where id = current_setting('test.v2_delivery')::uuid $$,
                 '55000', null, 'a published step cannot be updated');
select throws_ok($$ delete from public.workflow_steps where id = current_setting('test.v2_delivery')::uuid $$,
                 '55000', null, 'a published step cannot be deleted');
select throws_ok($$ insert into public.workflow_steps (workflow_id, sort_order, name_ar) values (current_setting('test.v2')::uuid, 99, 'خطوة') $$,
                 '55000', null, 'a step cannot be added to a published version');
select throws_ok($$ insert into public.required_documents (workflow_step_id, document_type_id)
                    values (current_setting('test.v2_delivery')::uuid, (select id from public.document_types where key = 'other')) $$,
                 '55000', null, 'a document cannot be added to a published step');
select throws_ok($$ update public.service_workflows set status = 'archived' where id = current_setting('test.v2')::uuid $$,
                 '55000', null, 'status cannot be changed outside publish_workflow');
select throws_ok($$ delete from public.service_workflows where id = current_setting('test.v2')::uuid $$,
                 '55000', null, 'a published version cannot be deleted');
select throws_ok($$ update public.services set current_workflow_id = null where code = 'CF-LLC' $$,
                 '55000', null, 'current workflow is owned by publish_workflow');
select throws_ok($$ update public.services set is_active = true where code = 'LN-EQ' $$,
                 '23514', null, 'a service without a published workflow cannot be activated');

-- ===================== Manager (mona): view only =====================
select pg_temp.login('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select ok((select count(*) from public.services) >= 11, 'manager can read the catalog');
update public.workflow_steps set name_ar = 'محاولة' where step_key = 'collect_data';
select is((select count(*) from public.workflow_steps where name_ar = 'محاولة')::int, 0, 'manager cannot edit steps (RLS)');
select throws_ok($$ select public.create_workflow_draft(current_setting('test.service')::uuid) $$, '42501', null, 'manager cannot open a draft');
select throws_ok($$ select public.publish_workflow(current_setting('test.v2')::uuid) $$, '42501', null, 'manager cannot publish');

-- ===================== Operations (mohamed): no services_config at all =====================
reset role;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select throws_ok($$ select * from public.workflow_diff(current_setting('test.v2')::uuid, current_setting('test.v2')::uuid) $$,
                 '42501', null, 'diff needs services_config.view');

-- ===================== Super admin (sara): the v3 scenario =====================
reset role;
select pg_temp.login('11111111-1111-4111-8111-111111111111');
set local role authenticated;

-- direct API edits of the published version are rejected for the admin too
select throws_ok($$ update public.workflow_steps set duration_value = 9 where id = current_setting('test.v2_delivery')::uuid $$,
                 '55000', null, 'admin cannot edit a published step through the API');
update public.service_workflows set change_note = 'x' where id = current_setting('test.v2')::uuid;
select isnt((select change_note from public.service_workflows where id = current_setting('test.v2')::uuid), 'x',
            'admin cannot edit a published version note (RLS: drafts only)');

-- 1) draft from v2
select set_config('test.v3', public.create_workflow_draft(current_setting('test.service')::uuid)::text, true);
select is((select version from public.service_workflows where id = current_setting('test.v3')::uuid), 3, 'draft is v3');
select is((select based_on_workflow_id from public.service_workflows where id = current_setting('test.v3')::uuid),
          current_setting('test.v2')::uuid, 'v3 is based on v2');
select is((select count(*) from public.workflow_steps where workflow_id = current_setting('test.v3')::uuid)::int,
          current_setting('test.v2_steps')::int, 'all steps copied');
select is((select count(*) from public.required_fields f join public.workflow_steps s on s.id = f.workflow_step_id
           where s.workflow_id = current_setting('test.v3')::uuid)::int, current_setting('test.v2_fields')::int, 'all fields copied');
select is((select count(*) from public.required_documents d join public.workflow_steps s on s.id = d.workflow_step_id
           where s.workflow_id = current_setting('test.v3')::uuid)::int, current_setting('test.v2_docs')::int, 'all documents copied');
select is(public.create_workflow_draft(current_setting('test.service')::uuid), current_setting('test.v3')::uuid, 'opening a draft again returns the same draft');
select throws_ok($$ select public.clone_workflow_as_draft(current_setting('test.v2')::uuid) $$, 'P0001', null, 'only one draft per service');

-- 2) insert "التأمينات الاجتماعية" between "السجل التجاري" (6) and "التسليم" (7)
select set_config('test.si', public.insert_workflow_step(current_setting('test.v3')::uuid, 7, 'التأمينات الاجتماعية', 'Social insurance')::text, true);
update public.workflow_steps set duration_value = 5, assignee_type = 'department',
       assignee_department_id = (select id from public.departments where name_en = 'Operations'), requires_approval = false
 where id = current_setting('test.si')::uuid;
insert into public.required_documents (workflow_step_id, document_type_id)
values (current_setting('test.si')::uuid, (select id from public.document_types where key = 'social_insurance_form_1'));

select is((select string_agg(step_key, ',' order by sort_order) from public.workflow_steps where workflow_id = current_setting('test.v3')::uuid),
          'collect_data,document_review,name_reservation,company_incorporation,tax_card,commercial_register,social_insurance,delivery',
          'the new step sits between commercial register and delivery');

-- reorder must list every step exactly once
select throws_ok($$ select public.reorder_workflow_steps(current_setting('test.v3')::uuid, array[current_setting('test.si')::uuid]) $$,
                 'P0001', null, 'partial reorder is rejected');

-- 3) validation and diff
select is((select count(*) from public.validate_workflow(current_setting('test.v3')::uuid))::int, 0, 'v3 is valid');
select ok(exists (select 1 from public.workflow_diff(current_setting('test.v2')::uuid, current_setting('test.v3')::uuid)
                  where change = 'step_added' and step_key = 'social_insurance' and (detail ->> 'position')::int = 7),
          'diff: new step at position 7');
select ok(exists (select 1 from public.workflow_diff(current_setting('test.v2')::uuid, current_setting('test.v3')::uuid)
                  where change = 'document_added' and item_key = 'social_insurance_form_1'),
          'diff: new document');
select is((select count(*) from public.workflow_diff(current_setting('test.v2')::uuid, current_setting('test.v3')::uuid)
           where change = 'step_moved')::int, 0, 'diff: shifted steps are not reported as moved');

-- an invalid draft cannot be published
update public.workflow_steps set requires_approval = true, approver_role_id = null where id = current_setting('test.si')::uuid;
select is((select issue from public.validate_workflow(current_setting('test.v3')::uuid)), 'approver_missing', 'missing approver is reported');
select throws_ok($$ select public.publish_workflow(current_setting('test.v3')::uuid) $$, 'P0001', null, 'invalid draft cannot be published');
update public.workflow_steps set requires_approval = false where id = current_setting('test.si')::uuid;

-- 4) publish v3
select is((public.publish_workflow(current_setting('test.v3')::uuid, 'إضافة خطوة التأمينات الاجتماعية') ->> 'running_on_previous')::int,
          current_setting('test.v2_running')::int, 'publish reports the running requests that stay on v2');
select is((select status from public.service_workflows where id = current_setting('test.v3')::uuid), 'published'::public.workflow_status, 'v3 is published');
select is((select status from public.service_workflows where id = current_setting('test.v2')::uuid), 'archived'::public.workflow_status, 'v2 is archived');
select is((select count(*) from public.workflow_steps where workflow_id = current_setting('test.v2')::uuid)::int, 7, 'v2 keeps its 7 steps');
select is((select current_workflow_id from public.services where code = 'CF-LLC'), current_setting('test.v3')::uuid, 'service now points at v3');
select throws_ok($$ update public.workflow_steps set name_ar = 'تعديل' where id = current_setting('test.si')::uuid $$,
                 '55000', null, 'the newly published v3 is read-only');

-- ===================== audit =====================
reset role;
select ok(exists (select 1 from public.audit_logs where table_name = 'service_workflows' and action_key = 'workflow.publish'
                  and record_id = current_setting('test.v3')), 'publishing is audited');

select * from finish();
rollback;
