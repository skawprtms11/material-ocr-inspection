"use client";

import { Check } from "lucide-react";

export const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:bg-muted disabled:text-muted-foreground";

export function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
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
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
        checked ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-input hover:bg-muted hover:text-foreground"
      }`}
    >
      {checked && <Check className="size-3.5" />}
      {label}
    </button>
  );
}
