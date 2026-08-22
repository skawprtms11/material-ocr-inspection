"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadDepartments = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/department-master");
      const data = (await response.json()) as {
        source: "supabase" | "mock";
        warning?: string;
        error?: string;
        departments: Department[];
        shipperCounts: Record<string, number>;
        userCounts: Record<string, number>;
      };
      if (!response.ok) throw new Error(data.error ?? "부서마스터 조회에 실패했습니다.");
      setDepartments(data.departments);
      setShipperCounts(data.shipperCounts);
      setUserCounts(data.userCounts);
      setDataSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "부서마스터 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  return (
    <>
      <PageHeader title="부서마스터" description="부서명, 사용여부, 정렬순서를 관리하고 화주/사용자 수를 확인합니다." action={<CloudButton><Plus className="size-4" />부서 추가</CloudButton>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "부서마스터를 불러오는 중이에요." : "Supabase 부서 기준으로 목록을 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 ring-1 ${loadError ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button
              type="button"
              onClick={() => void loadDepartments()}
              className="rounded-full bg-rose-100 px-3 py-1 text-rose-800"
            >
              다시 시도
            </button>
          )}
        </div>
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
