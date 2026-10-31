"use client";

import { ChangeEvent, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { useMobileScope } from "@/lib/mobile/mobile-api";
import { cn } from "@/lib/utils/cn";
import type { WorkStatus } from "@/lib/types/domain";
import type { InspectionWithVerificationDto, PhotoReviewItemDto, PhotoSubmitResponse } from "@/lib/types/work-inspection-api";

type PhotoViewStatus = "pending" | "submitted" | "approved" | "rejected";

// 검수 행 상태(authoritative) → 카드 표시 상태. 승인(passed/admin_approved)·반려·승인대기 외는 모두 대기로 본다.
function toViewStatus(status: string): PhotoViewStatus {
  if (status === "admin_approved" || status === "passed") return "approved";
  if (status === "submitted") return "submitted";
  if (status === "rejected") return "rejected";
  return "pending";
}

const viewStatusLabel: Record<PhotoViewStatus, string> = {
  pending: "대기",
  submitted: "승인대기",
  approved: "승인",
  rejected: "반려"
};

const viewStatusTone: Record<PhotoViewStatus, string> = {
  pending: "bg-slate-100 text-slate-700 ring-slate-500/20",
  submitted: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20"
};

// 사진검수(PHOTO) 항목 1개: 제품 1건 또는 사진검수 대상 부자재 1건당 사진 1장을 촬영·제출하고 관리자 승인을 기다린다.
// 승인대기 전(작업이 admin_review_requested가 되기 전)에는 제출 사진을 교체할 수 있고, 반려되면 사유를 보여주고 재촬영한다.
// 상태는 검수 행(inspection.status)을 기준으로, 사진 URL·반려 사유는 GET /api/work-inspection/photo 항목(item)으로 보강한다.
export function PhotoReviewCard({
  workId,
  inspection,
  item,
  eyebrow,
  title,
  codeText,
  lotText,
  locked,
  onSubmitted
}: {
  workId: string;
  inspection: InspectionWithVerificationDto;
  item?: PhotoReviewItemDto;
  eyebrow: string;
  title: string;
  codeText?: string;
  lotText?: string;
  // 작업이 관리자 승인 검토 중(admin_review_requested)이면 촬영을 잠근다.
  locked: boolean;
  onSubmitted: () => Promise<unknown> | void;
}) {
  const scope = useMobileScope();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  const viewStatus = toViewStatus(inspection.status);
  const photoUrl = item?.photo?.url || uploadedUrl;
  const reason = viewStatus === "rejected" ? item?.reviewComment || inspection.review_comment : undefined;
  const canCapture = !locked && viewStatus !== "approved";
  const hasPhoto = viewStatus === "submitted" || viewStatus === "rejected" || viewStatus === "approved";
  const captureLabel = viewStatus === "rejected" ? "다시 촬영" : viewStatus === "submitted" ? "사진 교체" : "촬영";

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
      const compressedFile = new File([compressed], `photo-${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now()
      });

      const formData = new FormData();
      formData.append("departmentId", scope.departmentId);
      formData.append("shipperId", scope.shipperId);
      formData.append("workId", workId);
      formData.append("inspectionId", inspection.id);
      formData.append("image", compressedFile);

      const response = await fetch("/api/work-inspection/photo", { method: "POST", body: formData });
      const payload = (await response.json()) as Partial<PhotoSubmitResponse> & { error?: string };

      if (!response.ok || payload.error) throw new Error(payload.error ?? "사진 제출에 실패했습니다.");

      setUploadedUrl(payload.photo?.url ?? "");
      await onSubmitted();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "사진 제출에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <CuteCard className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-foreground">{title}</h3>
          {(codeText || lotText) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[codeText, lotText ? `LOT ${lotText}` : ""].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <span className={cn("shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", viewStatusTone[viewStatus])}>
          {viewStatusLabel[viewStatus]}
        </span>
      </div>

      {viewStatus === "rejected" && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-700">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            관리자가 반려했습니다. 다시 촬영해 제출하세요.
          </p>
          <p className="mt-1">반려 사유: {reason || "사유가 입력되지 않았습니다."}</p>
        </div>
      )}

      {hasPhoto && photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={`${title} 제출 사진`}
          className={cn(
            "mb-3 rounded-md object-cover ring-1",
            viewStatus === "rejected" ? "h-24 w-24 opacity-70 ring-red-200" : "max-h-64 w-full ring-border"
          )}
        />
      )}

      {viewStatus === "submitted" && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
          <Clock className="size-4 shrink-0" />
          {locked ? "관리자 승인 대기 중입니다. 승인 결과를 기다려 주세요." : "제출 완료 · 관리자 승인 대기 중입니다. 승인대기 전까지 사진을 교체할 수 있습니다."}
        </div>
      )}

      {viewStatus === "approved" && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium leading-5 text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />
          관리자가 승인했습니다.
        </div>
      )}

      {locked && viewStatus !== "approved" && viewStatus !== "submitted" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs font-medium leading-5 text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          작업이 관리자 승인 검토 중이라 지금은 촬영할 수 없습니다.
        </div>
      )}

      {canCapture && (
        <label
          className={cn(
            "flex min-h-13 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium shadow-xs transition-colors",
            uploading
              ? "cursor-not-allowed bg-slate-300 text-white"
              : viewStatus === "submitted"
                ? "border border-input bg-card text-foreground"
                : "bg-primary text-primary-foreground"
          )}
        >
          {viewStatus === "rejected" || viewStatus === "submitted" ? <RotateCcw className="size-4" /> : <Camera className="size-4" />}
          {uploading ? "제출 중..." : captureLabel}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={uploading}
            className="sr-only"
            onChange={(event) => void capture(event)}
            aria-label={`${title} ${captureLabel}`}
          />
        </label>
      )}

      {uploadError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium leading-6 text-red-700">{uploadError}</div>
      )}
    </CuteCard>
  );
}

// 사진검수 진행 요약 배너(제출 n/m · 승인 k · 반려 r) + 작업 상태 안내. 사진검수 항목이 없으면 렌더링하지 않는다.
export function PhotoReviewSummaryBanner({
  photoInspections,
  workStatus
}: {
  photoInspections: { status: string }[];
  workStatus: WorkStatus;
}) {
  const total = photoInspections.length;
  if (total === 0) return null;

  const statuses = photoInspections.map((inspection) => toViewStatus(inspection.status));
  const submitted = statuses.filter((status) => status !== "pending" && status !== "rejected").length;
  const approved = statuses.filter((status) => status === "approved").length;
  const rejected = statuses.filter((status) => status === "rejected").length;
  const underReview = workStatus === "admin_review_requested";

  return (
    <CuteCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">사진검수</h3>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          제출 {submitted}/{total} · 승인 {approved} · 반려 {rejected}
        </span>
      </div>
      {underReview && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
          관리자 승인 대기 중입니다. 승인 또는 반려 결과가 나올 때까지 촬영이 잠겨 있습니다.
        </p>
      )}
      {!underReview && rejected > 0 && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-700">
          반려된 사진이 {rejected}건 있습니다. 반려 사유를 확인하고 다시 촬영해 제출하세요.
        </p>
      )}
    </CuteCard>
  );
}
