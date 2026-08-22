"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { roleLabels } from "@/lib/constants/status";
import type { AppUser, Department, Shipper } from "@/lib/types/domain";

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/users");
      const data = (await response.json()) as {
        source: "supabase" | "mock";
        warning?: string;
        error?: string;
        users: AppUser[];
        departments: Department[];
        shippers: Shipper[];
      };
      if (!response.ok) throw new Error(data.error ?? "사용자관리 조회에 실패했습니다.");
      setUsers(data.users);
      setDepartments(data.departments);
      setShippers(data.shippers);
      setDataSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "사용자관리 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <>
      <PageHeader title="사용자관리" description="역할과 부서/화주 접근 권한을 관리합니다. 우측 상단 필터 목록은 이 권한 기준으로 제한됩니다." action={<CloudButton><Plus className="size-4" />사용자 추가</CloudButton>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "사용자 정보를 불러오는 중이에요." : "Supabase 사용자/권한 기준으로 목록을 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 ring-1 ${loadError ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadUsers()} className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
              다시 시도
            </button>
          )}
        </div>
      </div>
      <CuteCard>
        <DataTable
          headers={["이름", "이메일", "역할", "부서 권한", "화주 권한", "사용여부"]}
          rows={users.map((user) => [
            <span key="name" className="font-black text-slate-800">{user.name}</span>,
            user.email,
            roleLabels[user.role],
            departments.filter((department) => user.department_ids.includes(department.id)).map((department) => department.name).join(", "),
            shippers.filter((shipper) => user.shipper_ids.includes(shipper.id)).map((shipper) => shipper.name).join(", "),
            user.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
    </>
  );
}
