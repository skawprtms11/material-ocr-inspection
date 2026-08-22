"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Building2, Camera, Settings, UserRound } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { useFilterStore } from "@/lib/state/filter-store";
import { saveMobileScope } from "@/lib/mobile/mobile-scope-storage";
import type { AppUser, Department, Shipper } from "@/lib/types/domain";

type UsersResponse = {
  source: "supabase" | "mock";
  warning?: string;
  users: AppUser[];
  departments: Department[];
  shippers: Shipper[];
};

function pickCurrentUser(users: AppUser[]) {
  return users.find((user) => user.email === "admin@example.com") ?? users.find((user) => user.role === "admin") ?? users[0] ?? null;
}

export default function MobileSettingsPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [source, setSource] = useState<UsersResponse["source"]>("mock");
  const [warning, setWarning] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const departmentId = useFilterStore((state) => state.departmentId);
  const shipperId = useFilterStore((state) => state.shipperId);
  const setScope = useFilterStore((state) => state.setScope);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setIsLoading(true);
      setWarning("");

      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const payload = (await response.json()) as UsersResponse;
        if (!response.ok) throw new Error(payload.warning ?? "사용자 정보를 불러오지 못했습니다.");
        if (!isMounted) return;

        setUser(pickCurrentUser(payload.users));
        setDepartments(payload.departments ?? []);
        setShippers(payload.shippers ?? []);
        setSource(payload.source);
        setWarning(payload.warning ?? "");
      } catch (error) {
        if (!isMounted) return;
        setUser(null);
        setDepartments([]);
        setShippers([]);
        setSource("mock");
        setWarning(error instanceof Error ? error.message : "사용자 정보를 불러오지 못했습니다.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const allowedDepartments = useMemo(() => {
    const departmentPermissionIds = new Set(user?.department_ids ?? []);
    return departments.filter(
      (department) => department.is_active && (departmentPermissionIds.size === 0 || departmentPermissionIds.has(department.id))
    );
  }, [departments, user]);

  const allowedShippersOf = useMemo(() => {
    const shipperPermissionIds = new Set(user?.shipper_ids ?? []);
    return (targetDepartmentId: string) =>
      shippers.filter(
        (shipper) =>
          shipper.is_active &&
          shipper.department_id === targetDepartmentId &&
          (shipperPermissionIds.size === 0 || shipperPermissionIds.has(shipper.id))
      );
  }, [shippers, user]);

  const allowedShippers = useMemo(() => allowedShippersOf(departmentId), [allowedShippersOf, departmentId]);

  function handleDepartmentChange(nextDepartmentId: string) {
    const nextAllowedShippers = allowedShippersOf(nextDepartmentId);
    const nextShipperId = nextAllowedShippers[0]?.id ?? "";

    if (!nextShipperId) {
      toast.error("선택한 부서에 사용 가능한 화주가 없습니다.");
      return;
    }

    setScope({ departmentId: nextDepartmentId, shipperId: nextShipperId });
    saveMobileScope({ departmentId: nextDepartmentId, shipperId: nextShipperId });
    toast.success("적용되었습니다");
  }

  function handleShipperChange(nextShipperId: string) {
    setScope({ departmentId, shipperId: nextShipperId });
    saveMobileScope({ departmentId, shipperId: nextShipperId });
    toast.success("적용되었습니다");
  }

  const displayUser = user ?? {
    name: isLoading ? "불러오는 중" : "사용자",
    email: warning || "사용자 정보 없음"
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">설정</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">모바일 설정</h1>
        <p className="mt-2 text-xs font-black text-slate-400">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
      </CuteCard>

      {warning && (
        <CuteCard className="p-3 text-xs font-bold leading-5 text-amber-700">
          {warning}
        </CuteCard>
      )}

      <CuteCard className="p-4">
        <div className="flex items-center gap-3">
          <UserRound className="size-9 rounded-full bg-sky-100 p-2 text-sky-600" />
          <div>
            <p className="font-black text-slate-800">{displayUser.name}</p>
            <p className="text-xs font-bold text-slate-400">{displayUser.email}</p>
          </div>
        </div>
      </CuteCard>

      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-sky-500" />
          <p className="text-sm font-black text-slate-700">부서/화주 설정</p>
        </div>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">부서</span>
            <select
              value={departmentId}
              onChange={(event) => handleDepartmentChange(event.target.value)}
              disabled={isLoading || allowedDepartments.length === 0}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-50"
            >
              {allowedDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">화주</span>
            <select
              value={shipperId}
              onChange={(event) => handleShipperChange(event.target.value)}
              disabled={isLoading || allowedShippers.length === 0}
              className="h-11 w-full rounded-2xl border border-violet-100 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
            >
              {allowedShippers.map((shipper) => (
                <option key={shipper.id} value={shipper.id}>
                  {shipper.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CuteCard>

      <CuteCard className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
            <span className="flex items-center gap-2">
              <Camera className="size-4 text-sky-500" />
              카메라 권한
            </span>
            <span className="text-xs font-black text-slate-400">브라우저 설정 사용</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
            <span className="flex items-center gap-2">
              <Bell className="size-4 text-violet-500" />
              알림
            </span>
            <span className="text-xs font-black text-slate-400">준비중</span>
          </div>
        </div>
      </CuteCard>
    </div>
  );
}
