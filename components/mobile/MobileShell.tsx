"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Cloud, Home, ListChecks, PackagePlus, Settings } from "lucide-react";
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#e8f7ff_0%,#fff8e8_52%,#f6efff_100%)] text-slate-800">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/70 bg-white/75 px-4 py-3 backdrop-blur">
        <Link href="/mobile" className="flex items-center gap-2 text-sm font-black text-sky-700">
          <Cloud className="size-5" fill="currentColor" />
          모바일 업무
        </Link>
        <Link href="/work-register" aria-label="웹 업무 화면으로 이동" className="rounded-full bg-white p-2 text-slate-500 shadow-sm">
          <Home className="size-5" />
        </Link>
      </header>
      <main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-md px-4 pb-28 pt-5">
        <MobileScopeInitializer>{children}</MobileScopeInitializer>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/80 bg-white/90 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-[0_-12px_40px_rgba(118,139,172,0.18)] backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/mobile" ? pathname === "/mobile" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-black transition",
                  active ? "bg-sky-100 text-sky-700" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
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
