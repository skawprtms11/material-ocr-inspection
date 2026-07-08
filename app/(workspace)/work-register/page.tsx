"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus, Save, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import { assignWorkToInspection } from "@/lib/state/work-flow-store";
import type { AppUser, MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type {
  CreateWorkRegistrationRequest,
  CreateWorkRegistrationResponse,
  PendingAssignmentWorkDto,
  WorkComponentRowDto,
  WorkRegisterDataResponse
} from "@/lib/types/work-register-api";
import type { ProductUsageRowDto, WorkMaterialRowDto } from "@/lib/types/work-master-api";
import { formatDate } from "@/lib/utils/format";

type PendingAssignmentWork = PendingAssignmentWorkDto;

type ComponentKind = "제품" | "부자재";

type ComponentRow = WorkComponentRowDto & {
  kind: ComponentKind;
};

type RegisterPayload = Omit<CreateWorkRegistrationRequest, "departmentId" | "shipperId">;

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

const productTemplates = [
  { code: "PRD-MT-001", name: "민트 완제품 바디", unitQuantity: 1 },
  { code: "PRD-CL-001", name: "클라우드 구성품", unitQuantity: 2 },
  { code: "PRD-SM-001", name: "샘플 구성품", unitQuantity: 1 }
];

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function makeFallbackProductRows(workMasterCode: string, quantity: number): ComponentRow[] {
  const templates = workMasterCode.includes("CL")
    ? productTemplates.slice(1, 3)
    : workMasterCode.includes("LV")
      ? productTemplates.slice(2, 3)
      : productTemplates.slice(0, 2);

  return templates.map((template, index) => ({
    rowId: `product-${template.code}-${index}`,
    groupId: template.code,
    kind: "제품",
    code: template.code,
    name: template.name,
    unitQuantity: template.unitQuantity,
    requiredQuantity: template.unitQuantity * quantity,
    lot: "",
    allocatedQuantity: template.unitQuantity * quantity,
    memo: ""
  }));
}

function makeProductRows(workMaster: WorkMaster, quantity: number, productRowsByWork: Record<string, ProductUsageRowDto[]>): ComponentRow[] {
  const productRows = productRowsByWork[workMaster.id] ?? [];
  if (productRows.length === 0) return makeFallbackProductRows(workMaster.code, quantity);

  return productRows.map((row, index) => ({
    rowId: `product-${row.id}-${index}`,
    groupId: row.productCode,
    kind: "제품",
    code: row.productCode,
    name: row.productName,
    unitQuantity: row.unitQuantity,
    requiredQuantity: row.unitQuantity * quantity,
    lot: "",
    allocatedQuantity: row.unitQuantity * quantity,
    memo: ""
  }));
}

function makeMaterialRows(
  workMasterId: string,
  quantity: number,
  materials: MaterialMaster[],
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>
): ComponentRow[] {
  return (materialRowsByWork[workMasterId] ?? []).map((mapping, index) => {
    const material = materials.find((item) => item.id === mapping.materialId);
    const unitQuantity = mapping.unitQuantity || 1;

    return {
      rowId: `material-${mapping.id}-${index}`,
      groupId: material?.code ?? mapping.materialId,
      kind: "부자재",
      code: material?.code ?? mapping.materialId,
      name: material?.name ?? "-",
      unitQuantity,
      requiredQuantity: unitQuantity * quantity,
      lot: material?.lot ?? "",
      allocatedQuantity: unitQuantity * quantity,
      memo: ""
    };
  });
}

export default function WorkRegisterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const [workMasters, setWorkMasters] = useState<WorkMaster[]>([]);
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AppUser[]>([]);
  const [materialRowsByWork, setMaterialRowsByWork] = useState<Record<string, WorkMaterialRowDto[]>>({});
  const [productRowsByWork, setProductRowsByWork] = useState<Record<string, ProductUsageRowDto[]>>({});
  const [pendingWorks, setPendingWorks] = useState<PendingAssignmentWork[]>([]);
  const [assignTarget, setAssignTarget] = useState<PendingAssignmentWork | null>(null);
  const [detailTarget, setDetailTarget] = useState<PendingAssignmentWork | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");

  const applyData = useCallback((data: WorkRegisterDataResponse) => {
    setPendingWorks(data.pendingWorks);
    setWorkMasters(data.workMasters);
    setMaterials(data.materials);
    setAssignableUsers(data.users);
    setMaterialRowsByWork(data.materialRowsByWork);
    setProductRowsByWork(data.productRowsByWork);
    setDataSource(data.source);
    setAssignTarget(null);
    setDetailTarget(null);
    setIsRegisterOpen(false);
  }, []);

  useEffect(() => {
    if (!departmentId || !shipperId) return;

    const controller = new AbortController();

    async function loadWorkRegister() {
      setIsLoading(true);

      try {
        const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
        const response = await fetch(`/api/work-register?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("작업등록 데이터를 불러오지 못했습니다.");
        const data = (await response.json()) as WorkRegisterDataResponse;
        applyData(data);
        if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error(error instanceof Error ? error.message : "작업등록 데이터를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadWorkRegister();

    return () => controller.abort();
  }, [applyData, departmentId, shipperId]);

  if (!departmentId || !shipperId) {
    return <EmptyCloudState />;
  }

  const handleRegister = async (payload: RegisterPayload) => {
    if (!departmentId || !shipperId) return;

    try {
      const response = await fetch("/api/work-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, departmentId, shipperId } satisfies CreateWorkRegistrationRequest)
      });
      const result = (await response.json()) as CreateWorkRegistrationResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업등록 저장에 실패했습니다.");

      setPendingWorks((current) => [result.work, ...current]);
      setDataSource(result.source);
      setIsRegisterOpen(false);
      toast.success("작업이 DB에 저장되고 할당대기 목록에 등록되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업등록 저장에 실패했습니다.");
    }
  };

  const handleAssign = async (workId: string, assignee: AppUser) => {
    if (!departmentId || !shipperId) return;

    const targetWork = pendingWorks.find((work) => work.id === workId);
    if (!targetWork) return;

    try {
      const response = await fetch(`/api/work-register/${workId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assignee.id, assigneeName: assignee.name })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업 할당 저장에 실패했습니다.");

      assignWorkToInspection(targetWork, assignee, { departmentId, shipperId });
      setPendingWorks((current) => current.filter((work) => work.id !== workId));
      setAssignTarget(null);
      toast.success(`${assignee.name} 담당자로 할당되었습니다. DB에 할당 정보가 저장되었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업 할당 저장에 실패했습니다.");
    }
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
          <span>{isLoading ? "작업등록 데이터를 불러오는 중이에요." : "선택된 부서/화주 기준으로 할당대기 작업을 조회합니다."}</span>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
            데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
          </span>
        </div>

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
            <table className="w-full min-w-[1340px] text-left text-sm">
              <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
                <tr>
                  {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "LOT", "작업수량", "완료요청일", "비고", "작업할당"].map((header) => (
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(work)}
                        className="inline-flex items-center gap-2 font-black text-sky-700 underline-offset-4 transition hover:text-sky-900 hover:underline"
                        aria-label={`${work.documentNo} 상세정보 보기`}
                      >
                        <Eye className="size-4" />
                        {work.documentNo}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-bold">{work.finishedProductCode}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{work.finishedProductName}</td>
                    <td className="px-4 py-3 font-bold text-violet-700">{work.finishedProductLot}</td>
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
                    <td colSpan={10} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
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
          materials={materials}
          materialRowsByWork={materialRowsByWork}
          productRowsByWork={productRowsByWork}
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

      {detailTarget && (
        <WorkDetailModal
          work={detailTarget}
          materials={materials}
          materialRowsByWork={materialRowsByWork}
          productRowsByWork={productRowsByWork}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </>
  );
}

function WorkRegisterModal({
  workMasters,
  materials,
  materialRowsByWork,
  productRowsByWork,
  onClose,
  onRegister
}: {
  workMasters: WorkMaster[];
  materials: MaterialMaster[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  onClose: () => void;
  onRegister: (payload: RegisterPayload) => void;
}) {
  const [selectedWorkMasterId, setSelectedWorkMasterId] = useState(workMasters[0]?.id ?? "");
  const [quantity, setQuantity] = useState(100);
  const [componentRows, setComponentRows] = useState<ComponentRow[]>([]);
  const selectedWorkMaster = workMasters.find((workMaster) => workMaster.id === selectedWorkMasterId);

  useEffect(() => {
    if (!selectedWorkMasterId && workMasters[0]) {
      setSelectedWorkMasterId(workMasters[0].id);
    }
  }, [selectedWorkMasterId, workMasters]);

  useEffect(() => {
    if (!selectedWorkMaster) {
      setComponentRows([]);
      return;
    }

    setComponentRows([
      ...makeProductRows(selectedWorkMaster, quantity, productRowsByWork),
      ...makeMaterialRows(selectedWorkMaster.id, quantity, materials, materialRowsByWork)
    ]);
  }, [materials, materialRowsByWork, productRowsByWork, quantity, selectedWorkMaster]);

  const updateComponentRow = (rowId: string, patch: Partial<ComponentRow>) => {
    setComponentRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const addProductLotSplit = (target: ComponentRow) => {
    setComponentRows((current) => {
      const targetIndex = current.findIndex((row) => row.rowId === target.rowId);
      const nextRow: ComponentRow = {
        ...target,
        rowId: `product-split-${target.groupId}-${Date.now()}`,
        lot: "",
        allocatedQuantity: 0,
        memo: "LOT 분할"
      };

      if (targetIndex < 0) return [...current, nextRow];
      return [...current.slice(0, targetIndex + 1), nextRow, ...current.slice(targetIndex + 1)];
    });
  };

  const removeProductLotSplit = (rowId: string) => {
    setComponentRows((current) => {
      const target = current.find((row) => row.rowId === rowId);
      if (!target) return current;
      const groupRows = current.filter((row) => row.kind === "제품" && row.groupId === target.groupId);
      if (groupRows.length <= 1) return current;
      return current.filter((row) => row.rowId !== rowId);
    });
  };

  const productAllocationErrors = useMemo(() => {
    const errors: string[] = [];
    const productCodes = Array.from(new Set(componentRows.filter((row) => row.kind === "제품").map((row) => row.groupId)));

    productCodes.forEach((code) => {
      const rows = componentRows.filter((row) => row.kind === "제품" && row.groupId === code);
      const requiredQuantity = rows[0]?.requiredQuantity ?? 0;
      const allocatedSum = rows.reduce((sum, row) => sum + Number(row.allocatedQuantity || 0), 0);

      if (allocatedSum !== requiredQuantity) {
        errors.push(`${code} 할당수량 합계 ${allocatedSum.toLocaleString()} / 필요수량 ${requiredQuantity.toLocaleString()}`);
      }
    });

    return errors;
  }, [componentRows]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (productAllocationErrors.length > 0) {
      toast.error(`제품 LOT 분할 수량을 확인해주세요. ${productAllocationErrors[0]}`);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const workMasterId = String(formData.get("workMasterId") ?? "");
    const workType = String(formData.get("workType") ?? "");
    const documentNo = String(formData.get("documentNo") ?? "").trim();
    const finishedProductLot = String(formData.get("finishedProductLot") ?? "").trim();

    if (!workMasterId || !workType || !documentNo || !finishedProductLot) {
      toast.error("작업구분, 문서번호, 완성품코드, 완성품 LOT를 확인해주세요.");
      return;
    }

    onRegister({
      workMasterId,
      workType,
      documentNo,
      finishedProductLot,
      quantity,
      dueDate: String(formData.get("dueDate") || addDays(new Date().toISOString().slice(0, 10), 2)),
      memo: String(formData.get("memo") ?? "").trim(),
      componentRows
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-7xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
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
        <form className="space-y-5" onSubmit={handleSubmit}>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">완성품정보</h3>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">표 입력</span>
            </div>
            <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/75">
              <table className="w-full min-w-[1340px] text-left text-xs">
                <thead className="bg-sky-50/80 font-black text-sky-700">
                  <tr>
                    {["작업구분", "문서번호", "완성품코드", "완성품명", "LOT", "작업수량", "완료요청일", "비고"].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-600">
                    <td className="px-3 py-3">
                      <select
                        name="workType"
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                        required
                      >
                        {workTypeOptions.map((workType) => (
                          <option key={workType} value={workType}>
                            {workType}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="documentNo"
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="DOC-2026-0000"
                        required
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        name="workMasterId"
                        value={selectedWorkMasterId}
                        onChange={(event) => setSelectedWorkMasterId(event.target.value)}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        required
                      >
                        {workMasters.map((workMaster) => (
                          <option key={workMaster.id} value={workMaster.id}>
                            {workMaster.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        value={selectedWorkMaster?.name ?? ""}
                        readOnly
                        className="h-10 w-full rounded-xl border border-sky-100 bg-sky-50 px-3 text-sm font-bold text-slate-700 outline-none"
                        aria-label="완성품명"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="finishedProductLot"
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="LOT-260708-A"
                        required
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(event) => setQuantity(Math.max(1, Number(event.target.value || 1)))}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="dueDate"
                        type="date"
                        defaultValue={addDays(new Date().toISOString().slice(0, 10), 2)}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="memo"
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="현장 메모"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800">구성품 정보</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">완성품코드 기준 작업마스터의 제품/부자재 구성입니다.</p>
              </div>
              {productAllocationErrors.length > 0 ? (
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">수량 확인 필요</span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">수량 일치</span>
              )}
            </div>
            <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/75">
              <table className="w-full min-w-[1320px] text-left text-xs">
                <thead className="bg-violet-50/80 font-black text-violet-700">
                  <tr>
                    {["구분", "제품코드", "제품명", "단위수량", "필요수량", "LOT", "할당수량", "비고", "LOT분할"].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {componentRows.map((row) => {
                    const productGroupRows = componentRows.filter((item) => item.kind === "제품" && item.groupId === row.groupId);
                    const allocatedSum = productGroupRows.reduce((sum, item) => sum + Number(item.allocatedQuantity || 0), 0);
                    const invalidProductAllocation = row.kind === "제품" && allocatedSum !== row.requiredQuantity;

                    return (
                      <tr key={row.rowId} className={invalidProductAllocation ? "bg-rose-50/60 text-slate-600" : "text-slate-600"}>
                        <td className="px-3 py-3">
                          <span className={row.kind === "제품" ? "rounded-full bg-sky-100 px-2 py-1 font-black text-sky-700" : "rounded-full bg-violet-100 px-2 py-1 font-black text-violet-700"}>
                            {row.kind}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-black text-slate-800">{row.code}</td>
                        <td className="px-3 py-3 font-bold">{row.name}</td>
                        <td className="px-3 py-3 font-bold">{row.unitQuantity.toLocaleString()}</td>
                        <td className="px-3 py-3 font-black text-slate-800">{row.requiredQuantity.toLocaleString()}</td>
                        <td className="px-3 py-3">
                          <input
                            value={row.lot}
                            onChange={(event) => updateComponentRow(row.rowId, { lot: event.target.value })}
                            className="h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder={row.kind === "제품" ? "제품 LOT" : "부자재 LOT"}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            value={row.allocatedQuantity}
                            onChange={(event) => updateComponentRow(row.rowId, { allocatedQuantity: Number(event.target.value || 0) })}
                            className="h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-sky-200"
                          />
                          {row.kind === "제품" && productGroupRows.length > 1 && (
                            <p className={invalidProductAllocation ? "mt-1 text-[10px] font-black text-rose-600" : "mt-1 text-[10px] font-black text-emerald-600"}>
                              합계 {allocatedSum.toLocaleString()}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            value={row.memo}
                            onChange={(event) => updateComponentRow(row.rowId, { memo: event.target.value })}
                            className="h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-xs outline-none focus:ring-2 focus:ring-sky-200"
                            placeholder="비고"
                          />
                        </td>
                        <td className="px-3 py-3">
                          {row.kind === "제품" ? (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => addProductLotSplit(row)}
                                className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700"
                              >
                                행추가
                              </button>
                              {productGroupRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeProductLotSplit(row.rowId)}
                                  className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700"
                                >
                                  삭제
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {componentRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                        작업마스터에 등록된 구성품이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {productAllocationErrors.length > 0 && (
              <div className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                {productAllocationErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
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

function WorkDetailModal({
  work,
  materials,
  materialRowsByWork,
  productRowsByWork,
  onClose
}: {
  work: PendingAssignmentWork;
  materials: MaterialMaster[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  onClose: () => void;
}) {
  const componentRows = useMemo(() => {
    if (work.componentRows && work.componentRows.length > 0) return work.componentRows;

    const productRows = makeProductRows(
      {
        id: work.workMasterId,
        department_id: "",
        shipper_id: "",
        code: work.finishedProductCode,
        name: work.finishedProductName,
        description: "",
        is_active: true
      },
      work.quantity,
      productRowsByWork
    ).map((row, index) => ({
      ...row,
      lot: index === 0 ? work.finishedProductLot : "",
      memo: index === 0 ? "완성품 LOT 기준" : ""
    }));
    const materialRows = makeMaterialRows(work.workMasterId, work.quantity, materials, materialRowsByWork);

    return [...productRows, ...materialRows];
  }, [materials, materialRowsByWork, productRowsByWork, work]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">작업 상세정보</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{work.documentNo}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              등록된 완성품정보와 구성품 정보를 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="작업 상세정보 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-black text-slate-800">완성품정보</h3>
            <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/75">
              <table className="w-full min-w-[1180px] text-left text-xs">
                <thead className="bg-sky-50/80 font-black text-sky-700">
                  <tr>
                    {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "LOT", "작업수량", "완료요청일", "비고"].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-600">
                    <td className="px-3 py-3 font-bold">{formatDate(work.registeredAt)}</td>
                    <td className="px-3 py-3 font-black text-slate-800">{work.workType}</td>
                    <td className="px-3 py-3 font-black text-sky-700">{work.documentNo}</td>
                    <td className="px-3 py-3 font-bold">{work.finishedProductCode}</td>
                    <td className="px-3 py-3 font-bold text-slate-700">{work.finishedProductName}</td>
                    <td className="px-3 py-3 font-bold text-violet-700">{work.finishedProductLot}</td>
                    <td className="px-3 py-3 font-bold">{work.quantity.toLocaleString()}</td>
                    <td className="px-3 py-3 font-bold">{formatDate(work.dueDate)}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-slate-500">{work.memo || "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-black text-slate-800">구성품 정보</h3>
            <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/75">
              <table className="w-full min-w-[1120px] text-left text-xs">
                <thead className="bg-violet-50/80 font-black text-violet-700">
                  <tr>
                    {["구분", "제품코드", "제품명", "단위수량", "필요수량", "LOT", "할당수량", "비고"].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {componentRows.map((row) => (
                    <tr key={row.rowId} className="text-slate-600">
                      <td className="px-3 py-3">
                        <span className={row.kind === "제품" ? "rounded-full bg-sky-100 px-2 py-1 font-black text-sky-700" : "rounded-full bg-violet-100 px-2 py-1 font-black text-violet-700"}>
                          {row.kind}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-black text-slate-800">{row.code}</td>
                      <td className="px-3 py-3 font-bold">{row.name}</td>
                      <td className="px-3 py-3 font-bold">{row.unitQuantity.toLocaleString()}</td>
                      <td className="px-3 py-3 font-black text-slate-800">{row.requiredQuantity.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-violet-700">{row.lot || "-"}</td>
                      <td className="px-3 py-3 font-bold">{row.allocatedQuantity.toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-500">{row.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <CloudButton type="button" tone="soft" className="w-full" onClick={onClose}>
            닫기
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
