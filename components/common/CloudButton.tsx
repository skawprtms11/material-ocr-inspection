import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type CloudButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "soft" | "danger" | "success" | "warning";
};

const tones = {
  primary: "bg-sky-500 text-white shadow-sky-200 hover:bg-sky-600",
  soft: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-sky-50",
  danger: "bg-rose-100 text-rose-700 hover:bg-rose-200",
  success: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  warning: "bg-amber-100 text-amber-800 hover:bg-amber-200"
};

export function CloudButton({ children, className, tone = "primary", ...props }: CloudButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
