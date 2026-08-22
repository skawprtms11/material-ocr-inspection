"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFilterStore } from "@/lib/state/filter-store";
import type { Department, Shipper } from "@/lib/types/domain";

type FilterOptionsResponse = {
  departments: Department[];
  shippers: Shipper[];
};

/**
 * 모바일 헤더 우측에 현재 조회 스코프(부서·화주명)를 작게 표시하는 배지.
 * 탭하면 설정 탭으로 이동해 바로 변경할 수 있다.
 */
export function MobileScopeBadge() {
  const departmentId = useFilterStore((state) => state.departmentId);
  const shipperId = useFilterStore((state) => state.shipperId);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shippers, setShippers] = useState<Shipper[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadNames() {
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as FilterOptionsResponse;
        if (cancelled) return;
        setDepartments(data.departments ?? []);
        setShippers(data.shippers ?? []);
      } catch {
        // 이름 조회 실패 시 배지를 숨길 뿐 화면 동작에는 영향 없음
      }
    }

    void loadNames();

    return () => {
      cancelled = true;
    };
  }, []);

  const departmentName = departments.find((department) => department.id === departmentId)?.name;
  const shipperName = shippers.find((shipper) => shipper.id === shipperId)?.name;

  if (!departmentName || !shipperName) return null;

  return (
    <Link
      href="/mobile/settings"
      aria-label="현재 부서/화주 — 설정에서 변경"
      className="max-w-[45vw] truncate rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-100"
    >
      {departmentName} · {shipperName}
    </Link>
  );
}
