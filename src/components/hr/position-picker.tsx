import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/hr/shell";

const customValue = "__new_position__";
const key = (s: string) => s.trim().toLocaleLowerCase("ru");

/** Options come from saved cards, so adding a title needs no separate catalog. */
export function PositionPicker({ value = "", positions }: { value?: string; positions: string[] }) {
  const id = useId();
  const [position, setPosition] = useState(value);
  const [editing, setEditing] = useState(false);
  // Keep this person's exact title, including when another spelling already exists.
  const options = new Map<string, string>();
  for (const name of [...positions, value]) if (name.trim()) options.set(key(name), name.trim());
  const choices = [...options.values()].sort((a, b) => a.localeCompare(b, "ru"));
  const selection = choices.find(name => key(name) === key(position)) ?? "";
  return <div className="text-sm">
    <label htmlFor={id}>Должность</label>
    <input type="hidden" name="position" value={position} />
    {editing ? <>
      <Input id={id} value={position} maxLength={200} autoFocus onChange={e => setPosition(e.target.value)} placeholder="Например, HR-менеджер" />
      <p className="mt-1 text-xs text-muted-foreground">Название сохранится в этой карточке и станет доступно для выбора у других сотрудников.</p>
      <Button type="button" variant="link" className="h-auto px-0 py-1 text-xs" onClick={() => { setPosition(value); setEditing(false); }}>Вернуться к списку</Button>
    </> : <>
      <select id={id} className={`${selectCls} block w-full`} value={selection} onChange={e => {
        if (e.target.value === customValue) { setPosition(""); setEditing(true); } else setPosition(e.target.value);
      }}>
        <option value="">Не указана</option>
        {choices.map(name => <option key={key(name)} value={name}>{name}</option>)}
        <option value={customValue}>+ Добавить должность</option>
      </select>
      {position && <Button type="button" variant="link" className="h-auto px-0 py-1 text-xs" onClick={() => setEditing(true)}>Изменить для сотрудника</Button>}
    </>}
  </div>;
}
