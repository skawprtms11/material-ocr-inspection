"use client";

import { Check } from "lucide-react";

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50 disabled:text-slate-400";

export function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ring-1 transition ${
        checked ? "bg-sky-500 text-white ring-sky-500" : "bg-white text-slate-500 ring-slate-200 hover:bg-sky-50"
      }`}
    >
      {checked && <Check className="size-3.5" />}
      {label}
    </button>
  );
}
