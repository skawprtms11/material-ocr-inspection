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
          headers={["이름", "이메일", "역할", "부서 권한", "화주 권한", "사용여부", "권한 편집"]}
          rows={users.map((user) => [
            <span key="name" className="font-black text-slate-800">{user.name}</span>,
            user.email,
            roleLabels[user.role],
            departments.filter((department) => user.department_ids.includes(department.id)).map((department) => department.name).join(", "),
            shippers.filter((shipper) => user.shipper_ids.includes(shipper.id)).map((shipper) => shipper.name).join(", "),
            user.is_active ? "사용" : "중지",
            <button
              key="permissions"
              type="button"
              onClick={() => setEditingUser(user)}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700 shadow-sm ring-1 ring-sky-100 transition hover:bg-sky-100"
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
    `inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-1 transition ${
      checked
        ? tone === "sky"
          ? "bg-sky-500 text-white ring-sky-500"
          : "bg-violet-500 text-white ring-violet-500"
        : "bg-white text-transparent ring-slate-200"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="권한 편집" className="w-full max-w-2xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">권한 편집</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{user.name}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              부서를 선택한 뒤 그 부서 소속 화주를 선택하세요. 부서 권한을 빼면 소속 화주 권한도 함께 빠집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="권한 편집 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {departments.map((department) => {
            const departmentChecked = departmentIds.includes(department.id);
            const childShippers = shippers.filter((shipper) => shipper.department_id === department.id);

            return (
              <div key={department.id} className="rounded-[1.2rem] border border-white/80 bg-white/75 p-3">
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
                  <span className="font-black text-slate-800">{department.name}</span>
                  {!department.is_active && <span className="text-xs font-black text-slate-400">(중지)</span>}
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
                          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className={checkboxClass(shipperChecked, "violet")}>
                            <Check className="size-3" />
                          </span>
                          {shipper.name}
                          {!shipper.is_active && <span className="text-slate-400">(중지)</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 pl-9 text-xs font-bold text-slate-400">소속 화주가 없습니다.</p>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" disabled={isSaving} onClick={() => void handleSave()}>
            <Check className="size-4" />
            {isSaving ? "저장 중..." : "저장"}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
