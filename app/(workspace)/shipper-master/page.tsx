"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, UserRound, X } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import type { AppUser, Shipper } from "@/lib/types/domain";

export default function ShipperMasterPage() {
  const { departmentId } = useFilterStore();
  const [shipperRows, setShipperRows] = useState<Shipper[]>([]);
  const [editingShipper, setEditingShipper] = useState<Shipper | null>(null);
  const users = appRepository.listUsers();

  useEffect(() => {
    setShipperRows(appRepository.listShippers({ departmentId }));
  }, [departmentId]);

  const workerCandidates = useMemo(
    () =>
      users.filter(
        (user) =>
          user.is_active &&
          (!departmentId || user.department_ids.includes(departmentId)) &&
          (user.role === "worker" || user.role === "manager" || user.role === "admin")
      ),
    [departmentId, users]
  );

  const userNameById = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  const updateCrewLeaders = (shipperId: string, crewLeaderIds: string[]) => {
    setShipperRows((current) =>
      current.map((shipper) => (shipper.id === shipperId ? { ...shipper, crew_leader_ids: crewLeaderIds } : shipper))
    );
    setEditingShipper(null);
  };

  if (!departmentId) {
    return <EmptyCloudState title="화주가 소속될 부서를 먼저 골라주세요." description="화주는 반드시 부서에 소속되어야 해요." />;
  }

  return (
    <>
      <PageHeader
        title="화주마스터"
        description="선택된 부서에 소속된 화주와 현장 담당자를 관리합니다."
        action={
          <CloudButton>
            <Plus className="size-4" />
            화주 추가
          </CloudButton>
        }
      />

      <CuteCard>
        <DataTable
          headers={["화주코드", "화주명", "작업반장", "작업조장", "사용여부"]}
          rows={shipperRows.map((shipper) => {
            const crewLeaderNames = shipper.crew_leader_ids.map((id) => userNameById.get(id)).filter(Boolean);

            return [
              <span key="code" className="font-black text-sky-700">
                {shipper.code}
              </span>,
              <span key="name" className="font-black text-slate-800">
                {shipper.name}
              </span>,
              <span key="foreman" className="font-bold text-slate-700">
                {shipper.foreman_name || "-"}
              </span>,
              <button
                key="crew"
                type="button"
                onClick={() => setEditingShipper(shipper)}
                className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-100"
                title={crewLeaderNames.length > 0 ? crewLeaderNames.join(", ") : "작업조장 등록"}
              >
                <UserRound className="size-3.5" />
                {crewLeaderNames.length}명
              </button>,
              <span
                key="active"
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  shipper.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
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
    </>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-violet-600">작업조장 등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{shipper.name}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              여러 작업자를 작업조장으로 선택할 수 있습니다. 표에는 선택된 인원이 명수로 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="작업조장 등록 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-hidden rounded-[1.2rem] border border-white/80 bg-white/75">
          <table className="w-full text-left text-sm">
            <thead className="bg-violet-50/80 text-xs font-black text-violet-700">
              <tr>
                <th className="px-4 py-3">선택</th>
                <th className="px-4 py-3">작업자명</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">역할</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isSelected = selectedIds.includes(user.id);

                return (
                  <tr key={user.id} className="text-slate-600">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        aria-pressed={isSelected}
                        className={`inline-flex size-8 items-center justify-center rounded-full text-xs font-black ring-1 transition ${
                          isSelected
                            ? "bg-violet-500 text-white ring-violet-500"
                            : "bg-white text-slate-400 ring-slate-200 hover:bg-violet-50 hover:text-violet-600"
                        }`}
                      >
                        {isSelected && <Check className="size-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-black text-slate-800">{user.name}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3 uppercase">{user.role}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    선택 가능한 작업자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" onClick={() => onSave(selectedIds)}>
            <Check className="size-4" />
            저장
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
