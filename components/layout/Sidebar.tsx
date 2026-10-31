"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileText,
  Home,
  LayoutDashboard,
  PackageCheck,
  PackageSearch,
  Truck,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const menuGroups: Record<string, string> = {
  "/work-register": "업무",
  "/work-master": "기준정보",
  "/users": "시스템"
};

const menuItems = [
  { href: "/work-register", label: "작업등록", icon: ClipboardList },
  { href: "/work-inspection", label: "작업검수", icon: ClipboardCheck },
  { href: "/work-status", label: "작업현황", icon: LayoutDashboard },
  { href: "/work-master", label: "작업마스터", icon: PackageCheck },
  { href: "/material-master", label: "부자재마스터", icon: PackageSearch },
  { href: "/department-master", label: "부서마스터", icon: Factory },
  { href: "/shipper-master", label: "화주마스터", icon: Truck },
  { href: "/document-master", label: "문서마스터", icon: FileText },
  { href: "/users", label: "사용자관리", icon: Users }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:w-20 lg:w-64">
      <Link
        href="/work-register"
        className="flex h-14 shrink-0 items-center justify-center gap-2.5 border-b border-sidebar-border px-3 lg:justify-start lg:px-4"
        aria-label="유통가공관리시스템 홈"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Boxes className="size-4" />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-white">유통가공관리시스템</p>
          <p className="text-[11px] text-sidebar-foreground/70">부자재 검수 · 작업관리</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 p-2 lg:p-3">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (pathname === "/dashboard" && item.href === "/work-register");
          const Icon = item.icon;
          const groupLabel = menuGroups[item.href];

          return (
            <div key={item.href}>
              {groupLabel ? (
                <p className="hidden px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50 first:pt-1 lg:block">
                  {groupLabel}
                </p>
              ) : null}
              <Link
                href={item.href}
                title={item.label}
                className={cn(
                  "flex h-9 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-2 lg:p-3">
        <Link
          href="/mobile"
          title="모바일 검수 바로가기"
          className="flex h-9 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:justify-start lg:px-3"
        >
          <Home className="size-4 shrink-0" />
          <span className="hidden lg:inline">모바일 검수 바로가기</span>
        </Link>
      </div>
    </aside>
  );
}
