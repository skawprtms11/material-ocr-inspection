"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import { roleLabels } from "@/lib/constants/status";

export function TopFilterBar() {
  const { departmentId, shipperId, setDepartmentId, setShipperId } = useFilterStore();
  const user = appRepository.getCurrentUser();
  const departments = appRepository.listAllowedDepartments();
  const shippers = appRepository.listAllowedShippers(departmentId);

  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-[#f8fbff]/78 px-4 py-3 backdrop-blur md:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm font-black text-slate-700">오늘도 폭신하게 정확히 검수해요</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative">
            <span className="sr-only">부서명 필터</span>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-11 min-w-44 appearance-none rounded-full border border-sky-100 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="">부서 선택</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" />
          </label>
          <label className="relative">
            <span className="sr-only">화주명 필터</span>
            <select
              value={shipperId}
              onChange={(event) => setShipperId(event.target.value)}
              disabled={!departmentId}
              className="h-11 min-w-44 appearance-none rounded-full border border-violet-100 bg-white px-4 pr-10 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
            >
              <option value="">화주 선택</option>
              {shippers.map((shipper) => (
                <option key={shipper.id} value={shipper.id}>
                  {shipper.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" />
          </label>
          <div className="flex h-11 items-center gap-3 rounded-full bg-white px-4 shadow-sm ring-1 ring-slate-100">
            <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
              <UserRound className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-black text-slate-700">{user.name}</p>
              <p className="text-[11px] font-bold text-slate-400">{roleLabels[user.role]}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
