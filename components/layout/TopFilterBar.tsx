"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFilterStore } from "@/lib/state/filter-store";
import { roleLabels } from "@/lib/constants/status";
import type { AppUser, Department, Shipper } from "@/lib/types/domain";

type FilterOptionsResponse = {
  source: "supabase" | "mock";
  users: AppUser[];
  departments: Department[];
  shippers: Shipper[];
};

export function TopFilterBar() {
  const { departmentId, shipperId, setDepartmentId, setShipperId } = useFilterStore();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadFilterOptions() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/users");
        if (!response.ok) throw new Error("필터 권한 정보를 불러오지 못했습니다.");
        const data = (await response.json()) as FilterOptionsResponse;
        const user =
          data.users.find((item) => item.email === "admin@example.com") ??
          data.users.find((item) => item.role === "admin") ??
          data.users[0] ??
          null;

        if (!isMounted) return;
        setCurrentUser(user);
        setDepartments(data.departments);
        setShippers(data.shippers);
      } catch {
        if (!isMounted) return;
        setCurrentUser(null);
        setDepartments([]);
        setShippers([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadFilterOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  const allowedDepartments = useMemo(() => {
    if (!currentUser) return departments.filter((department) => department.is_active);
    const allowed = new Set(currentUser.department_ids);
    const scoped = departments.filter((department) => department.is_active && (allowed.size === 0 || allowed.has(department.id)));
    return scoped.length > 0 ? scoped : departments.filter((department) => department.is_active);
  }, [currentUser, departments]);

  const allowedShippers = useMemo(() => {
    if (!departmentId) return [];
    const allowed = new Set(currentUser?.shipper_ids ?? []);
    return shippers.filter(
      (shipper) =>
        shipper.is_active &&
        shipper.department_id === departmentId &&
        (allowed.size === 0 || allowed.has(shipper.id))
    );
  }, [currentUser, departmentId, shippers]);

  useEffect(() => {
    if (isLoading || allowedDepartments.length === 0) return;
    if (!departmentId || !allowedDepartments.some((department) => department.id === departmentId)) {
      setDepartmentId(allowedDepartments[0].id);
    }
  }, [allowedDepartments, departmentId, isLoading, setDepartmentId]);

  useEffect(() => {
    if (isLoading || !departmentId) return;
    if (allowedShippers.length === 0) {
      if (shipperId) setShipperId("");
      return;
    }
    if (!shipperId || !allowedShippers.some((shipper) => shipper.id === shipperId)) {
      setShipperId(allowedShippers[0].id);
    }
  }, [allowedShippers, departmentId, isLoading, setShipperId, shipperId]);

  const user = currentUser ?? {
    name: isLoading ? "불러오는 중" : "사용자",
    role: "viewer" as const
  };

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
              {allowedDepartments.map((department) => (
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
              {allowedShippers.map((shipper) => (
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
