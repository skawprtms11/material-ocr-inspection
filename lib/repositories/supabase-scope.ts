import type { SupabaseClient } from "@supabase/supabase-js";
import { appRepository } from "@/lib/repositories/app-repository";

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const seededDepartmentIdToMockId: Record<string, string> = {
  "11111111-1111-1111-1111-111111111111": "dept-fulfillment",
  "22222222-2222-2222-2222-222222222222": "dept-package",
  "33333333-3333-3333-3333-333333333333": "dept-quality"
};

const seededShipperIdToMockId: Record<string, string> = {
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": "shipper-mint",
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": "shipper-cloud",
  "cccccccc-cccc-cccc-cccc-cccccccccccc": "shipper-lavender",
  "dddddddd-dddd-dddd-dddd-dddddddddddd": "shipper-cream"
};

export function toMockScopeIds(departmentId: string, shipperId: string) {
  return {
    departmentId: seededDepartmentIdToMockId[departmentId] ?? departmentId,
    shipperId: seededShipperIdToMockId[shipperId] ?? shipperId
  };
}

export async function resolveScopeIds(supabase: SupabaseClient, departmentId: string, shipperId: string) {
  let resolvedDepartmentId = departmentId;
  let resolvedShipperId = shipperId;

  if (!isUuid(departmentId)) {
    const mockDepartment = appRepository.listDepartments().find((department) => department.id === departmentId);
    if (mockDepartment) {
      const { data } = await supabase.from("departments").select("*").eq("name", mockDepartment.name).maybeSingle();
      if (data && typeof data.id === "string") resolvedDepartmentId = data.id;
    }
  }

  if (!isUuid(shipperId)) {
    const mockShipper = appRepository.listShippers({ departmentId }).find((shipper) => shipper.id === shipperId);
    if (mockShipper) {
      const { data } = await supabase.from("shippers").select("*").eq("department_id", resolvedDepartmentId);
      const resolved = (data ?? []).find((shipper) => {
        const row = shipper as Record<string, unknown>;
        return row.name === mockShipper.name || row.code === mockShipper.code;
      });
      if (resolved && typeof resolved.id === "string") resolvedShipperId = resolved.id;
    }
  }

  return {
    departmentId: resolvedDepartmentId,
    shipperId: resolvedShipperId
  };
}
