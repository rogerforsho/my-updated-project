'use client';

import { useEffect, useId, useState } from 'react';
import { searchActiveCompanies } from '@/src/services/companies';

interface Props {
  label?: string;
  value: string;
  /** Name shown while `value` is set; pass it when the id is preselected. */
  valueLabel?: string;
  onChange: (company_id: string, company_name: string) => void;
  disabled?: boolean;
  /** Hide companies that are closed to new students (for placing a student). */
  openOnly?: boolean;
}

/** Type-to-search company picker: queries the server (top 20) instead of preloading a capped list. */
export function CompanyPicker({ label = 'Company', value, valueLabel = '', onChange, disabled, openOnly }: Props) {
  const id = useId();
  const [text, setText] = useState(valueLabel);
  const [options, setOptions] = useState<{ company_id: string; company_name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { setText(valueLabel); }, [valueLabel]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchActiveCompanies(text, openOnly);
      if (live && res.data) setOptions(res.data);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text, open, openOnly]);

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-bold text-slate-700">{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder="Type to search companies…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (value) onChange('', ''); }}
        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {options.length === 0 ? (
            <li className="px-3.5 py-2 text-xs text-slate-500">No companies match, or they are closed to new students.</li>
          ) : options.map((c) => (
            <li
              key={c.company_id}
              role="option"
              aria-selected={c.company_id === value}
              onMouseDown={(e) => { e.preventDefault(); onChange(c.company_id, c.company_name); setText(c.company_name); setOpen(false); }}
              className="cursor-pointer px-3.5 py-2 text-sm hover:bg-slate-50"
            >
              {c.company_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
