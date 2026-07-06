"use client";

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { appRepository } from "@/lib/repositories/app-repository";

export function AdminReviewPanel() {
  const requests = appRepository.listAdminReviewRequests("requested");

  return (
    <CuteCard className="border-amber-100 bg-amber-50/70">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-amber-700">관리자 확인 요청</p>
          <h2 className="text-lg font-black text-slate-800">현장 판단이 필요한 사진</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700">{requests.length}건</span>
      </div>
      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="rounded-2xl bg-white/70 p-4 text-sm font-bold text-slate-400">확인 요청이 없어요.</div>
        ) : (
          requests.map((request) => {
            const work = appRepository.findWorkById(request.work_id);
            const image = appRepository.listInspectionImages(request.work_id)[0];

            return (
              <div key={request.id} className="rounded-2xl bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-800">{work?.document_no}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{request.reason}</p>
                  </div>
                  <StatusBadge type="admin" status={request.status} />
                </div>
                <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                  Storage path: {image?.storage_path ?? "inspection-images/{workId}/{documentNo}.jpg"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CloudButton tone="success" onClick={() => toast.success("TODO: admin_approved 업데이트")}>
                    <CheckCircle2 className="size-4" />
                    수동 합격 처리
                  </CloudButton>
                  <CloudButton tone="warning" onClick={() => toast.warning("TODO: retry_requested 업데이트")}>
                    <RotateCcw className="size-4" />
                    재검수 요청
                  </CloudButton>
                  <CloudButton tone="danger" onClick={() => toast.error("TODO: rejected 업데이트")}>
                    <XCircle className="size-4" />
                    불합격 유지
                  </CloudButton>
                </div>
              </div>
            );
          })
        )}
      </div>
    </CuteCard>
  );
}
