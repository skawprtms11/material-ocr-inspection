"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { cn } from "@/lib/utils/cn";
import type { InspectionWithVerificationDto } from "@/lib/types/work-inspection-api";

type CompletionPhotoResponse = {
  status?: string;
  resultSummary?: string;
  error?: string;
};

type ReviewActionResponse = {
  error?: string;
};

type RegistrationRegion = { method?: string; imageUrls?: string[] };
type RegistrationResponse = { regions?: RegistrationRegion[]; error?: string };

function statusLabel(status?: string) {
  if (status === "passed" || status === "admin_approved") return "저장완료";
  if (status === "admin_requested") return "확인요청";
  return "대기";
}

function statusTone(status?: string) {
  if (status === "passed" || status === "admin_approved") return "bg-emerald-100 text-emerald-700";
  if (status === "admin_requested") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

// 체크리스트 없이 사진 1장을 촬영하면 압축 후 즉시 서버에 저장·합격 처리한다.
// "완료제품사진"(work 단위, material 없음)과 부자재 비전검수 항목(시작검수·완료검수 공통)이 이 컴포넌트를
// 공유한다. materialId가 있으면 부자재등록에서 저장된 비전 참고 이미지를 먼저 보여준다(마스터에 등록된
// 기준 사진과 비교해 촬영할 수 있도록 안내 목적, 자동 판정에는 쓰지 않는다).
export function CompletionPhotoCard({
  workId,
  inspection,
  title,
  subtitle,
  materialId,
  onSubmitted
}: {
  workId: string;
  inspection: InspectionWithVerificationDto;
  title: string;
  subtitle?: string;
  materialId?: string;
  onSubmitted: () => Promise<void> | void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(Boolean(materialId));

  useEffect(() => {
    if (!materialId) return;

    let cancelled = false;
    setReferenceLoading(true);

    fetch(`/api/material-master/registration?material_id=${materialId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: RegistrationResponse) => {
        if (cancelled) return;
        const visionRegion = (payload.regions ?? []).find((item) => item.method === "VISION" && (item.imageUrls?.length ?? 0) > 0);
        setReferenceImages(visionRegion?.imageUrls ?? []);
      })
      .catch(() => {
        if (!cancelled) setReferenceImages([]);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const isAdminRequested = inspection.status === "admin_requested";
  const canRequestReview = !isAdminRequested;

  const capture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError("");

    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        useWebWorker: false,
        fileType: "image/jpeg",
        initialQuality: 0.82
      });
      const compressedFile = new File([compressed], `completion-${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now()
      });

      const formData = new FormData();
      formData.append("inspectionId", inspection.id);
      formData.append("workId", workId);
      formData.append("image", compressedFile);

      const response = await fetch("/api/work-inspection/completion-photo", { method: "POST", body: formData });
      const payload = (await response.json()) as CompletionPhotoResponse;

      if (!response.ok) throw new Error(payload.error ?? "완료검수 사진 저장에 실패했습니다.");

      setResultSummary(payload.resultSummary ?? "저장 완료");
      await onSubmitted();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "완료검수 사진 저장에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const requestReview = async () => {
    const confirmed = window.confirm("특이사항을 관리자에게 확인 요청하시겠습니까?");
    if (!confirmed) return;

    const memo = window.prompt("확인요청 사유를 입력하세요 (선택, 비워두면 기본 사유로 저장됩니다)", "");
    const trimmedMemo = memo && memo.trim() ? memo.trim() : undefined;

    setReviewLoading(true);
    setReviewError("");

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          action: { type: "request_review", inspectionId: inspection.id, reason: trimmedMemo, label: "현장 확인요청" }
        })
      });
      const payload = (await response.json()) as ReviewActionResponse;
      if (!response.ok) throw new Error(payload.error ?? "확인요청 처리에 실패했습니다.");

      await onSubmitted();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "확인요청 처리에 실패했습니다.");
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <CuteCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-violet-600">완료검수</p>
          <h3 className="mt-1 text-lg font-black text-slate-800">{title}</h3>
          {subtitle && <p className="mt-1 text-xs font-bold text-slate-400">{subtitle}</p>}
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-black", statusTone(inspection.status))}>
          {statusLabel(inspection.status)}
        </span>
      </div>

      {canRequestReview && (
        <CloudButton tone="soft" className="mb-3 w-full" disabled={reviewLoading} onClick={() => void requestReview()}>
          <AlertTriangle className="size-4" />
          {reviewLoading ? "요청 중..." : "확인요청"}
        </CloudButton>
      )}

      {isAdminRequested && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
          <AlertTriangle className="size-4 shrink-0" />
          관리자 확인 대기 중입니다. 관리자 처리 결과를 기다려주세요.
        </div>
      )}

      {materialId && referenceLoading && (
        <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-center text-xs font-bold text-slate-400">
          비전 참고 사진을 불러오는 중입니다.
        </div>
      )}

      {materialId && !referenceLoading && referenceImages.length === 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          비전 참고 사진 미등록 — 부자재등록에서 먼저 등록하면 아래에 기준 사진이 표시돼요.
        </div>
      )}

      {referenceImages.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-black text-slate-500">등록된 비전 참고 사진(기준)</p>
          <div className="flex gap-2 overflow-x-auto">
            {referenceImages.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt={`${title} 비전 참고 사진 ${index + 1}`}
                className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-sky-200"
              />
            ))}
          </div>
        </div>
      )}

      <label
        className={cn(
          "flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold text-white shadow-sm transition",
          uploading || isAdminRequested ? "cursor-not-allowed bg-slate-300" : "bg-sky-500"
        )}
      >
        <Camera className="size-4" />
        {uploading ? "저장 중..." : "촬영"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={uploading || isAdminRequested}
          className="sr-only"
          onChange={(event) => void capture(event)}
          aria-label={`${title} 촬영`}
        />
      </label>

      {uploadError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{uploadError}</div>
      )}

      {(resultSummary || inspection.status === "passed" || inspection.status === "admin_approved") && !uploadError && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />
          {resultSummary || "저장 완료"}
        </div>
      )}

      {(inspection.status === "passed" || inspection.status === "admin_approved") && !uploading && !isAdminRequested && (
        <p className="mt-2 text-center text-[11px] font-bold text-slate-400">다시 촬영하면 최신 사진으로 덮어씁니다.</p>
      )}

      {reviewError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{reviewError}</div>
      )}
    </CuteCard>
  );
}
