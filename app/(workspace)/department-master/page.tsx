"use client";

import { Check, Plus, X } from "lucide-react";
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
  const [isAddOpen, setIsAddOpen] = useState(false);

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
      <PageHeader title="부서마스터" description="부서명, 사용여부, 정렬순서를 관리하고 화주/사용자 수를 확인합니다." action={
          <CloudButton onClick={() => setIsAddOpen(true)}>
            <Plus className="size-4" />
            부서 추가
          </CloudButton>
        } />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{isLoading ? "부서마스터를 불러오는 중입니다." : "Supabase 부서 기준으로 목록을 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button
              type="button"
              onClick={() => void loadDepartments()}
              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
      <CuteCard className="border-0 bg-transparent p-0 shadow-none">
        <DataTable
          headers={["정렬", "부서명", "화주 수", "사용자 수", "사용여부"]}
          rows={departments.map((department) => [
            department.sort_order,
            <span key="name" className="font-medium text-foreground">{department.name}</span>,
            shipperCounts[department.id] ?? 0,
            userCounts[department.id] ?? 0,
            department.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
      {isAddOpen && (
        <AddDepartmentModal
          onClose={() => setIsAddOpen(false)}
          onCreated={(department) => {
            setIsAddOpen(false);
            toast.success(`${department.name} 부서를 추가했습니다.`);
            void loadDepartments();
          }}
        />
      )}
    </>
  );
}

function AddDepartmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (department: Department) => void }) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("부서명을 입력해주세요.");
      return;
    }
    // 정렬순서를 비우면 서버가 마지막 순서 다음 번호로 지정한다.
    const sortValue = sortOrder.trim() === "" ? undefined : Number(sortOrder);
    if (sortValue !== undefined && (!Number.isInteger(sortValue) || sortValue < 0 || sortValue > 9999)) {
      setError("정렬순서는 0 이상 9999 이하의 정수로 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/department-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, sortOrder: sortValue, isActive })
      });
      const data = (await response.json()) as { department?: Department; error?: string };
      if (!response.ok || !data.department) throw new Error(data.error ?? "부서 추가에 실패했습니다.");
      onCreated(data.department);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "부서 추가에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div role="dialog" aria-modal="true" aria-label="부서 추가" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">부서마스터</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">부서 추가</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="부서 추가 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">부서명 (필수)</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              autoFocus
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="예: 풀필먼트 2팀"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">정렬순서</span>
            <input
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              inputMode="numeric"
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="비우면 마지막 순서로 자동 지정"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-primary" />
            사용
          </label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit" className="min-w-24" disabled={isSaving}>
              <Check className="size-4" />
              {isSaving ? "저장 중..." : "저장"}
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}
