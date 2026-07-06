"use client";

import { Plus } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";

export default function ShipperMasterPage() {
  const { departmentId } = useFilterStore();
  const shippers = appRepository.listShippers({ departmentId });

  if (!departmentId) {
    return <EmptyCloudState title="화주가 소속될 부서를 먼저 골라주세요." description="화주는 반드시 부서에 소속되어야 해요." />;
  }

  return (
    <>
      <PageHeader title="화주마스터" description="선택된 부서에 소속된 화주를 관리합니다." action={<CloudButton><Plus className="size-4" />화주 추가</CloudButton>} />
      <CuteCard>
        <DataTable
          headers={["화주명", "부서 ID", "사용여부"]}
          rows={shippers.map((shipper) => [
            <span key="name" className="font-black text-slate-800">{shipper.name}</span>,
            shipper.department_id,
            shipper.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
    </>
  );
}
