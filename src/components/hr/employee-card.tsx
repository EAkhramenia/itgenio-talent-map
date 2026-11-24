import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { X } from "lucide-react";
import { db, schemaNotice, type HrEntry, type Org, type Person } from "@/lib/org-data";
import { personnelLabels, departureReasons } from "@/lib/company-analytics";
import { statusFlags, statusLabels } from "@/lib/employee-status";
import { Pill, selectCls } from "@/components/hr/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PositionPicker } from "@/components/hr/position-picker";

import { FeedbackPanel } from "@/components/hr/employee-feedback";

const opt = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
const url = z.string().url().regex(/^https?:\/\//).max(500).nullable();
const date = z.string().date().nullable();
const probationLabels: Record<string, string> = { passed: "Пройден", failed: "Не пройден", extended: "Продлён" };
const allowed = /\.(pdf|doc|docx)$/i;

export function EmployeeCard({ org, person, onClose }: { org: Org; person: Person | null; onClose: () => void }) {
  const [tab, setTab] = useState<"card" | "feedback">("card");
  const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const initialDeptId = person?.department_id ?? org.teams.find((t) => t.id === person?.team_id)?.department_id ?? "";
  const [deptId, setDeptId] = useState(initialDeptId);
  const today = new Date().toISOString().slice(0, 10);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["company-dashboard"] }), qc.invalidateQueries({ queryKey: ["org"] }), qc.invalidateQueries({ queryKey: ["registry"] }), qc.invalidateQueries({ queryKey: ["hr-entries"] })]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const schema = z.object({
      personnel_type: z.enum(["staff", "trainer", "contractor"]).nullable(), departure_reason: z.enum(["pay", "workload", "management", "growth", "personal", "redundancy", "contract_end", "other"]).nullable(),
      name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(255), position: z.string().trim().max(200),
      department_id: z.string().uuid(), team_id: z.string().uuid().nullable(),
      team_lead_employee_id: z.string().uuid().nullable(),
      manager_employee_id: z.string().uuid().nullable(), hr_owner_id: z.string().uuid().nullable(),
      start_date: date, currently_working: z.boolean().nullable(), probation_end_date: date, probation_result: z.enum(["passed", "failed", "extended"]).nullable(),
      planned_end_date: date, end_date: date, gena_url: url, notion_url: url,
    });
    const startDate = opt(f.get("start_date"));
    const parsed = schema.safeParse({
      personnel_type: opt(f.get("personnel_type")), departure_reason: opt(f.get("departure_reason")),
      name: f.get("name"), email: f.get("email"), position: f.get("position") ?? "", department_id: opt(f.get("department_id")), team_id: opt(f.get("team_id")),
      team_lead_employee_id: opt(f.get("team_lead_employee_id")),
      manager_employee_id: opt(f.get("manager_employee_id")), hr_owner_id: opt(f.get("hr_owner_id")),
      start_date: startDate, currently_working: startDate ? null : f.get("currently_working") === "yes" ? true : f.get("currently_working") === "no" ? false : null,
      probation_end_date: opt(f.get("probation_end_date")), probation_result: opt(f.get("probation_result")),
      planned_end_date: opt(f.get("planned_end_date")), end_date: opt(f.get("end_date")), gena_url: opt(f.get("gena_url")), notion_url: opt(f.get("notion_url")),
    });
    if (!parsed.success) { toast.error("Проверьте поля: отдел обязателен, ссылки должны начинаться с http:// или https://"); return; }
    const d = parsed.data;
    if (d.team_id && org.teams.find((t) => t.id === d.team_id)?.department_id !== d.department_id) { toast.error("Команда должна принадлежать выбранному отделу"); return; }
    if (person && d.manager_employee_id === person.id) { toast.error("Сотрудник не может быть своим руководителем"); return; }
    if (person && d.team_lead_employee_id === person.id) { toast.error("Сотрудник не может быть своим тимлидом"); return; }
    if (org.companyReady && !d.personnel_type) { toast.error("Выберите категорию персонала: сотрудники, тренеры или подрядчики"); return; }
    const { personnel_type, departure_reason, ...basePayload } = d;
    let payload: Record<string, unknown> = org.companyReady ? d : basePayload;
    if (!org.teamLeadReady) { const { team_lead_employee_id, ...withoutTeamLead } = payload; payload = withoutTeamLead; }
    if (!org.schemaReady) {
      if (!d.start_date) { toast.error("До применения SQL этапа 1 дата выхода обязательна"); return; }
      payload = { name: d.name, email: d.email, position: d.position, team_id: d.team_id, start_date: d.start_date, end_date: d.end_date };
    }
    if (person?.gena_id) {
      const reviewed = f.get("hr_reviewed") === "on";
      if (reviewed && !d.start_date && !(d.end_date && d.end_date <= today) && d.currently_working === null) { toast.error("Для завершения проверки укажите, работает ли сотрудник сейчас"); return; }
      payload = { ...payload, needs_hr_review: !reviewed };
    }
    setBusy(true);
    const res = person ? await db.from("employees").update(payload).eq("id", person.id) : await db.from("employees").insert(payload);
    setBusy(false);
    if (res.error) { toast.error("Не удалось сохранить. Проверьте email, даты и выбор команды."); return; }
    await refresh(); toast.success("Сотрудник сохранён"); onClose();
  }

  // Keep existing archived assignments selectable so an unrelated edit never clears them.
  const teams = org.teams.filter((t) => (!t.archived || t.id === person?.team_id) && t.department_id === deptId);
  const flags = person ? statusFlags(person, org.leaves, today) : [];
  return <div className="fixed inset-0 z-50 flex justify-end"><div className="absolute inset-0 bg-foreground/30" onClick={onClose} /><aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-card p-6">
    <Button aria-label="Закрыть" size="icon" variant="ghost" className="absolute right-3 top-3" onClick={onClose}><X className="h-4 w-4" /></Button>
    <h2 className="mb-2 text-xl font-semibold">{person ? person.name : "Новый сотрудник"}</h2>
    {person && <div className="mb-4 flex flex-wrap gap-1">{flags.map((f) => <Pill key={f} tone={f === "probation_decision" ? "warning" : f === "dismissed" ? "destructive" : f === "working" ? "success" : "muted"}>{statusLabels[f]}</Pill>)}{person.archived && <Pill>Архив</Pill>}</div>}
    {person && <div className="mb-4 flex gap-2" role="tablist" aria-label="Разделы карточки"><Button type="button" role="tab" aria-selected={tab === "card"} variant={tab === "card" ? "default" : "outline"} onClick={() => setTab("card")}>Карточка</Button><Button type="button" role="tab" aria-selected={tab === "feedback"} variant={tab === "feedback" ? "default" : "outline"} onClick={() => setTab("feedback")}>Обратная связь</Button></div>}
    {person && tab === "feedback" && <FeedbackPanel employeeId={person.id} employeeName={person.name} />}
    <div hidden={tab !== "card"}>
    {!org.schemaReady && <p className="mb-4 rounded-lg border bg-muted p-3 text-sm">{schemaNotice}</p>}
    {person?.gena_id && <div className="mb-4 rounded-lg border p-3 text-sm"><p>ID в Гене: {person.gena_id}</p><p>Отдел в источнике: {person.gena_source?.department || "—"}</p><p>Команда в источнике: {person.gena_source?.team || "—"}</p><p>Должность в источнике: {person.gena_source?.positions || "—"}</p><p className="text-muted-foreground">Проверьте отдел, команду, категорию и статус. Дата создания аккаунта не является датой выхода.</p></div>}
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">ФИО<Input name="name" defaultValue={person?.name} required maxLength={200} /></label>
      <label className="text-sm">Email<Input name="email" type="email" defaultValue={person?.email} required maxLength={255} /></label>
      <PositionPicker value={person?.position ?? ""} positions={org.people.filter(p => !p.archived || p.id === person?.id).map(p => p.position)} />
      <label className="text-sm">Отдел<select name="department_id" required className={`${selectCls} block w-full`} value={deptId} onChange={(e) => setDeptId(e.target.value)}><option value="">Выберите отдел</option>{org.departments.filter((d) => !d.archived || d.id === deptId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="text-sm">Команда (необязательно)<select key={deptId} name="team_id" className={`${selectCls} block w-full`} defaultValue={initialDeptId === deptId ? person?.team_id ?? "" : ""}><option value="">Без команды</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">{!deptId ? "Сначала выберите отдел. " : teams.length === 0 ? "В этом отделе пока нет команд. " : ""}HR добавляют и переименовывают команды в разделе «Оргструктура».</span></label>
      <label className="text-sm">Руководитель отдела<select name="manager_employee_id" className={`${selectCls} block w-full`} defaultValue={person?.manager_employee_id ?? ""}><option value="">Не указан</option>{org.people.filter((p) => p.id !== person?.id && (!p.archived || p.id === person?.manager_employee_id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Тимлид (необязательно)<select name="team_lead_employee_id" disabled={!org.teamLeadReady} className={`${selectCls} block w-full`} defaultValue={person?.team_lead_employee_id ?? ""}><option value="">Не указан</option>{org.people.filter(p => p.id !== person?.id && (!p.archived || p.id === person?.team_lead_employee_id)).map(p => <option key={p.id} value={p.id}>{p.name}{p.archived ? " · архив" : ""}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">{org.teamLeadReady ? "Выберите сотрудника. Эта отметка не выдаёт доступ к системе." : "Для сохранения тимлида примените SQL-файл 2026-11-23_employee_team_lead.sql."}</span></label>
      <label className="text-sm">Ответственный HR<select name="hr_owner_id" className={`${selectCls} block w-full`} defaultValue={person?.hr_owner_id ?? ""}><option value="">Не указан</option>{org.hrOperators.map((p) => <option key={p.id} value={p.id}>{p.display_name || "HR без имени"}</option>)}</select></label>
      {org.companyReady && <label className="text-sm">Категория персонала<select name="personnel_type" required className={`${selectCls} block w-full`} defaultValue={person?.personnel_type ?? ""}><option value="">Выберите категорию</option>{Object.entries(personnelLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><span className="text-xs text-muted-foreground">Сотрудники — без тренеров и подрядчиков</span></label>}
      <label className="text-sm">Дата выхода<Input name="start_date" type="date" defaultValue={person?.start_date ?? ""} /></label>
      <label className="text-sm">Если дата выхода неизвестна: работает сейчас?<select name="currently_working" className={`${selectCls} block w-full`} defaultValue={person?.currently_working === true ? "yes" : person?.currently_working === false ? "no" : ""}><option value="">Неизвестно</option><option value="yes">Да, работает</option><option value="no">Нет, не работает</option></select></label>
      <label className="text-sm">Окончание испытательного срока<Input name="probation_end_date" type="date" defaultValue={person?.probation_end_date ?? ""} /></label>
      <label className="text-sm">Результат испытательного срока<select name="probation_result" className={`${selectCls} block w-full`} defaultValue={person?.probation_result ?? ""}><option value="">Не указан</option>{Object.entries(probationLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-sm">Планируемый уход<Input name="planned_end_date" type="date" defaultValue={person?.planned_end_date ?? ""} /></label>
      <label className="text-sm">Дата ухода (первый день вне компании)<Input name="end_date" type="date" defaultValue={person?.end_date ?? ""} /></label>
      {org.companyReady && <label className="text-sm sm:col-span-2">Согласованная причина ухода<select name="departure_reason" className={`${selectCls} block w-full`} defaultValue={person?.departure_reason ?? ""}><option value="">Пока не указана</option>{Object.entries(departureReasons).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><span className="text-xs text-muted-foreground">Видна всем руководителям на главной. Подробности сохраняйте в закрытых HR-комментариях.</span></label>}
      <label className="text-sm">Ссылка на сотрудника в Гене<Input name="gena_url" type="url" defaultValue={person?.gena_url ?? ""} maxLength={500} placeholder="https://" /></label>
      <label className="text-sm">Ссылка на сотрудника в Notion<Input name="notion_url" type="url" defaultValue={person?.notion_url ?? ""} maxLength={500} placeholder="https://" /></label>
      {person?.gena_id && <label className="text-sm sm:col-span-2"><input name="hr_reviewed" type="checkbox" defaultChecked={!person.needs_hr_review} /> Данные проверены HR</label>}
      <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>Сохранить</Button>
        {person && <Button type="button" variant="outline" onClick={async () => { const res = await db.from("employees").update({ archived: !person.archived }).eq("id", person.id); if (res.error) { toast.error("Не удалось"); return; } await refresh(); onClose(); }}>{person.archived ? "Восстановить из архива" : "В архив"}</Button>}</div>
    </form>
    {person && org.schemaReady && <PersonExtras org={org} person={person} refresh={refresh} />}
    {person && <History org={org} person={person} />}
    </div>
  </aside></div>;
}

function PersonExtras({ org, person, refresh }: { org: Org; person: Person; refresh: () => Promise<unknown> }) {
  const entries = useQuery({ queryKey: ["hr-entries", person.id], queryFn: async () => {
    const [res, notes] = await Promise.all([db.from("employee_resumes").select("*").eq("employee_id", person.id).order("created_at", { ascending: false }), db.from("employee_hr_notes").select("*").eq("employee_id", person.id).order("created_at", { ascending: false })]);
    if (res.error || notes.error) throw new Error("Нет доступа");
    return { resumes: res.data as HrEntry[], notes: notes.data as HrEntry[] };
  } });
  const [busy, setBusy] = useState(false);
  const author = (id: string) => org.profiles.find((p) => p.id === id)?.display_name || "HR";
  const when = (s: string) => new Date(s).toLocaleString("ru-RU");
  const leaves = org.leaves.filter((l) => l.employee_id === person.id);
  const openLeave = leaves.find((l) => !l.ends_on);

  async function addResume(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const file = f.get("file") instanceof File && (f.get("file") as File).size > 0 ? f.get("file") as File : null;
    const link = opt(f.get("link")); const body = String(f.get("body") ?? "").trim();
    if (!file && !link && !body) { toast.error("Добавьте файл, ссылку или текст"); return; }
    if (link && !url.safeParse(link).success) { toast.error("Ссылка должна начинаться с http:// или https://"); return; }
    if (file && (!allowed.test(file.name) || file.size > 10 * 1024 * 1024)) { toast.error("Только PDF, DOC или DOCX до 10 МБ"); return; }
    setBusy(true);
    let file_path: string | null = null;
    if (file) {
      file_path = `${person.id}/${crypto.randomUUID()}.${file.name.split(".").pop()!.toLowerCase()}`;
      const up = await db.storage.from("employee-resumes").upload(file_path, file, file.type ? { contentType: file.type } : {});
      if (up.error) { setBusy(false); toast.error("Не удалось загрузить файл"); return; }
    }
    const res = await db.from("employee_resumes").insert({ employee_id: person.id, file_path, file_name: file?.name.slice(0, 200) ?? null, link_url: link, body });
    setBusy(false); if (res.error) { toast.error("Не удалось сохранить резюме"); return; }
    form.reset(); await entries.refetch(); toast.success("Резюме добавлено");
  }
  async function openFile(path: string) {
    const r = await db.storage.from("employee-resumes").createSignedUrl(path, 300);
    if (r.error || !r.data) { toast.error("Нет доступа к файлу"); return; }
    window.open(r.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <>
    <h3 className="mt-8 font-semibold">Бессрочный отпуск</h3>
    <p className="text-xs text-muted-foreground">Отпуск не является увольнением; сотрудник остаётся в численности.</p>
    {leaves.map((l) => <div key={l.id} className="mt-2 text-sm">{l.starts_on} — {l.ends_on ?? "бессрочно"} {l.note && `· ${l.note}`}</div>)}
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const d = opt(f.get("d")); if (!d) return;
      const res = openLeave ? await db.from("employee_leaves").update({ ends_on: d }).eq("id", openLeave.id) : await db.from("employee_leaves").insert({ employee_id: person.id, starts_on: d, note: String(f.get("note") ?? "").slice(0, 500) });
      if (res.error) { toast.error("Не удалось сохранить отпуск"); return; } await refresh(); }}>
      <label className="text-sm">{openLeave ? "Дата возвращения" : "Начало отпуска"}<Input name="d" type="date" required /></label>
      {!openLeave && <label className="text-sm">Комментарий<Input name="note" maxLength={500} /></label>}
      <Button variant="outline">{openLeave ? "Завершить отпуск" : "Отправить в отпуск"}</Button></form>

    {person.end_date && <><h3 className="mt-8 font-semibold">Повторный найм</h3>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
        const res = await db.rpc("rehire_employee", { p_employee: person.id, p_start: opt(f.get("start")), p_probation_end: opt(f.get("probation")) });
        if (res.error) { toast.error("Не удалось: дата нового выхода не может быть раньше прошлого ухода"); return; } await refresh(); toast.success("Открыт новый период работы"); }}>
        <label className="text-sm">Новая дата выхода<Input name="start" type="date" /></label>
        <label className="text-sm">Окончание испытательного срока<Input name="probation" type="date" /></label>
        <Button variant="outline">Принять повторно</Button></form></>}

    <h3 className="mt-8 font-semibold">Резюме</h3>
    <p className="text-xs text-muted-foreground">Видно только HR. Файлы хранятся приватно и открываются по временной ссылке.</p>
    <form className="mt-2 space-y-2" onSubmit={addResume}>
      <Input name="file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      <Input name="link" type="url" placeholder="Ссылка (необязательно)" maxLength={500} />
      <Textarea name="body" placeholder="Текст резюме (необязательно)" maxLength={20000} />
      <Button variant="outline" disabled={busy}>Добавить резюме</Button></form>
    {entries.data?.resumes.map((r) => <div key={r.id} className="mt-3 rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">{author(r.author_id)} · {when(r.created_at)}</p>
      {r.file_path && <Button variant="link" className="h-auto p-0" onClick={() => openFile(r.file_path!)}>{r.file_name ?? "Файл"}</Button>}
      {r.link_url && <p><a className="text-primary underline" href={r.link_url} target="_blank" rel="noopener noreferrer">{r.link_url}</a></p>}
      {r.body && <p className="whitespace-pre-wrap">{r.body}</p>}</div>)}

    <h3 className="mt-8 font-semibold">HR-комментарии</h3>
    <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const body = String(new FormData(form).get("body") ?? "").trim(); if (!body) return;
      const res = await db.from("employee_hr_notes").insert({ employee_id: person.id, body: body.slice(0, 5000) }); if (res.error) { toast.error("Не удалось сохранить"); return; } form.reset(); entries.refetch(); }}>
      <Textarea name="body" placeholder="Важный комментарий" maxLength={5000} required /><Button variant="outline">Добавить комментарий</Button></form>
    {entries.data?.notes.map((n) => <div key={n.id} className="mt-3 rounded-lg border p-3 text-sm"><p className="text-xs text-muted-foreground">{author(n.author_id)} · {when(n.created_at)}</p><p className="whitespace-pre-wrap">{n.body}</p></div>)}
  </>;
}

function History({ org, person }: { org: Org; person: Person }) {
  const name = (list: { id: string; name: string }[], id?: string) => list.find((x) => x.id === id)?.name ?? "—";
  const d = (s: string | null) => s ?? "дата неизвестна";
  return <>
    <h3 className="mt-8 font-semibold">Периоды работы</h3>
    {org.periods.filter((p) => p.employee_id === person.id).sort((a, b) => (a.opened_at ?? "").localeCompare(b.opened_at ?? "")).map((p) => <div key={p.id} className="mt-2 text-sm">{d(p.start_date)} — {p.end_date ?? (person.start_date || person.currently_working ? "сейчас" : "окончание не указано")}{p.probation_end_date && ` · испытательный до ${p.probation_end_date}: ${p.probation_result ? probationLabels[p.probation_result] : "результат не указан"}`}</div>)}
    <h3 className="mt-6 font-semibold">Переводы между отделами</h3>
    {org.deptMemberships.filter((m) => m.employee_id === person.id).map((m) => <div key={m.id} className="mt-2 text-sm">{name(org.departments, m.department_id)} · {d(m.starts_on)} — {m.ends_on ?? "сейчас"}</div>)}
    <h3 className="mt-6 font-semibold">Переводы между командами</h3>
    {org.teamMemberships.filter((m) => m.employee_id === person.id).map((m) => <div key={m.id} className="mt-2 text-sm">{name(org.teams, m.team_id)} · {d(m.starts_on)} — {m.ends_on ?? "сейчас"}</div>)}
  </>;
}
