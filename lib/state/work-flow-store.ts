"use client";

import { useEffect, useState } from "react";
import type { Work, WorkStatus } from "@/lib/types/domain";

type Scope = {
  departmentId?: string | null;
  shipperId?: string | null;
};

export type WorkAssignmentDraft = {
  id: string;
  registeredAt: string;
  workMasterId: string;
  workType: string;
  documentNo: string;
  finishedProductLot: string;
  quantity: number;
  dueDate: string;
  memo: string;
};

export type AssignedUserDraft = {
  id: string;
  name: string;
};

export type ManagedWork = Work & {
  work_type?: string;
  quantity?: number;
  due_date?: string;
  finished_product_lot?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  assigned_at?: string;
  inspection_completed_at?: string;
};

export type WorkFlowState = {
  works: ManagedWork[];
  assignedWorkIds: string[];
  inspectionCompletedWorkIds: string[];
  statusOverrides: Record<string, WorkStatus>;
};

const storageKey = "harness.work-flow.v1";
const changeEventName = "harness-work-flow-change";

export const dashboardWorkStatusOptions: { value: WorkStatus; label: string }[] = [
  { value: "registered", label: "대기" },
  { value: "in_progress", label: "진행" },
  { value: "on_hold", label: "보류" },
  { value: "canceled", label: "취소" },
  { value: "completed", label: "완료" }
];

const emptyState: WorkFlowState = {
  works: [],
  assignedWorkIds: [],
  inspectionCompletedWorkIds: [],
  statusOverrides: {}
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeState(value: unknown): WorkFlowState {
  if (!value || typeof value !== "object") return emptyState;
  const state = value as Partial<WorkFlowState>;

  return {
    works: Array.isArray(state.works) ? state.works : [],
    assignedWorkIds: Array.isArray(state.assignedWorkIds) ? state.assignedWorkIds : [],
    inspectionCompletedWorkIds: Array.isArray(state.inspectionCompletedWorkIds) ? state.inspectionCompletedWorkIds : [],
    statusOverrides: state.statusOverrides && typeof state.statusOverrides === "object" ? state.statusOverrides : {}
  };
}

export function readWorkFlowState(): WorkFlowState {
  if (!canUseStorage()) return emptyState;

  try {
    return normalizeState(JSON.parse(window.localStorage.getItem(storageKey) ?? "null"));
  } catch {
    return emptyState;
  }
}

function writeWorkFlowState(state: WorkFlowState) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(storageKey, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(changeEventName, { detail: state }));
}

function updateWorkFlowState(updater: (state: WorkFlowState) => WorkFlowState) {
  const current = readWorkFlowState();
  const next = updater(current);
  writeWorkFlowState(next);
  return next;
}

function inScope(work: Work, scope: Scope) {
  if (scope.departmentId && work.department_id !== scope.departmentId) return false;
  if (scope.shipperId && work.shipper_id !== scope.shipperId) return false;
  return true;
}

export function useWorkFlowState() {
  const [state, setState] = useState<WorkFlowState>(emptyState);

  useEffect(() => {
    setState(readWorkFlowState());

    const handleChange = () => setState(readWorkFlowState());
    window.addEventListener(changeEventName, handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(changeEventName, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  return state;
}

export function mergeWorkFlowWorks(baseWorks: Work[], scope: Scope, state: WorkFlowState): ManagedWork[] {
  const workMap = new Map<string, ManagedWork>();

  baseWorks.forEach((work) => {
    if (!inScope(work, scope)) return;
    workMap.set(work.id, {
      ...work,
      status: state.statusOverrides[work.id] ?? work.status
    });
  });

  state.works.forEach((work) => {
    if (!inScope(work, scope)) return;
    const current = workMap.get(work.id);
    workMap.set(work.id, {
      ...current,
      ...work,
      status: state.statusOverrides[work.id] ?? work.status
    });
  });

  return Array.from(workMap.values()).sort((a, b) => b.work_date.localeCompare(a.work_date));
}

export function isWorkAssigned(workId: string, state: WorkFlowState) {
  return state.assignedWorkIds.includes(workId);
}

export function isInspectionCompleted(workId: string, state: WorkFlowState) {
  return state.inspectionCompletedWorkIds.includes(workId);
}

export function assignWorkToInspection(work: WorkAssignmentDraft, assignee: AssignedUserDraft, scope: { departmentId: string; shipperId: string }) {
  const now = new Date().toISOString();
  const workId = work.id.startsWith("pending-") ? `work-${work.id.slice("pending-".length)}` : work.id;

  updateWorkFlowState((state) => {
    const nextWork: ManagedWork = {
      id: workId,
      department_id: scope.departmentId,
      shipper_id: scope.shipperId,
      work_master_id: work.workMasterId,
      document_no: work.documentNo,
      work_date: work.registeredAt,
      status: "registered",
      worker_name: assignee.name,
      memo: work.memo,
      latest_inspected_at: undefined,
      work_type: work.workType,
      quantity: work.quantity,
      due_date: work.dueDate,
      finished_product_lot: work.finishedProductLot,
      assigned_to: assignee.id,
      assigned_to_name: assignee.name,
      assigned_at: now
    };

    const works = state.works.some((item) => item.id === workId)
      ? state.works.map((item) => (item.id === workId ? { ...item, ...nextWork } : item))
      : [nextWork, ...state.works];

    return {
      ...state,
      works,
      assignedWorkIds: unique([...state.assignedWorkIds, workId]),
      statusOverrides: {
        ...state.statusOverrides,
        [workId]: "registered"
      }
    };
  });

  return workId;
}

export function completeWorkInspection(workId: string) {
  const inspectedAt = new Date().toISOString();

  updateWorkFlowState((state) => ({
    ...state,
    inspectionCompletedWorkIds: unique([...state.inspectionCompletedWorkIds, workId]),
    statusOverrides: {
      ...state.statusOverrides,
      [workId]: "in_progress"
    },
    works: state.works.map((work) =>
      work.id === workId
        ? {
            ...work,
            status: "in_progress",
            latest_inspected_at: inspectedAt,
            inspection_completed_at: inspectedAt
          }
        : work
    )
  }));
}

export function updateWorkFlowStatus(workId: string, status: WorkStatus) {
  updateWorkFlowState((state) => ({
    ...state,
    statusOverrides: {
      ...state.statusOverrides,
      [workId]: status
    },
    works: state.works.map((work) => (work.id === workId ? { ...work, status } : work))
  }));
}
