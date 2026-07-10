"use client";

import { useEffect, useState } from "react";
import { useFilterStore } from "@/lib/state/filter-store";
import type { ReactNode } from "react";
import type { AppUser, Department, Shipper } from "@/lib/types/domain";

type FilterOptionsResponse = {
  source: "supabase" | "mock";
  users: AppUser[];
  departments: Department[];
  shippers: Shipper[];
};

function pickCurrentUser(users: AppUser[]) {
  return users.find((user) => user.email === "admin@example.com") ?? users.find((user) => user.role === "admin") ?? users[0] ?? null;
}

export function MobileScopeInitializer({ children }: { children: ReactNode }) {
  const setScope = useFilterStore((state) => state.setScope);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initializeScope() {
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as FilterOptionsResponse;
        const currentUser = pickCurrentUser(data.users);
        const departmentPermissionIds = new Set(currentUser?.department_ids ?? []);
        const shipperPermissionIds = new Set(currentUser?.shipper_ids ?? []);
        const currentScope = useFilterStore.getState();
        const allowedDepartments = data.departments.filter(
          (department) => department.is_active && (departmentPermissionIds.size === 0 || departmentPermissionIds.has(department.id))
        );
        const selectedDepartment =
          allowedDepartments.find((department) => department.id === currentScope.departmentId) ?? allowedDepartments[0];

        if (!selectedDepartment) return;

        const allowedShippers = data.shippers.filter(
          (shipper) =>
            shipper.is_active &&
            shipper.department_id === selectedDepartment.id &&
            (shipperPermissionIds.size === 0 || shipperPermissionIds.has(shipper.id))
        );
        const selectedShipper = allowedShippers.find((shipper) => shipper.id === currentScope.shipperId) ?? allowedShippers[0];

        if (!isMounted || !selectedShipper) return;
        if (selectedDepartment.id !== currentScope.departmentId || selectedShipper.id !== currentScope.shipperId) {
          setScope({ departmentId: selectedDepartment.id, shipperId: selectedShipper.id });
        }
      } catch {
        // The API routes still resolve the default mobile scope to Supabase when direct user scope loading fails.
      } finally {
        if (isMounted) setIsReady(true);
      }
    }

    void initializeScope();

    return () => {
      isMounted = false;
    };
  }, [setScope]);

  if (!isReady) {
    return (
      <div className="rounded-2xl bg-white/80 p-4 text-center text-sm font-black text-slate-500 shadow-sm ring-1 ring-white/70">
        데이터 동기화 중
      </div>
    );
  }

  return children;
}
