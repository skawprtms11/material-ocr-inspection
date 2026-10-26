"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import type { EditablePendingWorkDto } from "@/lib/server/work-register-shared";
import { useFilterStore } from "@/lib/state/filter-store";
import type { IssueWorkOrderResponse } from "@/lib/types/document-template";
import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type {
  CreateWorkRegistrationRequest,
  CreateWorkRegistrationResponse,
  WorkComponentRowDto,
  WorkRegisterDataResponse
} from "@/lib/types/work-register-api";
import type { ProductUsageRowDto, WorkMaterialRowDto } from "@/lib/types/work-master-api";
import { formatDate } from "@/lib/utils/format";
import { WorkOrderModal } from "./WorkOrderModal";

type PendingAssignmentWork = EditablePendingWorkDto;

type IssueFilter = "unissued" | "issued" | "all";

const issueFilterOptions: { value: IssueFilter; label: string }[] = [
  { value: "unissued", label: "미출력" },
  { value: "issued", label: "출력완료" },
  { value: "all", label: "전체" }
];

function formatIssuedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 실DB 모드에서는 가짜 제품 폴백을 쓰지 않는다
const isRealDbMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false";

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
  if (productRows.length === 0) return isRealDbMode ? [] : makeFallbackProductRows(workMaster.code, quantity);

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
  const [materialRowsByWork, setMaterialRowsByWork] = useState<Record<string, WorkMaterialRowDto[]>>({});
  const [productRowsByWork, setProductRowsByWork] = useState<Record<string, ProductUsageRowDto[]>>({});
  const [pendingWorks, setPendingWorks] = useState<PendingAssignmentWork[]>([]);
  const [workOrderTarget, setWorkOrderTarget] = useState<PendingAssignmentWork | null>(null);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("unissued");
  const [detailTarget, setDetailTarget] = useState<PendingAssignmentWork | null>(null);
  const [editTarget, setEditTarget] = useState<PendingAssignmentWork | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const applyData = useCallback((data: WorkRegisterDataResponse) => {
    setPendingWorks(data.pendingWorks);
    setWorkMasters(data.workMasters);
    setMaterials(data.materials);
    setMaterialRowsByWork(data.materialRowsByWork);
    setProductRowsByWork(data.productRowsByWork);
    setDataSource(data.source);
    setWorkOrderTarget(null);
    setDetailTarget(null);
    setEditTarget(null);
    setIsRegisterOpen(false);
  }, []);

  const loadWorkRegister = useCallback(
    async (signal?: AbortSignal) => {
      if (!departmentId || !shipperId) return;

      setIsLoading(true);

      try {
        const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
        const response = await fetch(`/api/work-register?${params.toString()}`, { signal });
        const data = (await response.json()) as WorkRegisterDataResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "작업등록 데이터를 불러오지 못했습니다.");
        applyData(data);
        setLoadError(false);
        if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
        toast.error(error instanceof Error ? error.message : "작업등록 데이터를 불러오지 못했습니다.");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [applyData, departmentId, shipperId]
  );

  useEffect(() => {
    if (!departmentId || !shipperId) return;

    const controller = new AbortController();
    void loadWorkRegister(controller.signal);
    return () => controller.abort();
  }, [departmentId, loadWorkRegister, shipperId]);

  const visibleWorks = useMemo(
    () =>
      pendingWorks.filter((work) => {
        const issued = (work.workOrder?.issueCount ?? 0) > 0;
        return issueFilter === "all" || (issueFilter === "issued" ? issued : !issued);
      }),
    [issueFilter, pendingWorks]
  );

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
      toast.success("작업이 저장되고 작업지시 대기 목록에 등록되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업등록 저장에 실패했습니다.");
    }
  };

  const handleUpdate = async (workId: string, payload: RegisterPayload) => {
    if (!departmentId || !shipperId) return;

    try {
      const response = await fetch(`/api/work-register/${workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, departmentId, shipperId } satisfies CreateWorkRegistrationRequest)
      });
      const result = (await response.json()) as CreateWorkRegistrationResponse & { error?: string };
      if (!response.ok) {
        // 검수가 이미 시작된 경우 목록을 갱신해 수정 버튼 잠금 상태를 반영한다
        if (response.status === 409) void loadWorkRegister();
        throw new Error(result.error ?? "작업 수정 저장에 실패했습니다.");
      }

      // 수정 응답에는 배정·출력 이력 요약이 없어 기존 값을 유지한다
      setPendingWorks((current) =>
        current.map((work) =>
          work.id === workId ? { ...result.work, assignedAt: work.assignedAt, workOrder: work.workOrder } : work
        )
      );
      setDataSource(result.source);
      setEditTarget(null);
      toast.success("작업이 수정되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업 수정 저장에 실패했습니다.");
    }
  };

  // 출력 성공 시 행의 배정·출력 이력 요약만 갱신한다(모달은 열린 채 재출력 가능)
  const handleIssued = (workId: string, result: IssueWorkOrderResponse, templateName: string) => {
    setPendingWorks((current) =>
      current.map((work) =>
        work.id === workId
          ? {
              ...work,
              assignedAt: result.assignedAt,
              workOrder: {
                issueCount: Math.max((work.workOrder?.issueCount ?? 0) + 1, result.issue.seq),
                lastIssuedAt: result.issue.issuedAt,
                lastTemplateName: templateName
              }
            }
          : work
      )
    );
    setDataSource(result.source);
  };

  return (
    <>
      <PageHeader
        title="작업등록"
        description="작업을 등록한 뒤 작업지시서를 출력하면 작업이 자동 배정되고, 검수 시작 전까지 재출력할 수 있습니다."
        action={
          <CloudButton type="button" onClick={() => setIsRegisterOpen(true)}>
            <Plus className="size-4" />
            작업 등록
          </CloudButton>
        }
      />

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
          <span>{isLoading ? "작업등록 데이터를 불러오는 중이에요." : "선택된 부서/화주 기준으로 검수 시작 전 작업을 조회합니다."}</span>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 ring-1 ${loadError ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
              데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
            </span>
            {loadError && (
              <button type="button" onClick={() => void loadWorkRegister()} className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
                다시 시도
              </button>
            )}
          </div>
        </div>

        <CuteCard className="p-0">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-800">작업지시 대기 작업 목록</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">검수 시작 전 작업을 출력 여부와 관계없이 표시합니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-slate-100 p-1" role="group" aria-label="출력 여부 필터">
                {issueFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setIssueFilter(option.value)}
                    aria-pressed={issueFilter === option.value}
                    className={`rounded-full px-3 py-1 text-xs font-black transition ${
                      issueFilter === option.value ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="w-fit rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                {visibleWorks.length}건
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1440px] text-left text-sm">
              <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
                <tr>
                  {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "LOT", "작업수량", "완료요청일", "비고", "수정", "작업지시"].map((header) => (
                    <th key={header} className="px-4 py-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/70">
                {visibleWorks.map((work) => (
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
                      <CloudButton type="button" tone="soft" disabled={Boolean(work.editLockedReason)} onClick={() => setEditTarget(work)}>
                        <Pencil className="size-4" />
                        수정
                      </CloudButton>
                      {work.editLockedReason && <p className="mt-1 text-[10px] font-black text-rose-600">{work.editLockedReason}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <CloudButton type="button" tone="soft" onClick={() => setWorkOrderTarget(work)}>
                        <FileText className="size-4" />
                        작업지시서
                      </CloudButton>
                      {work.workOrder ? (
                        <p className="mt-1 text-[10px] font-black text-emerald-700">
                          출력 {work.workOrder.issueCount}회 · 최근 {formatIssuedAt(work.workOrder.lastIssuedAt)}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] font-bold text-slate-400">미출력</p>
                      )}
                    </td>
                  </tr>
                ))}
                {pendingWorks.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                      {issueFilter === "issued" ? "출력 완료된 작업이 없습니다." : issueFilter === "unissued" ? "작업지시서를 출력하지 않은 작업이 없습니다." : "표시할 작업이 없습니다."} 상단의 작업 등록 버튼으로 새 작업을 등록해주세요.
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

      {editTarget && (
        <WorkRegisterModal
          editWork={editTarget}
          workMasters={workMasters}
          materials={materials}
          materialRowsByWork={materialRowsByWork}
          productRowsByWork={productRowsByWork}
          onClose={() => setEditTarget(null)}
          onRegister={(payload) => handleUpdate(editTarget.id, payload)}
        />
      )}

      {workOrderTarget && (
        <WorkOrderModal
          work={workOrderTarget}
          departmentId={departmentId}
          shipperId={shipperId}
          onClose={() => setWorkOrderTarget(null)}
          onIssued={handleIssued}
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
  editWork,
  workMasters,
  materials,
  materialRowsByWork,
  productRowsByWork,
  onClose,
  onRegister
}: {
  editWork?: PendingAssignmentWork;
  workMasters: WorkMaster[];
  materials: MaterialMaster[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  onClose: () => void;
  onRegister: (payload: RegisterPayload) => void;
}) {
  const isEdit = Boolean(editWork);
  const buildRows = (workMasterId: string, nextQuantity: number): ComponentRow[] => {
    const workMaster = workMasters.find((item) => item.id === workMasterId);
    if (!workMaster) return [];
    return [
      ...makeProductRows(workMaster, nextQuantity, productRowsByWork),
      ...makeMaterialRows(workMaster.id, nextQuantity, materials, materialRowsByWork)
    ];
  };

  const [selectedWorkMasterId, setSelectedWorkMasterId] = useState(editWork?.workMasterId ?? workMasters[0]?.id ?? "");
  const [quantity, setQuantity] = useState(editWork?.quantity ?? 100);
  // 수정 모드는 저장된 구성품(LOT/할당수량/비고)을 프리필한다. 저장된 구성품이 없으면 작업마스터 기준으로 생성한다.
  const [componentRows, setComponentRows] = useState<ComponentRow[]>(() =>
    editWork?.componentRows && editWork.componentRows.length > 0
      ? editWork.componentRows
      : buildRows(editWork?.workMasterId ?? workMasters[0]?.id ?? "", editWork?.quantity ?? 100)
  );
  const selectedWorkMaster = workMasters.find((workMaster) => workMaster.id === selectedWorkMasterId);

  // 작업마스터가 바뀔 때만 구성품을 재생성한다(수량 변경은 필요수량만 갱신해 사용자 입력 보존)
  const handleWorkMasterChange = (workMasterId: string) => {
    setSelectedWorkMasterId(workMasterId);
    setComponentRows(buildRows(workMasterId, quantity));
  };

  const handleQuantityChange = (nextQuantity: number) => {
    setQuantity(nextQuantity);
    setComponentRows((current) =>
      current.map((row) => {
        const requiredQuantity = row.unitQuantity * nextQuantity;
        const groupSize = current.filter((item) => item.kind === row.kind && item.groupId === row.groupId).length;
        // 기존 할당수량이 필요수량과 같았고 LOT 분할이 없는 행만 새 필요수량을 따라간다
        const followsRequired = groupSize === 1 && row.allocatedQuantity === row.requiredQuantity;
        return { ...row, requiredQuantity, allocatedQuantity: followsRequired ? requiredQuantity : row.allocatedQuantity };
      })
    );
  };

  useEffect(() => {
    if (!selectedWorkMasterId && workMasters[0]) {
      setSelectedWorkMasterId(workMasters[0].id);
      setComponentRows(buildRows(workMasters[0].id, quantity));
    }
    // 작업마스터 목록이 늦게 도착한 경우의 초기 선택 1회용
  }, [workMasters]);

  const missingProducts = isRealDbMode && !componentRows.some((row) => row.kind === "제품");

  // OCR 대상 여부는 부자재마스터 검수방식(OCR/BOTH) 기준이며 서버가 저장 시 같은 규칙으로 다시 검증한다
  const findOcrMaterial = (row: ComponentRow) =>
    row.kind === "부자재"
      ? materials.find((item) => item.code === row.code && (item.inspection_method === "OCR" || item.inspection_method === "BOTH"))
      : undefined;
  const [showOcrErrors, setShowOcrErrors] = useState(false);

  const updateComponentRow = (rowId: string, patch: Partial<ComponentRow>) => {
    setComponentRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  // 자동 채움 없음: 사용자가 버튼을 눌렀을 때만 마스터 검증값을 입력란에 넣는다
  const importMasterOcrText = (row: ComponentRow, material: MaterialMaster) => {
    const masterValue = material.verification_value?.trim() ?? "";
    if (!masterValue) {
      toast.error("마스터에 등록된 검증값이 없습니다.");
      return;
    }
    const current = row.ocrExpectedText?.trim() ?? "";
    if (current && current !== masterValue && !window.confirm("입력된 OCR 검수 텍스트를 마스터값으로 덮어쓸까요?")) return;
    updateComponentRow(row.rowId, { ocrExpectedText: masterValue });
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

    if (missingProducts) {
      toast.error("제품 구성 미등록 — 작업마스터에서 사용제품코드를 먼저 등록하세요.");
      return;
    }

    if (productAllocationErrors.length > 0) {
      toast.error(`제품 LOT 분할 수량을 확인해주세요. ${productAllocationErrors[0]}`);
      return;
    }

    const emptyOcrRows = componentRows.filter((row) => findOcrMaterial(row) && !row.ocrExpectedText?.trim());
    if (emptyOcrRows.length > 0) {
      setShowOcrErrors(true);
      toast.error(`OCR 검수 텍스트를 입력하세요(${emptyOcrRows.length}건): ${emptyOcrRows.map((row) => row.code).join(", ")}`);
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
            <h2 className="mt-1 text-2xl font-black text-slate-800">{isEdit ? "작업 수정" : "새 작업 등록"}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              {isEdit ? "검수 시작 전 작업만 수정할 수 있습니다. 이미 출력된 지시서가 있으면 수정 후 재출력하세요." : "저장하면 작업지시 대기 목록에 추가됩니다."}
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
                        defaultValue={editWork?.workType}
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
                        defaultValue={editWork?.documentNo}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder="DOC-2026-0000"
                        required
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        name="workMasterId"
                        value={selectedWorkMasterId}
                        onChange={(event) => handleWorkMasterChange(event.target.value)}
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
                        defaultValue={editWork?.finishedProductLot}
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
                        onChange={(event) => handleQuantityChange(Math.max(1, Math.floor(Number(event.target.value || 1))))}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="dueDate"
                        type="date"
                        defaultValue={editWork?.dueDate ?? addDays(new Date().toISOString().slice(0, 10), 2)}
                        className="h-10 w-full rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="memo"
                        defaultValue={editWork?.memo}
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
              <table className="w-full min-w-[1560px] text-left text-xs">
                <thead className="bg-violet-50/80 font-black text-violet-700">
                  <tr>
                    {["구분", "제품코드", "제품명", "단위수량", "필요수량", "LOT", "할당수량", "OCR 검수 텍스트", "비고", "LOT분할"].map((header) => (
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
                    const ocrMaterial = findOcrMaterial(row);
                    const ocrTextMissing = Boolean(ocrMaterial) && !row.ocrExpectedText?.trim();

                    return (
                      <tr key={row.rowId} className={invalidProductAllocation ? "bg-rose-50/60 text-slate-600" : "text-slate-600"}>
                        <td className="px-3 py-3">
                          <span className={row.kind === "제품" ? "rounded-full bg-sky-100 px-2 py-1 font-black text-sky-700" : "rounded-full bg-violet-100 px-2 py-1 font-black text-violet-700"}>
                            {row.kind}
                          </span>
                          {ocrMaterial && (
                            <span className="ml-1 rounded-full bg-amber-100 px-2 py-1 font-black text-amber-700">OCR</span>
                          )}
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
                          {ocrMaterial ? (
                            <div className="w-72 space-y-1">
                              <textarea
                                value={row.ocrExpectedText ?? ""}
                                onChange={(event) => updateComponentRow(row.rowId, { ocrExpectedText: event.target.value })}
                                maxLength={1000}
                                rows={2}
                                aria-label={`${row.code} OCR 검수 텍스트`}
                                aria-invalid={showOcrErrors && ocrTextMissing}
                                className={`w-full resize-y rounded-xl border bg-white px-3 py-2 text-xs outline-none focus:ring-2 ${
                                  showOcrErrors && ocrTextMissing ? "border-rose-400 focus:ring-rose-200" : "border-sky-100 focus:ring-sky-200"
                                }`}
                                placeholder="OCR로 확인할 LOT·유효일자 등 (필수)"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => importMasterOcrText(row, ocrMaterial)}
                                  className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700"
                                >
                                  마스터값 가져오기
                                </button>
                                {showOcrErrors && ocrTextMissing && (
                                  <span className="text-[10px] font-black text-rose-600">필수 입력</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
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
                      <td colSpan={10} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                        작업마스터에 등록된 구성품이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {missingProducts && (
              <div className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                제품 구성 미등록 — 작업마스터에서 사용제품코드를 먼저 등록하세요.
              </div>
            )}
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
            <CloudButton type="submit" disabled={missingProducts}>
              <Save className="size-4" />
              {isEdit ? "수정 저장" : "작업지시 대기 목록에 등록"}
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
                    {["구분", "제품코드", "제품명", "단위수량", "필요수량", "LOT", "할당수량", "OCR 검수 텍스트", "비고"].map((header) => (
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
                      <td className="max-w-[260px] whitespace-pre-wrap break-all px-3 py-3 font-bold text-amber-700">{row.ocrExpectedText || "-"}</td>
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
