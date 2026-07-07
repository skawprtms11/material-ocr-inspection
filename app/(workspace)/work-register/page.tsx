"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Save, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import type { AppUser, Work } from "@/lib/types/domain";
import { formatDate } from "@/lib/utils/format";

type PendingAssignmentWork = {
  id: string;
  registeredAt: string;
  workMasterId: string;
  workType: string;
  documentNo: string;
  finishedProductCode: string;
  finishedProductName: string;
  quantity: number;
  dueDate: string;
  memo: string;
};

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function makePendingWorkFromWork(work: Work, index: number): PendingAssignmentWork {
  const workMaster = appRepository
    .listWorkMasters({ departmentId: work.department_id, shipperId: work.shipper_id })
    .find((item) => item.id === work.work_master_id);

  return {
    id: work.id,
    registeredAt: work.work_date,
    workMasterId: work.work_master_id,
    workType: workTypeOptions[index % workTypeOptions.length],
    documentNo: work.document_no,
    finishedProductCode: workMaster?.code ?? "-",
    finishedProductName: workMaster?.name ?? "-",
    quantity: 80 + index * 25,
    dueDate: addDays(work.work_date, 2 + index),
    memo: work.memo
  };
}

export default function WorkRegisterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const scopedWorks = useMemo(() => appRepository.listWorks({ departmentId, shipperId }), [departmentId, shipperId]);
  const workMasters = useMemo(() => appRepository.listWorkMasters({ departmentId, shipperId }), [departmentId, shipperId]);
  const assignableUsers = useMemo(
    () => appRepository.listUsers().filter((user) => user.is_active && user.role !== "viewer"),
    []
  );
  const [pendingWorks, setPendingWorks] = useState<PendingAssignmentWork[]>([]);
  const [assignTarget, setAssignTarget] = useState<PendingAssignmentWork | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  useEffect(() => {
    setPendingWorks(scopedWorks.filter((work) => work.status !== "completed").map(makePendingWorkFromWork));
    setAssignTarget(null);
    setIsRegisterOpen(false);
  }, [scopedWorks]);

  if (!departmentId || !shipperId) {
    return <EmptyCloudState />;
  }

  const handleRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const workMasterId = String(formData.get("workMasterId") ?? "");
    const workMaster = workMasters.find((item) => item.id === workMasterId);
    const registeredAt = new Date().toISOString().slice(0, 10);
    const workType = String(formData.get("workType") ?? "");
    const documentNo = String(formData.get("documentNo") ?? "").trim();

    if (!workMaster || !workType || !documentNo) {
      toast.error("작업구분, 문서번호, 완성품코드를 확인해주세요.");
      return;
    }

    const newPendingWork: PendingAssignmentWork = {
      id: `pending-${Date.now()}`,
      registeredAt,
      workMasterId,
      workType,
      documentNo,
      finishedProductCode: workMaster.code,
      finishedProductName: workMaster.name,
      quantity: Number(formData.get("quantity") || 0),
      dueDate: String(formData.get("dueDate") || addDays(registeredAt, 2)),
      memo: String(formData.get("memo") ?? "").trim()
    };

    setPendingWorks((current) => [newPendingWork, ...current]);
    setIsRegisterOpen(false);
    toast.success("작업이 할당대기 목록에 등록되었습니다.");
  };

  const handleAssign = (workId: string, assignee: AppUser) => {
    setPendingWorks((current) => current.filter((work) => work.id !== workId));
    setAssignTarget(null);
    toast.success(`${assignee.name} 담당자로 할당되어 할당대기 목록에서 제외되었습니다.`);
  };

  return (
    <>
      <PageHeader
        title="작업등록"
        description="작업을 등록하면 할당대기 목록에 표시되고, 담당자 할당 시 목록에서 제외됩니다."
        action={
          <CloudButton type="button" onClick={() => setIsRegisterOpen(true)}>
            <Plus className="size-4" />
            작업 등록
          </CloudButton>
        }
      />

      <div className="space-y-5">
        <CuteCard className="p-0">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-800">할당 대기중인 작업 목록</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">담당자 할당 전 작업만 표시됩니다.</p>
            </div>
            <span className="w-fit rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
              {pendingWorks.length}건 대기
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-left text-sm">
              <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
                <tr>
                  {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "작업수량", "완료요청일", "비고", "작업할당"].map((header) => (
                    <th key={header} className="px-4 py-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/70">
                {pendingWorks.map((work) => (
                  <tr key={work.id} className="text-slate-600 transition hover:bg-sky-50/70">
                    <td className="px-4 py-3 font-bold">{formatDate(work.registeredAt)}</td>
                    <td className="px-4 py-3">
                      <span className="font-black text-slate-800">{work.workType}</span>
                    </td>
                    <td className="px-4 py-3 font-black text-sky-700">{work.documentNo}</td>
                    <td className="px-4 py-3 font-bold">{work.finishedProductCode}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{work.finishedProductName}</td>
                    <td className="px-4 py-3 font-bold">{work.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold">{formatDate(work.dueDate)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-500">{work.memo || "-"}</td>
                    <td className="px-4 py-3">
                      <CloudButton type="button" tone="soft" onClick={() => setAssignTarget(work)}>
                        <UserPlus className="size-4" />
                        할당
                      </CloudButton>
                    </td>
                  </tr>
                ))}
                {pendingWorks.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                      할당 대기중인 작업이 없습니다. 상단의 작업 등록 버튼으로 새 작업을 등록해주세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CuteCard>

      </div>

      {isRegisterOpen && (
        <WorkRegisterModal
          workMasters={workMasters}
          onClose={() => setIsRegisterOpen(false)}
          onRegister={handleRegister}
        />
      )}

      {assignTarget && (
        <AssignmentModal
          work={assignTarget}
          users={assignableUsers}
          onClose={() => setAssignTarget(null)}
          onAssign={handleAssign}
        />
      )}
    </>
  );
}

function WorkRegisterModal({
  workMasters,
  onClose,
  onRegister
}: {
  workMasters: ReturnType<typeof appRepository.listWorkMasters>;
  onClose: () => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [selectedWorkMasterId, setSelectedWorkMasterId] = useState(workMasters[0]?.id ?? "");
  const selectedWorkMaster = workMasters.find((workMaster) => workMaster.id === selectedWorkMasterId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">작업등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">새 작업 등록</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              저장하면 할당대기 목록에 추가됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="작업등록 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>
        <form className="grid gap-4 lg:grid-cols-3" onSubmit={onRegister}>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">작업구분</span>
            <select
              name="workType"
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
              required
            >
              {workTypeOptions.map((workType) => (
                <option key={workType} value={workType}>
                  {workType}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">문서번호</span>
            <input
              name="documentNo"
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="DOC-2026-0000"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">완성품코드</span>
            <select
              name="workMasterId"
              value={selectedWorkMasterId}
              onChange={(event) => setSelectedWorkMasterId(event.target.value)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
              required
            >
              {workMasters.map((workMaster) => (
                <option key={workMaster.id} value={workMaster.id}>
                  {workMaster.code}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">완성품명</span>
            <input
              value={selectedWorkMaster?.name ?? ""}
              readOnly
              className="h-11 w-full rounded-2xl border border-sky-100 bg-sky-50 px-3 text-sm font-bold text-slate-700 outline-none"
              aria-label="완성품명"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">작업수량</span>
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={100}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">완료요청일</span>
            <input
              name="dueDate"
              type="date"
              defaultValue={addDays(new Date().toISOString().slice(0, 10), 2)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <label className="block lg:col-span-3">
            <span className="mb-1 block text-xs font-black text-slate-500">비고</span>
            <textarea
              name="memo"
              className="min-h-24 w-full rounded-2xl border border-sky-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="현장 메모를 남겨요"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 lg:col-span-3">
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit">
              <Save className="size-4" />
              할당대기 목록에 등록
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignmentModal({
  work,
  users,
  onClose,
  onAssign
}: {
  work: PendingAssignmentWork;
  users: AppUser[];
  onClose: () => void;
  onAssign: (workId: string, assignee: AppUser) => void;
}) {
  const [assigneeId, setAssigneeId] = useState(users[0]?.id ?? "");
  const selectedUser = users.find((user) => user.id === assigneeId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) {
      toast.error("담당자를 선택해주세요.");
      return;
    }
    onAssign(work.id, selectedUser);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">작업할당</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{work.documentNo}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">{work.workType} · {work.finishedProductCode}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="할당 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">담당자</span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
              required
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">할당 메모</span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-sky-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="작업자에게 전달할 메모"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit">
              <UserPlus className="size-4" />
              할당완료
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}
