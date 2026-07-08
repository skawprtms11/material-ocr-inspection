"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");

  useEffect(() => {
    async function loadUsers() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/users");
        if (!response.ok) throw new Error("사용자관리 조회에 실패했습니다.");
        const data = (await response.json()) as {
          source: "supabase" | "mock";
          warning?: string;
          users: AppUser[];
          departments: Department[];
          shippers: Shipper[];
        };
        setUsers(data.users);
        setDepartments(data.departments);
        setShippers(data.shippers);
        setDataSource(data.source);
        if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "사용자관리 조회에 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadUsers();
  }, []);

  return (
    <>
      <PageHeader title="사용자관리" description="역할과 부서/화주 접근 권한을 관리합니다. 우측 상단 필터 목록은 이 권한 기준으로 제한됩니다." action={<CloudButton><Plus className="size-4" />사용자 추가</CloudButton>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "사용자 정보를 불러오는 중이에요." : "Supabase 사용자/권한 기준으로 목록을 조회합니다."}</span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
          데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
        </span>
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
