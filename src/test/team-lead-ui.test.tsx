import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmployeeCard } from "@/components/hr/employee-card";
import type { Org, Person } from "@/lib/org-data";
import { isCurrent } from "@/lib/employee-status";
const mock = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/org-data", () => ({ db: { from: () => ({ update: mock.update }) }, schemaNotice: "" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: async () => {} }), useQuery: () => ({ data: undefined }) }));
vi.mock("sonner", () => ({ toast: { error: mock.toast, success: vi.fn() } }));
vi.mock("@/components/hr/shell", () => ({ Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>, selectCls: "" }));
const p = { id: "00000000-0000-0000-0000-000000000001", name: "Импорт", email: "test@example.com", position: "source-role", department_id: "00000000-0000-0000-0000-000000000002", gena_id: "gena-test", gena_source: { team: "before-trial" }, needs_hr_review: true, archived: false, start_date: null, end_date: null, currently_working: null, personnel_type: "staff" } as Person;
const org = { schemaReady: true, companyReady: true, people: [p], departments: [{ id: p.department_id, name: "Отдел", archived: false }], teams: [], categories: [], hrOperators: [], profiles: [], periods: [], leaves: [], deptMemberships: [], teamMemberships: [] } as unknown as Org;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show(teamLeadReady = true) { mock.eq.mockResolvedValue({ error: null }); mock.update.mockReturnValue({ eq: mock.eq }); render(<EmployeeCard person={p} org={{...org,teamLeadReady,people:[p,...leaders]}} onClose={() => {}} />); }
const leaders = [
 {...p,id:"00000000-0000-0000-0000-000000000003",name:"Руководитель отдела",email:"head@example.com"},
 {...p,id:"00000000-0000-0000-0000-000000000004",name:"Тимлид команды",email:"lead@example.com"},
];
describe("Employee team lead", () => {
 it("saves head and team lead independently without obsolete group field",async()=>{
  show();fireEvent.change(screen.getByLabelText(/^Руководитель отдела/),{target:{value:leaders[0]!.id}});fireEvent.change(screen.getByLabelText(/^Тимлид/),{target:{value:leaders[1]!.id}});
  expect(screen.queryByText("Дополнительная группа")).toBeNull();
  fireEvent.submit(screen.getByRole("button",{name:"Сохранить"}).closest("form")!);
  await waitFor(()=>expect(mock.update).toHaveBeenCalled());expect(mock.update.mock.calls[0]![0]).toMatchObject({manager_employee_id:leaders[0]!.id,team_lead_employee_id:leaders[1]!.id});expect(mock.update.mock.calls[0]![0]).not.toHaveProperty("category_id");
 });
 it("does not send an unavailable column before migration",async()=>{
  show(false);expect(screen.getByLabelText(/^Тимлид/)).toBeDisabled();fireEvent.submit(screen.getByRole("button",{name:"Сохранить"}).closest("form")!);
  await waitFor(()=>expect(mock.update).toHaveBeenCalled());expect(mock.update.mock.calls[0]![0]).not.toHaveProperty("team_lead_employee_id");
 });
 it("excludes self and allows leaving the team lead empty",async()=>{
  show();expect([...screen.getByLabelText(/^Тимлид/).querySelectorAll("option")].some(o=>o.value===p.id)).toBe(false);fireEvent.submit(screen.getByRole("button",{name:"Сохранить"}).closest("form")!);
  await waitFor(()=>expect(mock.update).toHaveBeenCalled());expect(mock.update.mock.calls[0]![0]).toHaveProperty("team_lead_employee_id",null);
 });
});
