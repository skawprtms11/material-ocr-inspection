import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-violet-600 ring-1 ring-violet-100">
          <Sparkles className="size-3.5" />
          fluffy workflow
        </div>
        <h1 className="text-2xl font-black tracking-normal text-slate-800 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
