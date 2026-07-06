"use client";

import { Plus } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { roleLabels } from "@/lib/constants/status";
import { appRepository } from "@/lib/repositories/app-repository";

export default function UsersPage() {
  const users = appRepository.listUsers();
  const departments = appRepository.listDepartments();
  const shippers = appRepository.listAllowedShippers();

  return (
    <>
      <PageHeader title="사용자관리" description="역할과 부서/화주 접근 권한을 관리합니다. 우측 상단 필터 목록은 이 권한 기준으로 제한됩니다." action={<CloudButton><Plus className="size-4" />사용자 추가</CloudButton>} />
      <CuteCard>
        <DataTable
          headers={["이름", "이메일", "역할", "부서 권한", "화주 권한", "사용여부"]}
          rows={users.map((user) => [
            <span key="name" className="font-black text-slate-800">{user.name}</span>,
            user.email,
            roleLabels[user.role],
            departments.filter((department) => user.department_ids.includes(department.id)).map((department) => department.name).join(", "),
            shippers.filter((shipper) => user.shipper_ids.includes(shipper.id)).map((shipper) => shipper.name).join(", "),
            user.is_active ? "사용" : "중지"
          ])}
        />
      </CuteCard>
    </>
  );
}
