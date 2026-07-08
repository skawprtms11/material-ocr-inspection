"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import type { Department } from "@/lib/types/domain";

export default function DepartmentMasterPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shipperCounts, setShipperCounts] = useState<Record<string, number>>({});
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");

  useEffect(() => {
    async function loadDepartments() {
      setIsLoading(true);

      try {
        const response = await fetch("/api/department-master");
        if (!response.ok) throw new Error("부서마스터 조회에 실패했습니다.");
        const data = (await response.json()) as {
          source: "supabase" | "mock";
          warning?: string;
          departments: Department[];
          shipperCounts: Record<string, number>;
          userCounts: Record<string, number>;
        };
        setDepartments(data.departments);
        setShipperCounts(data.shipperCounts);
        setUserCounts(data.userCounts);
        setDataSource(data.source);
        if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "부서마스터 조회에 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadDepartments();
  }, []);

  return (
    <>
      <PageHeader title="부서마스터" description="부서명, 사용여부, 정렬순서를 관리하고 화주/사용자 수를 확인합니다." action={<CloudButton><Plus className="size-4" />부서 추가</CloudButton>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "부서마스터를 불러오는 중이에요." : "Supabase 부서 기준으로 목록을 조회합니다."}</span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
          데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
        </span>
      </div>
      <CuteCard>
        <DataTable
          headers={["정렬", "부서명", "화주 수", "사용자 수", "사용여부"]}
          rows={departments.map((department) => [
            department.sort_order,
            <span key="name" className="font-black text-slate-800">{department.name}</span>,
            shipperCounts[department.id] ?? 0,
            userCounts[department.id] ?? 0,
            department.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
    </>
  );
}
