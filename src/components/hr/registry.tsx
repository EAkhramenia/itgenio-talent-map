import { useState } from "react";
import { Archive, Plus } from "lucide-react";
import { useOperator } from "@/lib/people-data";
import { useOrg, schemaNotice } from "@/lib/org-data";
import { personnelLabels, type PersonnelType } from "@/lib/company-analytics";
import { departmentOf, statusFlags, statusLabels, tenureStats, type StatusFlag } from "@/lib/employee-status";
import { PageHeader, Pill, selectCls } from "@/components/hr/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CsvImport } from "@/components/hr/csv-import";
import { EmployeeCard } from "@/components/hr/employee-card";

export function RegistryPage() {
  const operator = useOperator(); const org = useOrg();
  const [reviewOnly, setReviewOnly] = useState(false);
  const [query, setQuery] = useState(""); const [showArchived, setShowArchived] = useState(false);
  const [dept, setDept] = useState(""); const [team, setTeam] = useState(""); const [status, setStatus] = useState<StatusFlag | "">("");
  const [personnel, setPersonnel] = useState<PersonnelType | "" | "unknown">("");
  const [selected, setSelected] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const r = org.data;
  if (operator.isLoading || org.isLoading) return <p>Загрузка…</p>;
  if (!operator.data?.hr) return <p>Реестр доступен только HR.</p>;
  if (!r) return <p>Не удалось загрузить реестр.</p>;
  const today = new Date().toISOString().slice(0, 10); const q = query.toLowerCase();
  const rows = r.people.filter((p) => p.archived === showArchived
    && (!reviewOnly || p.needs_hr_review)
    && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    && (!dept || departmentOf(p, r.teams) === dept) && (!team || p.team_id === team)
    && (!status || statusFlags(p, r.leaves, today).includes(status))
    && (!personnel || (personnel === "unknown" ? !p.personnel_type : p.personnel_type === personnel)));
  const current = r.people.find((p) => p.id === selected) ?? null;
  const tenure = tenureStats(rows, today);
  return <>
    <PageHeader title="Сотрудники" subtitle={`${rows.length} записей`} actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Добавить сотрудника</Button>} />
    {!r.schemaReady && <p className="mb-4 rounded-lg border bg-muted p-3 text-sm">{schemaNotice}</p>}
    <CsvImport />
    {r.people.some(p => p.needs_hr_review) && <p className="mb-3 rounded-lg border p-3 text-sm">Требуют проверки HR: {r.people.filter(p => p.needs_hr_review && !p.archived).length}. Неизвестные даты и статус работы не заполняются автоматически. <label className="ml-2"><input type="checkbox" checked={reviewOnly} onChange={e => setReviewOnly(e.target.checked)} /> Только на проверку</label></p>}
    <div className="mb-3 flex flex-wrap gap-3">
      <Input className="max-w-sm" placeholder="Поиск по ФИО или email" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select aria-label="Отдел" className={selectCls} value={dept} onChange={(e) => { setDept(e.target.value); setTeam(""); }}><option value="">Все отделы</option>{r.departments.filter(d => showArchived || !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <select aria-label="Команда" className={selectCls} value={team} onChange={(e) => setTeam(e.target.value)}><option value="">Все команды</option>{r.teams.filter((t) => (showArchived || !t.archived) && (!dept || t.department_id === dept)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select aria-label="Статус" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as StatusFlag | "")}><option value="">Любой статус</option>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {r.companyReady && <select aria-label="Категория персонала" className={selectCls} value={personnel} onChange={e=>setPersonnel(e.target.value as typeof personnel)}><option value="">Все категории персонала</option>{Object.entries(personnelLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}<option value="unknown">Не распределены</option></select>}
      <Button variant={showArchived ? "default" : "outline"} onClick={() => { setShowArchived(!showArchived); setDept(""); setTeam(""); }}><Archive className="h-4 w-4" />Архив</Button>
    </div>
    <p className="mb-4 text-sm text-muted-foreground">Средний стаж: {tenure.avgYears.toFixed(1)} г. по {tenure.counted} сотр.{tenure.excluded > 0 && ` · ${tenure.excluded} без даты выхода не учтены в стаже и найме (неполные данные)`}</p>
    <div className="overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[860px] text-sm"><thead className="bg-muted text-left"><tr>{["ФИО", "Email", "Должность", "Отдел", "Команда", "Выход", "Статус"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>
      {rows.map((p) => <tr key={p.id} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => setSelected(p.id)}>
        <td className="p-3 font-medium">{p.name}{p.needs_hr_review && <span className="ml-2 text-xs text-amber-800">Проверить HR</span>}{r.companyReady && <span className="mt-1 block text-xs font-normal text-muted-foreground">{p.personnel_type ? personnelLabels[p.personnel_type] : "Категория не указана"}</span>}</td><td className="p-3">{p.email}</td><td className="p-3">{p.position}</td>
        <td className="p-3">{r.departments.find((d) => d.id === departmentOf(p, r.teams))?.name ?? "—"}</td>
        <td className="p-3">{r.teams.find((t) => t.id === p.team_id)?.name ?? "Без команды"}</td><td className="p-3">{p.start_date ?? "неизвестно"}</td>
        <td className="p-3"><div className="flex flex-wrap gap-1">{statusFlags(p, r.leaves, today).map((f) => <Pill key={f} tone={f === "probation_decision" ? "warning" : f === "dismissed" ? "destructive" : f === "working" ? "success" : "muted"}>{statusLabels[f]}</Pill>)}</div></td>
      </tr>)}
    </tbody></table>{rows.length === 0 && <p className="p-5 text-sm text-muted-foreground">Сотрудников не найдено.</p>}</div>
    {(adding || current) && <EmployeeCard key={current?.id ?? "new"} org={r} person={adding ? null : current} onClose={() => { setAdding(false); setSelected(null); }} />}
  </>;
}
