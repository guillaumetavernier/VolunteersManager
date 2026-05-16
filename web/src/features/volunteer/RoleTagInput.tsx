import { useState } from "react";
import { useRoleTypes } from "./hooks";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function RoleTagInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const all = useRoleTypes();

  const suggestions = (all.data ?? []).filter(
    (s) => s.toLowerCase().includes(draft.toLowerCase()) && !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  function add(v: string) {
    const t = v.trim();
    if (!t) return;
    if (value.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-2">
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-xs">
            {tag}
            <button type="button" onClick={() => remove(i)} className="text-slate-600 hover:text-slate-900" aria-label={`Retirer ${tag}`}>
              ×
            </button>
          </span>
        ))}
        <input
          list="role-suggestions"
          className="flex-1 bg-transparent text-sm outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length > 0) {
              remove(value.length - 1);
            }
          }}
          onBlur={() => add(draft)}
          placeholder="Ajouter un rôle…"
        />
        <datalist id="role-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
