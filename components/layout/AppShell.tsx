"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopFilterBar } from "@/components/layout/TopFilterBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopFilterBar />
          <main className="mx-auto w-full max-w-[96rem] px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
