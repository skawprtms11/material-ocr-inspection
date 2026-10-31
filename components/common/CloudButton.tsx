import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type CloudButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "soft" | "danger" | "success" | "warning";
};

const tones = {
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  soft: "border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
  danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  warning: "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
};

export function CloudButton({ children, className, tone = "primary", ...props }: CloudButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
