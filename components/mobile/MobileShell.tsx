"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, Home, ListChecks, PackagePlus, Settings } from "lucide-react";
import { Toaster } from "sonner";
import { MobileScopeBadge } from "@/components/mobile/MobileScopeBadge";
import { MobileScopeInitializer } from "@/components/mobile/MobileScopeInitializer";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/mobile", label: "작업검수", icon: ClipboardCheck },
  { href: "/mobile/status", label: "작업현황", icon: ListChecks },
  { href: "/mobile/material-photo", label: "부자재등록", icon: PackagePlus },
  { href: "/mobile/settings", label: "설정", icon: Settings }
];

export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Link href="/mobile" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar text-white">
            <Boxes className="size-4" />
          </span>
          <span className="truncate">유통가공관리시스템</span>
        </Link>
        <div className="flex items-center gap-2">
          <MobileScopeBadge />
          <Link href="/work-register" aria-label="웹 업무 화면으로 이동" className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <Home className="size-5" />
          </Link>
        </div>
      </header>
      <main className="mx-auto min-h-[calc(100vh-56px)] w-full max-w-md px-4 pb-28 pt-4">
        <MobileScopeInitializer>{children}</MobileScopeInitializer>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/mobile" ? pathname === "/mobile" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors",
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
