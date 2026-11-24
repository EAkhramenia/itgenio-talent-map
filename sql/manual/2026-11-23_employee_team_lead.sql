-- Отдельный тимлид в карточке. Существующий manager_employee_id не меняется.
BEGIN;
ALTER TABLE public.employees
 ADD COLUMN IF NOT EXISTS team_lead_employee_id uuid REFERENCES public.employees(id);
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employee_not_own_team_lead;
ALTER TABLE public.employees ADD CONSTRAINT employee_not_own_team_lead
 CHECK(team_lead_employee_id IS NULL OR team_lead_employee_id<>id);
COMMENT ON COLUMN public.employees.team_lead_employee_id IS 'Тимлид сотрудника; отдельная связь от руководителя отдела. Не предоставляет прав доступа.';
NOTIFY pgrst,'reload schema';
COMMIT;
