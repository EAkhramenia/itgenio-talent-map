\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'OK: %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.denied(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE q; EXCEPTION WHEN others THEN RAISE NOTICE 'OK denied: %',label; RETURN; END; RAISE EXCEPTION 'FAIL expected denial: %',label; END $$;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-0000-0000-0000000000a1','hr@example.com'),('00000000-0000-0000-0000-0000000000b2','lead@example.com');
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-0000000000a1','hr_admin');
INSERT INTO public.departments(id,name) VALUES('d0000000-0000-0000-0000-000000000001','Department');
INSERT INTO public.employees(id,name,email,department_id) VALUES
 ('e0000000-0000-0000-0000-000000000001','Employee','employee@example.com','d0000000-0000-0000-0000-000000000001'),
 ('e0000000-0000-0000-0000-000000000002','Head','head@example.com','d0000000-0000-0000-0000-000000000001'),
 ('e0000000-0000-0000-0000-000000000003','Lead','lead@example.com','d0000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
UPDATE public.employees SET manager_employee_id='e0000000-0000-0000-0000-000000000002',team_lead_employee_id='e0000000-0000-0000-0000-000000000003' WHERE id='e0000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok((SELECT manager_employee_id<>team_lead_employee_id FROM public.employees WHERE id='e0000000-0000-0000-0000-000000000001'),'head and lead stored independently');
SELECT pg_temp.denied($q$UPDATE public.employees SET team_lead_employee_id=id WHERE id='e0000000-0000-0000-0000-000000000001'$q$,'own team lead blocked in database');
SELECT pg_temp.denied($q$UPDATE public.employees SET team_lead_employee_id='e0000000-0000-0000-0000-000000000099' WHERE id='e0000000-0000-0000-0000-000000000001'$q$,'nonexistent employee blocked');
UPDATE public.employees SET team_lead_employee_id=NULL WHERE id='e0000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok((SELECT manager_employee_id='e0000000-0000-0000-0000-000000000002' AND team_lead_employee_id IS NULL FROM public.employees WHERE id='e0000000-0000-0000-0000-000000000001'),'clearing lead preserves department head');
UPDATE public.employees SET team_lead_employee_id='e0000000-0000-0000-0000-000000000003' WHERE id='e0000000-0000-0000-0000-000000000001';
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.employee_history WHERE employee_id='e0000000-0000-0000-0000-000000000001' AND previous->>'team_lead_employee_id'='e0000000-0000-0000-0000-000000000003' AND current->>'team_lead_employee_id' IS NULL),'audit keeps previous lead');
SELECT pg_temp.ok((SELECT count(*) FROM public.employment_periods WHERE employee_id='e0000000-0000-0000-0000-000000000001')=1,'lead edits do not create employment periods');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
SELECT pg_temp.ok(NOT public.has_role(auth.uid(),'manager') AND NOT public.has_role(auth.uid(),'hr_admin'),'team lead assignment does not grant operator roles');
SELECT pg_temp.ok((SELECT count(*) FROM public.employees)=0,'unprivileged lead does not gain access to employee registry');
SELECT pg_temp.ok((SELECT count(*) FROM public.employee_hr_notes)=0,'HR notes remain private');
RESET ROLE;
