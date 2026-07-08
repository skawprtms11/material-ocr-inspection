"use client";

import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { CuteCard } from "@/components/common/CuteCard";
import { SignaturePad } from "@/components/mobile/SignaturePad";
import { findInspectionById, useMobileInspectionRows } from "@/lib/mobile/mobile-api";

export default function MobileSignPage() {
  const router = useRouter();
  const params = useParams<{ workId: string }>();
  const { data: rows, source, isLoading } = useMobileInspectionRows();
  const row = findInspectionById(rows, params.workId);
  const work = row?.work;

  if (isLoading) return <CuteCard>작업자 서명 데이터를 불러오는 중이에요.</CuteCard>;
  if (!work) return <CuteCard>작업을 찾지 못했어요.</CuteCard>;

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-sky-600">작업자 서명</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">{work.document_no}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          서명 이미지는 signatures bucket의 signatures/{work.id}/worker-signature.png 구조로 저장됩니다.
        </p>
        <p className="mt-2 text-xs font-black text-slate-400">
          데이터: {source === "supabase" ? "Supabase" : "Mock/Fallback"}
        </p>
      </CuteCard>
      <CuteCard className="p-4">
        <SignaturePad
          onSave={() => {
            toast.success("서명 저장 mock 완료");
            router.push(`/mobile/result/${work.id}`);
          }}
        />
      </CuteCard>
    </div>
  );
}
