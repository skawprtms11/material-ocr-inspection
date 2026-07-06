import {
  adminReviewRequests,
  currentUser,
  departments,
  inspectionImages,
  materialInspectionRegions,
  materialMasters,
  shippers,
  users,
  workInspections,
  workMasterMaterials,
  workMasters,
  workerSignatures,
  works
} from "@/lib/mock/data";
import type { AdminReviewStatus, WorkStatus } from "@/lib/types/domain";

export const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

export type FilterScope = {
  departmentId?: string | null;
  shipperId?: string | null;
};

function inScope<T extends { department_id: string; shipper_id?: string }>(item: T, scope: FilterScope) {
  if (scope.departmentId && item.department_id !== scope.departmentId) return false;
  if (scope.shipperId && item.shipper_id !== scope.shipperId) return false;
  return true;
}

export const appRepository = {
  getCurrentUser() {
    return currentUser;
  },
  listAllowedDepartments() {
    const allowed = new Set(currentUser.department_ids);
    return departments.filter((department) => allowed.has(department.id) && department.is_active);
  },
  listAllowedShippers(departmentId?: string | null) {
    const allowed = new Set(currentUser.shipper_ids);
    return shippers.filter(
      (shipper) => allowed.has(shipper.id) && shipper.is_active && (!departmentId || shipper.department_id === departmentId)
    );
  },
  listDepartments() {
    return departments;
  },
  listShippers(scope: Pick<FilterScope, "departmentId">) {
    return shippers.filter((shipper) => !scope.departmentId || shipper.department_id === scope.departmentId);
  },
  listUsers() {
    return users;
  },
  listMaterials(scope: FilterScope) {
    return materialMasters.filter((material) => inScope(material, scope));
  },
  listMaterialRegions(materialId?: string) {
    return materialInspectionRegions.filter((region) => !materialId || region.material_id === materialId);
  },
  listWorkMasters(scope: FilterScope) {
    return workMasters.filter((workMaster) => inScope(workMaster, scope));
  },
  listWorkMasterMaterials(workMasterId?: string) {
    return workMasterMaterials.filter((mapping) => !workMasterId || mapping.work_master_id === workMasterId);
  },
  listWorks(scope: FilterScope) {
    return works.filter((work) => inScope(work, scope));
  },
  findWorkById(workId: string) {
    return works.find((work) => work.id === workId);
  },
  findWorkByDocumentNo(documentNo: string) {
    return works.find((work) => work.document_no.toLowerCase() === documentNo.trim().toLowerCase());
  },
  listInspections(workId?: string) {
    return workInspections.filter((inspection) => !workId || inspection.work_id === workId);
  },
  listInspectionImages(workId?: string) {
    return inspectionImages.filter((image) => !workId || image.work_id === workId);
  },
  listAdminReviewRequests(status?: AdminReviewStatus) {
    return adminReviewRequests.filter((request) => !status || request.status === status);
  },
  listSignatures(workId?: string) {
    return workerSignatures.filter((signature) => !workId || signature.work_id === workId);
  },
  summarizeWorks(scope: FilterScope) {
    const scopedWorks = this.listWorks(scope);
    return scopedWorks.reduce(
      (acc, work) => {
        acc.total += 1;
        acc[work.status] += 1;
        return acc;
      },
      {
        total: 0,
        registered: 0,
        in_progress: 0,
        inspection_failed: 0,
        admin_review_requested: 0,
        passed: 0,
        completed: 0
      } satisfies Record<WorkStatus | "total", number>
    );
  }
};
