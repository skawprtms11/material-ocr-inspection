"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Cloud } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { appRepository } from "@/lib/repositories/app-repository";

export default function MobileResultPage() {
  const params = useParams<{ workId: string }>();
  const work = appRepository.findWorkById(params.workId);
  const inspections = appRepository.listInspections(params.workId);
  const passed = inspections.filter((inspection) => inspection.status === "passed").length;
  const failed = inspections.filter((inspection) => inspection.status === "failed").length;
  const adminApproved = inspections.filter((inspection) => inspection.status === "admin_approved").length;
  const signature = appRepository.listSignatures(params.workId)[0];

  useEffect(() => {
    import("canvas-confetti").then((module) => {
      module.default({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
    });
  }, []);

  if (!work) return <CuteCard>작업을 찾지 못했어요.</CuteCard>;

  return (
    <div className="space-y-4 text-center">
      <Cloud className="mx-auto mt-8 size-24 text-sky-300" fill="currentColor" />
      <h1 className="text-3xl font-black text-slate-800">검수 결과</h1>
      <CuteCard className="p-5 text-left">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
          <CheckCircle2 className="size-7" />
          <div>
            <p className="font-black">합격 흐름 완료</p>
            <p className="text-xs font-bold">서명까지 저장 가능한 구조예요.</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="font-black text-slate-400">문서번호</dt>
          <dd className="font-bold text-slate-800">{work.document_no}</dd>
          <dt className="font-black text-slate-400">검수 부자재</dt>
          <dd className="font-bold text-slate-800">{inspections.length}개</dd>
          <dt className="font-black text-slate-400">합격</dt>
          <dd className="font-bold text-emerald-700">{passed}개</dd>
          <dt className="font-black text-slate-400">불합격</dt>
          <dd className="font-bold text-rose-600">{failed}개</dd>
          <dt className="font-black text-slate-400">관리자 승인</dt>
          <dd className="font-bold text-amber-700">{adminApproved}개</dd>
          <dt className="font-black text-slate-400">서명</dt>
          <dd className="font-bold text-slate-800">{signature ? "완료" : "mock 저장"}</dd>
        </dl>
      </CuteCard>
      <Link href="/mobile/scan">
        <CloudButton className="w-full">다음 문서 검수</CloudButton>
      </Link>
    </div>
  );
}
