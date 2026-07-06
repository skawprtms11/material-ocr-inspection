"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  ClipboardList,
  Cloud,
  Factory,
  Home,
  LayoutDashboard,
  PackageCheck,
  PackageSearch,
  Sparkles,
  Truck,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const menuItems = [
  { href: "/work-register", label: "작업등록", icon: ClipboardList },
  { href: "/work-status", label: "작업현황", icon: LayoutDashboard },
  { href: "/work-inspection", label: "작업검수", icon: ClipboardCheck },
  { href: "/work-master", label: "작업마스터", icon: PackageCheck },
  { href: "/material-master", label: "부자재마스터", icon: PackageSearch },
  { href: "/department-master", label: "부서마스터", icon: Factory },
  { href: "/shipper-master", label: "화주마스터", icon: Truck },
  { href: "/users", label: "사용자관리", icon: Users }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-16 shrink-0 flex-col border-r border-white/70 bg-white/75 p-2 backdrop-blur sm:w-20 lg:w-72 lg:p-5">
      <Link
        href="/work-register"
        className="mb-6 flex items-center justify-center gap-3 rounded-[1.2rem] bg-sky-50 p-3 lg:mb-8 lg:justify-start lg:rounded-[1.5rem] lg:p-4"
        aria-label="솜솜 검수실 홈"
      >
        <div className="relative rounded-full bg-white p-3 text-sky-500 shadow-sm">
          <Cloud className="size-7" fill="currentColor" />
          <Sparkles className="absolute -bottom-1 -right-1 size-4 text-amber-400" />
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-black text-slate-800">솜솜 검수실</p>
          <p className="text-xs font-bold text-sky-500">부자재 OCR/Vision</p>
        </div>
      </Link>
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (pathname === "/dashboard" && item.href === "/work-register");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-full px-2 py-3 text-sm font-extrabold text-slate-500 transition lg:justify-start lg:px-4",
                isActive ? "bg-sky-500 text-white shadow-lg shadow-sky-100" : "hover:bg-white hover:text-sky-600"
              )}
            >
              <span className={cn("rounded-full p-1.5", isActive ? "bg-white/18" : "bg-sky-50 text-sky-500")}>
                <Icon className="size-4" />
              </span>
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <Link
        href="/mobile"
        title="모바일 검수 바로가기"
        className="mt-8 flex items-center justify-center gap-3 rounded-[1.2rem] bg-gradient-to-br from-violet-100 to-amber-50 p-3 text-sm font-black text-violet-700 lg:justify-start lg:p-4"
      >
        <Home className="size-5" />
        <span className="hidden lg:inline">모바일 검수 바로가기</span>
      </Link>
    </aside>
  );
}
