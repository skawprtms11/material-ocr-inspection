"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { findInspectionById, useMobileInspectionRows } from "@/lib/mobile/mobile-api";

export default function MobileResultPage() {
  const params = useParams<{ workId: string }>();
  const { data: rows, source, isLoading } = useMobileInspectionRows();
  const row = findInspectionById(rows, params.workId);
  const work = row?.work;
  const inspections = row?.inspections ?? [];
  const passed = inspections.filter((inspection) => inspection.status === "passed").length;
  const failed = inspections.filter((inspection) => inspection.status === "failed").length;
  const adminApproved = inspections.filter((inspection) => inspection.status === "admin_approved").length;

  if (isLoading) return <CuteCard>검수 결과를 불러오는 중입니다.</CuteCard>;
  if (!work) return <CuteCard>작업을 찾을 수 없습니다.</CuteCard>;

  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="mx-auto mt-8 size-16 text-emerald-600" />
      <h1 className="text-lg font-semibold text-foreground">검수 결과</h1>
      <CuteCard className="p-5 text-left">
        <div className="mb-4 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
          <CheckCircle2 className="size-7" />
          <div>
            <p className="font-semibold">합격 흐름 완료</p>
            <p className="text-xs font-medium">서명까지 저장할 수 있는 구조입니다.</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="font-medium text-muted-foreground">문서번호</dt>
          <dd className="font-medium text-foreground">{work.document_no}</dd>
          <dt className="font-medium text-muted-foreground">검수 부자재</dt>
          <dd className="font-medium text-foreground">{inspections.length}개</dd>
          <dt className="font-medium text-muted-foreground">합격</dt>
          <dd className="font-medium text-emerald-700">{passed}개</dd>
          <dt className="font-medium text-muted-foreground">불합격</dt>
          <dd className="font-medium text-red-600">{failed}개</dd>
          <dt className="font-medium text-muted-foreground">관리자 승인</dt>
          <dd className="font-medium text-amber-700">{adminApproved}개</dd>
          <dt className="font-medium text-muted-foreground">데이터</dt>
          <dd className="font-medium text-foreground">{source === "supabase" ? "Supabase" : "Mock/Fallback"}</dd>
        </dl>
      </CuteCard>
      <Link href="/mobile/scan">
        <CloudButton className="min-h-12 w-full">다음 문서 검수</CloudButton>
      </Link>
    </div>
  );
}
