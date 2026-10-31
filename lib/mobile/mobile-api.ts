"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultFilterScope, useFilterStore } from "@/lib/state/filter-store";
import type { MaterialMaster, Work, WorkInspectionStage } from "@/lib/types/domain";
import type {
  InspectionTableRowDto,
  PhotoReviewItemDto,
  PhotoReviewResponse,
  WorkInspectionDataResponse
} from "@/lib/types/work-inspection-api";
import type { WorkStatusDataResponse, WorkStatusRowDto } from "@/lib/types/work-status-api";

type Source = "supabase" | "mock";

export type MobileDataState<T> = {
  data: T;
  source: Source | null;
  warning?: string;
  isLoading: boolean;
  error: string;
  // 조회에 성공하면 새로 반영된 데이터를, 실패하거나 더 최신 요청에 밀려 무효가 되면 null을 돌려준다.
  reload: () => Promise<T | null>;
  refetch: () => Promise<T | null>;
};

type MaterialMasterResponse = {
  source: Source;
  warning?: string;
  materials: MaterialMaster[];
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function useScopedMobileData<T>(
  initialData: T,
  buildPath: (scope: { departmentId: string; shipperId: string }) => string,
  parse: (value: unknown) => { data: T; source: Source; warning?: string },
  errorMessage: string
): MobileDataState<T> {
  const { departmentId, shipperId } = useFilterStore();
  const [data, setData] = useState<T>(initialData);
  const [source, setSource] = useState<Source | null>(null);
  const [warning, setWarning] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  // 요청 순서 보장: 새 요청이 시작되면 이전 요청을 abort하고, 늦게 도착한 이전 응답이 최신 데이터를 덮어쓰지 못하게 한다.
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async (): Promise<T | null> => {
    const scope = {
      departmentId: departmentId || defaultFilterScope.departmentId,
      shipperId: shipperId || defaultFilterScope.shipperId
    };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(buildPath(scope), { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (isStale()) return null;
      if (!response.ok || payload?.error) throw new Error(payload?.error ?? errorMessage);

      const parsed = parse(payload);
      setData(parsed.data);
      setSource(parsed.source);
      setWarning(parsed.warning);
      setIsLoading(false);
      return parsed.data;
    } catch (error) {
      // abort되었거나 더 최신 요청이 있으면 이 요청의 결과(오류 포함)는 화면에 반영하지 않는다.
      if (isStale() || (error instanceof DOMException && error.name === "AbortError")) return null;
      setError(getErrorMessage(error, errorMessage));
      setData(initialData);
      setSource(null);
      setWarning(undefined);
      setIsLoading(false);
      return null;
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 화면이 사라지면 진행 중인 요청을 취소하고 이후 응답을 무시한다.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  return useMemo(
    () => ({ data, source, warning, isLoading, error, reload, refetch: reload }),
    [data, error, isLoading, reload, source, warning]
  );
}

// 모바일 셸의 스코프 초기화·스코프 배지가 화면을 열 때 동시에 /api/users를 부르므로, 진행 중인 요청을 함께 써서
// 같은 조회가 두 번 나가지 않게 한다. 응답이 끝나면 비워 다음 화면 진입 때는 새로 조회한다.
let mobileFilterOptionsRequest: Promise<unknown | null> | null = null;

export function fetchMobileFilterOptions<T>(): Promise<T | null> {
  if (!mobileFilterOptionsRequest) {
    mobileFilterOptionsRequest = fetch("/api/users", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .finally(() => {
        mobileFilterOptionsRequest = null;
      });
  }
  return mobileFilterOptionsRequest as Promise<T | null>;
}

// 모바일 쓰기/리소스 조회 API(스코프 가드 필수)용 현재 부서/화주. useScopedMobileData와 같은 기본값 규칙을 쓴다.
export function useMobileScope() {
  const departmentId = useFilterStore((state) => state.departmentId) || defaultFilterScope.departmentId;
  const shipperId = useFilterStore((state) => state.shipperId) || defaultFilterScope.shipperId;
  return useMemo(() => ({ departmentId, shipperId }), [departmentId, shipperId]);
}

function scopeQuery(scope: { departmentId: string; shipperId: string }) {
  return new URLSearchParams({ department_id: scope.departmentId, shipper_id: scope.shipperId }).toString();
}

function materialScopeQuery(scope: { departmentId: string; shipperId: string }) {
  const params = new URLSearchParams(scopeQuery(scope));
  const materialId = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("materialId");

  if (materialId) params.set("material_id", materialId);

  return params.toString();
}

export function useMobileWorkStatusRows() {
  return useScopedMobileData<WorkStatusRowDto[]>(
    [],
    (scope) => `/api/work-status?${scopeQuery(scope)}`,
    (value) => {
      const payload = value as WorkStatusDataResponse;
      return { data: payload.rows ?? [], source: payload.source, warning: payload.warning };
    },
    "작업현황 데이터를 불러오지 못했습니다."
  );
}

export function useMobileInspectionRows() {
  return useScopedMobileData<InspectionTableRowDto[]>(
    [],
    (scope) => `/api/work-inspection?${scopeQuery(scope)}`,
    (value) => {
      const payload = value as WorkInspectionDataResponse;
      return { data: payload.rows ?? [], source: payload.source, warning: payload.warning };
    },
    "작업검수 데이터를 불러오지 못했습니다."
  );
}

// 완료검수(작업완료 시 검수, 신규) 전용. stage=complete로 조회하면 work_inspections.stage="complete" 행만 내려온다.
// mock 모드는 stage를 구분하지 않아(appRepository에 stage 개념 없음) 시작검수와 동일한 목록을 그대로 반환한다.
export function useMobileCompletionInspectionRows() {
  return useScopedMobileData<InspectionTableRowDto[]>(
    [],
    (scope) => `/api/work-inspection?${scopeQuery(scope)}&stage=complete`,
    (value) => {
      const payload = value as WorkInspectionDataResponse;
      return { data: payload.rows ?? [], source: payload.source, warning: payload.warning };
    },
    "완료검수 데이터를 불러오지 못했습니다."
  );
}

// 사진검수(PHOTO) 항목의 사진 URL·반려 사유 조회(GET /api/work-inspection/photo). 상태 판정은 검수 행이 기준이고
// 이 응답은 사진 미리보기·반려 사유 보강용이라, 실패해도 검수 화면 자체는 계속 쓸 수 있다.
export function useMobilePhotoReview(workId: string, stage: WorkInspectionStage) {
  const state = useScopedMobileData<PhotoReviewResponse | null>(
    null,
    (scope) => `/api/work-inspection/photo?${scopeQuery(scope)}&work_id=${encodeURIComponent(workId)}&stage=${stage}`,
    (value) => {
      const payload = value as PhotoReviewResponse;
      return { data: payload, source: payload.source };
    },
    "사진검수 데이터를 불러오지 못했습니다."
  );
  const itemsById = useMemo(
    () => new Map<string, PhotoReviewItemDto>((state.data?.items ?? []).map((item) => [item.inspectionId, item])),
    [state.data]
  );
  return { ...state, itemsById };
}

export function useMobileMaterials() {
  return useScopedMobileData<MaterialMaster[]>(
    [],
    (scope) => `/api/material-master?${materialScopeQuery(scope)}`,
    (value) => {
      const payload = value as MaterialMasterResponse;
      return { data: payload.materials ?? [], source: payload.source, warning: payload.warning };
    },
    "부자재 데이터를 불러오지 못했습니다."
  );
}

export function findWorkStatusById(rows: WorkStatusRowDto[], workId: string) {
  return rows.find((row) => row.work.id === workId);
}

export function findInspectionById(rows: InspectionTableRowDto[], workId: string) {
  return rows.find((row) => row.work.id === workId);
}

export function findWorkByDocumentNo(rows: WorkStatusRowDto[], documentNo: string) {
  return rows.find((row) => row.work.document_no.toLowerCase() === documentNo.trim().toLowerCase());
}

export function toWorkList(rows: WorkStatusRowDto[]): Work[] {
  return rows.map((row) => row.work);
}
