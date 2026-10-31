"use client";

import { Check, KeyRound, Plus, X } from "lucide-react";
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
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{isLoading ? "사용자 정보를 불러오는 중입니다." : "Supabase 사용자/권한 기준으로 목록을 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadUsers()} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
              다시 시도
            </button>
          )}
        </div>
      </div>
      <CuteCard className="border-0 bg-transparent p-0 shadow-none">
        <DataTable
          headers={["이름", "이메일", "역할", "부서 권한", "화주 권한", "사용여부", "권한 편집"]}
          rows={users.map((user) => [
            <span key="name" className="font-medium text-foreground">{user.name}</span>,
            user.email,
            roleLabels[user.role],
            departments.filter((department) => user.department_ids.includes(department.id)).map((department) => department.name).join(", "),
            shippers.filter((shipper) => user.shipper_ids.includes(shipper.id)).map((shipper) => shipper.name).join(", "),
            user.is_active ? "사용" : "중지",
            <button
              key="permissions"
              type="button"
              onClick={() => setEditingUser(user)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <KeyRound className="size-3.5" />
              편집
            </button>
          ])}
        />
      </CuteCard>

      {editingUser && (
        <PermissionModal
          user={editingUser}
          departments={departments}
          shippers={shippers}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            toast.success(`${editingUser.name} 권한을 저장했습니다. 상단 필터 목록은 새로고침 후 반영됩니다.`);
            void loadUsers();
          }}
        />
      )}
    </>
  );
}

function PermissionModal({
  user,
  departments,
  shippers,
  onClose,
  onSaved
}: {
  user: AppUser;
  departments: Department[];
  shippers: Shipper[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [departmentIds, setDepartmentIds] = useState<string[]>(user.department_ids);
  const [shipperIds, setShipperIds] = useState<string[]>(user.shipper_ids);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // 부서 권한을 빼면 그 부서 소속 화주 권한도 함께 뺀다(서버도 부서 밖 화주 권한은 거부한다).
  const toggleDepartment = (departmentId: string) => {
    if (departmentIds.includes(departmentId)) {
      setDepartmentIds((current) => current.filter((id) => id !== departmentId));
      const childIds = new Set(shippers.filter((shipper) => shipper.department_id === departmentId).map((shipper) => shipper.id));
      setShipperIds((current) => current.filter((id) => !childIds.has(id)));
    } else {
      setDepartmentIds((current) => [...current, departmentId]);
    }
  };

  const toggleShipper = (shipperId: string) => {
    setShipperIds((current) => (current.includes(shipperId) ? current.filter((id) => id !== shipperId) : [...current, shipperId]));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, departmentIds, shipperIds })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "권한 저장에 실패했습니다.");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "권한 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const checkboxClass = (checked: boolean, tone: "sky" | "violet") =>
    `inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
      checked
        ? tone === "sky"
          ? "bg-primary text-primary-foreground ring-primary"
          : "bg-violet-500 text-white ring-violet-500"
        : "bg-card text-transparent ring-input"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div role="dialog" aria-modal="true" aria-label="권한 편집" className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">권한 편집</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{user.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              부서를 선택한 뒤 그 부서 소속 화주를 선택하세요. 부서 권한을 빼면 소속 화주 권한도 함께 빠집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="권한 편집 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {departments.map((department) => {
            const departmentChecked = departmentIds.includes(department.id);
            const childShippers = shippers.filter((shipper) => shipper.department_id === department.id);

            return (
              <div key={department.id} className="rounded-lg border border-border bg-card p-3">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={departmentChecked}
                  onClick={() => toggleDepartment(department.id)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className={checkboxClass(departmentChecked, "sky")}>
                    <Check className="size-3.5" />
                  </span>
                  <span className="font-medium text-foreground">{department.name}</span>
                  {!department.is_active && <span className="text-xs font-medium text-muted-foreground">(중지)</span>}
                </button>
                {childShippers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2 pl-9">
                    {childShippers.map((shipper) => {
                      const shipperChecked = shipperIds.includes(shipper.id);
                      return (
                        <button
                          key={shipper.id}
                          type="button"
                          role="checkbox"
                          aria-checked={shipperChecked}
                          disabled={!departmentChecked}
                          onClick={() => toggleShipper(shipper.id)}
                          className="inline-flex items-center gap-2 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-input transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className={checkboxClass(shipperChecked, "violet")}>
                            <Check className="size-3" />
                          </span>
                          {shipper.name}
                          {!shipper.is_active && <span className="text-muted-foreground">(중지)</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 pl-9 text-xs font-medium text-muted-foreground">소속 화주가 없습니다.</p>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" className="min-w-24" disabled={isSaving} onClick={() => void handleSave()}>
            <Check className="size-4" />
            {isSaving ? "저장 중..." : "저장"}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
