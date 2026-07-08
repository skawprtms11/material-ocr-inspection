"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFilterStore } from "@/lib/state/filter-store";
import type { MaterialMaster, Work } from "@/lib/types/domain";
import type { InspectionTableRowDto, WorkInspectionDataResponse } from "@/lib/types/work-inspection-api";
import type { WorkStatusDataResponse, WorkStatusRowDto } from "@/lib/types/work-status-api";

type Source = "supabase" | "mock";

export type MobileDataState<T> = {
  data: T;
  source: Source;
  warning?: string;
  isLoading: boolean;
  error: string;
  reload: () => Promise<void>;
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
  const [source, setSource] = useState<Source>("mock");
  const [warning, setWarning] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(buildPath({ departmentId, shipperId }), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? errorMessage);

      const parsed = parse(payload);
      setData(parsed.data);
      setSource(parsed.source);
      setWarning(parsed.warning);
    } catch (error) {
      setError(getErrorMessage(error, errorMessage));
      setData(initialData);
      setSource("mock");
      setWarning(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(
    () => ({ data, source, warning, isLoading, error, reload }),
    [data, error, isLoading, reload, source, warning]
  );
}

function scopeQuery(scope: { departmentId: string; shipperId: string }) {
  return new URLSearchParams({ department_id: scope.departmentId, shipper_id: scope.shipperId }).toString();
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

export function useMobileMaterials() {
  return useScopedMobileData<MaterialMaster[]>(
    [],
    (scope) => `/api/material-master?${scopeQuery(scope)}`,
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
