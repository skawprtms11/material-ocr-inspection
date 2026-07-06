"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopFilterBar } from "@/components/layout/TopFilterBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dff6ff_0,#fff7df_36%,#f7f0ff_70%,#f5fffb_100%)] text-slate-800">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopFilterBar />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
