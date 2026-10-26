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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="부서 추가" className="w-full max-w-md rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">부서마스터</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">부서 추가</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="부서 추가 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
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
            <span className="mb-1 block text-xs font-black text-slate-500">부서명 (필수)</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              autoFocus
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="예: 풀필먼트 2팀"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">정렬순서</span>
            <input
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              inputMode="numeric"
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="비우면 마지막 순서로 자동 지정"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-black text-slate-600">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="size-4 accent-sky-500" />
            사용
          </label>
          {error && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit" disabled={isSaving}>
              <Check className="size-4" />
              {isSaving ? "저장 중..." : "저장"}
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}
