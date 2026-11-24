import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Новые поля этапа 1 ещё не входят в сгенерированные типы (миграция применяется вручную).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<any>;

export type Person = {
  gena_id?: string | null; gena_source?: { department?: string; team?: string; positions?: string; createdAt?: string } | null; needs_hr_review?: boolean;
  id: string; name: string; email: string; position: string; archived: boolean;
  department_id: string | null; team_id: string | null; category_id: string | null;
  team_lead_employee_id?: string | null;
  manager_employee_id: string | null; hr_owner_id: string | null; currently_working: boolean | null;
  start_date: string | null; end_date: string | null; probation_end_date: string | null; probation_result: string | null;
  personnel_type: "staff" | "trainer" | "contractor" | null; departure_reason: string | null;
  planned_end_date: string | null; gena_url: string | null; notion_url: string | null;
};
export type Dept = { id: string; name: string; archived: boolean };
export type Team = { id: string; name: string; department_id: string | null; archived: boolean };
export type Period = { id: string; employee_id: string; start_date: string | null; end_date: string | null; probation_end_date: string | null; probation_result: string | null; planned_end_date: string | null; opened_at: string };
export type Membership = { id: string; employee_id: string; starts_on: string | null; ends_on: string | null; team_id?: string; department_id?: string };
export type LeaveRow = { id: string; employee_id: string; starts_on: string; ends_on: string | null; note: string };
export type HrEntry = { id: string; employee_id: string; body: string; author_id: string; created_at: string; file_path?: string | null; file_name?: string | null; link_url?: string | null };

const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204" || /does not exist|schema cache/i.test(e.message ?? ""));

export function useOrg() {
  return useQuery({ queryKey: ["org"], queryFn: async () => {
    const probe = await db.from("employee_leaves").select("id").limit(1);
    const schemaReady = !missing(probe.error);
    const companyProbe = await db.from("employees").select("personnel_type").limit(1);
    const companyReady = !companyProbe.error;
    const teamLeadProbe = await db.from("employees").select("team_lead_employee_id").limit(1);
    const teamLeadReady = !teamLeadProbe.error;
    const [people, teams, departments, categories, periods, teamM, deptM, leaves, profiles, roles] = await Promise.all([
      db.from("employees").select("*"), db.from("teams").select("*"), db.from("departments").select("*"), db.from("employee_categories").select("*"),
      db.from("employment_periods").select("*"), db.from("team_memberships").select("*"),
      schemaReady ? db.from("department_memberships").select("*") : Promise.resolve({ data: [], error: null }),
      schemaReady ? db.from("employee_leaves").select("*") : Promise.resolve({ data: [], error: null }),
      db.from("profiles").select("id,display_name"), db.from("user_roles").select("user_id,role").eq("role", "hr_admin"),
    ]);
    for (const r of [people, teams, departments, categories, periods, teamM, deptM, leaves]) if (r.error) throw new Error("Не удалось загрузить данные");
    const hrIds = new Set((roles.data ?? []).map((r: { user_id: string }) => r.user_id));
    const ps = (people.data ?? []).map((p: Partial<Person>) => ({ personnel_type: null, departure_reason: null, department_id: null, manager_employee_id: null, team_lead_employee_id: null, hr_owner_id: null, currently_working: null, probation_end_date: null, probation_result: null, planned_end_date: null, gena_url: null, notion_url: null, ...p })) as Person[];
    return {
      schemaReady, companyReady, teamLeadReady, people: ps, teams: (teams.data ?? []) as Team[], departments: (departments.data ?? []) as Dept[],
      categories: (categories.data ?? []) as { id: string; name: string }[], periods: (periods.data ?? []) as Period[],
      teamMemberships: (teamM.data ?? []) as Membership[], deptMemberships: (deptM.data ?? []) as Membership[], leaves: (leaves.data ?? []) as LeaveRow[],
      hrOperators: ((profiles.data ?? []) as { id: string; display_name: string }[]).filter((p) => hrIds.has(p.id)),
      profiles: (profiles.data ?? []) as { id: string; display_name: string }[],
    };
  } });
}
export type Org = NonNullable<ReturnType<typeof useOrg>["data"]>;

export const schemaNotice = "Новые поля станут доступны после применения SQL-файла этапа 1 к базе. Сейчас можно просматривать данные, но сохранение новых полей недоступно.";
