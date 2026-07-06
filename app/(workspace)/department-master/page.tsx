"use client";

import { Plus } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";

export default function DepartmentMasterPage() {
  const departments = appRepository.listDepartments();

  return (
    <>
      <PageHeader title="부서마스터" description="부서명, 사용여부, 정렬순서를 관리하고 화주/사용자 수를 확인합니다." action={<CloudButton><Plus className="size-4" />부서 추가</CloudButton>} />
      <CuteCard>
        <DataTable
          headers={["정렬", "부서명", "화주 수", "사용자 수", "사용여부"]}
          rows={departments.map((department) => [
            department.sort_order,
            <span key="name" className="font-black text-slate-800">{department.name}</span>,
            appRepository.listShippers({ departmentId: department.id }).length,
            appRepository.listUsers().filter((user) => user.department_ids.includes(department.id)).length,
            department.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
    </>
  );
}
