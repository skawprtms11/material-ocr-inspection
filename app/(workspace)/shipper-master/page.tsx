"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import type { AppUser, Shipper } from "@/lib/types/domain";

export default function ShipperMasterPage() {
  const { departmentId } = useFilterStore();
  const [shipperRows, setShipperRows] = useState<Shipper[]>([]);
  const [editingShipper, setEditingShipper] = useState<Shipper | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const loadShippers = useCallback(async () => {
    if (!departmentId) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/shipper-master?${new URLSearchParams({ department_id: departmentId }).toString()}`);
      const data = (await response.json()) as {
        source: "supabase" | "mock";
        warning?: string;
        error?: string;
        shippers: Shipper[];
        users: AppUser[];
      };
      if (!response.ok) throw new Error(data.error ?? "화주마스터 조회에 실패했습니다.");
      setShipperRows(data.shippers);
      setUsers(data.users);
      setEditingShipper(null);
      setDataSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "화주마스터 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void loadShippers();
  }, [loadShippers]);

  const workerCandidates = useMemo(
    () =>
      users.filter(
        (user) =>
          user.is_active &&
          (dataSource === "supabase" || !departmentId || user.department_ids.includes(departmentId)) &&
          (user.role === "worker" || user.role === "manager" || user.role === "admin")
      ),
    [dataSource, departmentId, users]
  );

  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  const updateCrewLeaders = async (shipperId: string, crewLeaderIds: string[]) => {
    try {
      const response = await fetch("/api/shipper-master", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, crewLeaderIds })
      });
      const result = (await response.json()) as { source?: "supabase" | "mock"; error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업조장 저장에 실패했습니다.");

      setShipperRows((current) =>
        current.map((shipper) => (shipper.id === shipperId ? { ...shipper, crew_leader_ids: crewLeaderIds } : shipper))
      );
      setDataSource(result.source ?? dataSource);
      setEditingShipper(null);
      toast.success("작업조장이 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업조장 저장에 실패했습니다.");
    }
  };

  if (!departmentId) {
    return <EmptyCloudState title="부서를 먼저 선택하세요." description="화주는 부서 단위로 관리됩니다." />;
  }

  return (
    <>
      <PageHeader
        title="화주마스터"
        description="선택된 부서에 소속된 화주와 현장 담당자를 관리합니다."
        action={
          <CloudButton onClick={() => setIsAddOpen(true)}>
            <Plus className="size-4" />
            화주 추가
          </CloudButton>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{isLoading ? "화주마스터를 불러오는 중입니다." : "선택된 부서 기준으로 화주를 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadShippers()} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
              다시 시도
            </button>
          )}
        </div>
      </div>

      <CuteCard className="border-0 bg-transparent p-0 shadow-none">
        <DataTable
          headers={["화주코드", "화주명", "작업반장", "작업조장", "사용여부"]}
          rows={shipperRows.map((shipper) => {
            const crewLeaderNames = shipper.crew_leader_ids.map((id) => userNameById.get(id)).filter(Boolean);

            return [
              <span key="code" className="font-medium text-foreground">
                {shipper.code}
              </span>,
              <span key="name" className="font-medium text-foreground">
                {shipper.name}
              </span>,
              <span key="foreman" className="font-medium text-foreground">
                {shipper.foreman_name || "-"}
              </span>,
              <button
                key="crew"
                type="button"
                onClick={() => setEditingShipper(shipper)}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                title={crewLeaderNames.length > 0 ? crewLeaderNames.join(", ") : "작업조장 등록"}
              >
                <UserRound className="size-3.5" />
                {crewLeaderNames.length}명
              </button>,
              <span
                key="active"
                className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                  shipper.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-700 ring-slate-500/20"
                }`}
              >
                {shipper.is_active ? "사용" : "중지"}
              </span>
            ];
          })}
        />
      </CuteCard>

      {editingShipper && (
        <CrewLeaderModal
          shipper={editingShipper}
          users={workerCandidates}
          onClose={() => setEditingShipper(null)}
          onSave={(crewLeaderIds) => updateCrewLeaders(editingShipper.id, crewLeaderIds)}
        />
      )}

      {isAddOpen && (
        <AddShipperModal
          departmentId={departmentId}
          onClose={() => setIsAddOpen(false)}
          onCreated={(shipper) => {
            setIsAddOpen(false);
            toast.success(`${shipper.name} 화주를 추가했습니다.`);
            void loadShippers();
          }}
        />
      )}
    </>
  );
}

function AddShipperModal({
  departmentId,
  onClose,
  onCreated
}: {
  departmentId: string;
  onClose: () => void;
  onCreated: (shipper: Shipper) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [foremanName, setForemanName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(trimmedCode)) {
      setError("화주코드는 영문·숫자·-·_ 조합 30자 이하로 입력해주세요.");
      return;
    }
    if (!trimmedName) {
      setError("화주명을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/shipper-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, code: trimmedCode, name: trimmedName, foremanName: foremanName.trim(), isActive })
      });
      const data = (await response.json()) as { shipper?: Shipper; error?: string };
      if (!response.ok || !data.shipper) throw new Error(data.error ?? "화주 추가에 실패했습니다.");
      onCreated(data.shipper);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "화주 추가에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div role="dialog" aria-modal="true" aria-label="화주 추가" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">화주마스터</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">화주 추가</h2>
            <p className="mt-1 text-sm text-muted-foreground">현재 선택된 부서에 소속된 화주로 등록됩니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="화주 추가 팝업 닫기"
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
            <span className="mb-1 block text-sm font-medium text-foreground">화주코드 (필수)</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={30} autoFocus className={inputClass} placeholder="예: SHP-AB" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">화주명 (필수)</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} className={inputClass} placeholder="예: 민트하우스" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">작업반장</span>
            <input value={foremanName} onChange={(event) => setForemanName(event.target.value)} maxLength={50} className={inputClass} placeholder="선택 입력" />
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

function CrewLeaderModal({
  shipper,
  users,
  onClose,
  onSave
}: {
  shipper: Shipper;
  users: AppUser[];
  onClose: () => void;
  onSave: (crewLeaderIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(shipper.crew_leader_ids);

  const toggleUser = (userId: string) => {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">작업조장 등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{shipper.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              여러 작업자를 작업조장으로 선택할 수 있습니다. 표에는 선택된 인원이 명수로 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="작업조장 등록 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="h-10 px-4">선택</th>
                <th className="h-10 px-4">작업자명</th>
                <th className="h-10 px-4">이메일</th>
                <th className="h-10 px-4">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isSelected = selectedIds.includes(user.id);

                return (
                  <tr key={user.id} className="text-foreground">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        aria-pressed={isSelected}
                        className={`inline-flex size-8 items-center justify-center rounded-full text-xs font-medium ring-1 transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground ring-primary"
                            : "bg-card text-muted-foreground ring-input hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {isSelected && <Check className="size-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{user.name}</td>
                    <td className="px-4 py-2.5">{user.email}</td>
                    <td className="px-4 py-2.5 uppercase">{user.role}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                    선택 가능한 작업자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" className="min-w-24" onClick={() => onSave(selectedIds)}>
            <Check className="size-4" />
            저장
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
