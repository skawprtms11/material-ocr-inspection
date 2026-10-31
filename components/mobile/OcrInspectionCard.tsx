"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, RotateCcw, ScanText, XCircle } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { OcrTextCompare } from "@/components/inspection/OcrTextCompare";
import { TouchRegionSelector } from "@/components/mobile/TouchRegionSelector";
import { useMobileScope } from "@/lib/mobile/mobile-api";
import { cropImageFile, loadImage } from "@/lib/utils/image-crop";
import { cn } from "@/lib/utils/cn";
import type { MaterialInspectionRegion, MaterialMaster, RoiRect } from "@/lib/types/domain";
import type { InspectionWithVerificationDto } from "@/lib/types/work-inspection-api";

type RegistrationRegion = MaterialInspectionRegion & { imageUrls: string[] };

type RegistrationResponse = {
  source?: "supabase" | "mock";
  regions?: RegistrationRegion[];
  error?: string;
};

type OcrSubmitResponse = {
  status?: string;
  recognizedText?: string;
  expectedValue?: string;
  expectedSource?: "work" | "master" | "none";
  matched?: boolean;
  matchRate?: number;
  threshold?: number;
  judgement?: "passed" | "below_threshold";
  canVerify?: boolean;
  saved?: boolean;
  evidenceSaved?: boolean;
  error?: string;
};

type ReviewActionResponse = {
  error?: string;
};

function GuideRoiOverlay({ imageUrl, roi }: { imageUrl: string; roi: RoiRect }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="기준 사진" className="block w-full max-w-full" />
      <div
        className="absolute rounded-md border-2 border-blue-500 bg-blue-400/20 shadow-sm"
        style={{ left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.width}%`, height: `${roi.height}%` }}
      />
    </div>
  );
}

function statusLabel(status?: string) {
  if (status === "passed" || status === "admin_approved") return "합격";
  if (status === "failed" || status === "retrying") return "불합격";
  if (status === "admin_requested") return "확인요청";
  return "대기";
}

function statusTone(status?: string) {
  if (status === "passed" || status === "admin_approved") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "failed" || status === "retrying") return "bg-red-50 text-red-700 ring-red-600/20";
  if (status === "admin_requested") return "bg-amber-50 text-amber-800 ring-amber-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
}

export function OcrInspectionCard({
  workId,
  inspection,
  material,
  index,
  onSubmitted
}: {
  workId: string;
  inspection: InspectionWithVerificationDto;
  material?: MaterialMaster;
  index: number;
  onSubmitted: () => Promise<unknown> | void;
}) {
  const scope = useMobileScope();
  const [guideLoading, setGuideLoading] = useState(true);
  const [guideError, setGuideError] = useState("");
  const [region, setRegion] = useState<RegistrationRegion | null>(null);

  // 촬영 원본 → 사용자가 위치를 조정하는 단계에서 쓰는 상태
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [rawPreviewUrl, setRawPreviewUrl] = useState("");
  const [rawImageSize, setRawImageSize] = useState<{ width: number; height: number } | null>(null);
  const [adjustRoi, setAdjustRoi] = useState<RoiRect | null>(null);

  // 위치 확정 후 크롭 미리보기 단계에서 쓰는 상태
  const [previewUrl, setPreviewUrl] = useState("");
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [cropError, setCropError] = useState("");

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<OcrSubmitResponse | null>(null);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setGuideLoading(true);
    setGuideError("");

    fetch(`/api/material-master/registration?${new URLSearchParams({ material_id: inspection.material_id, department_id: scope.departmentId, shipper_id: scope.shipperId }).toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: RegistrationResponse) => {
        if (cancelled) return;
        if (payload.error) throw new Error(payload.error);
        const ocrRegion = (payload.regions ?? []).find((item) => item.method === "OCR" && item.imageUrls.length > 0);
        setRegion(ocrRegion ?? null);
      })
      .catch((error) => {
        if (!cancelled) setGuideError(error instanceof Error ? error.message : "기준 사진을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setGuideLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inspection.material_id, scope.departmentId, scope.shipperId]);

  useEffect(() => {
    return () => {
      if (rawPreviewUrl) URL.revokeObjectURL(rawPreviewUrl);
    };
  }, [rawPreviewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 판정 기준 텍스트는 서버가 해석한 값(작업 지정 → 마스터)만 표시한다(표시값과 판정값 일치).
  const expectedValue = inspection.ocrExpectedText ?? "";
  const expectedSource = inspection.ocrExpectedSource;
  const noText = expectedSource === "none";
  const guideImageUrl = region?.imageUrls[0];

  const resetAll = () => {
    if (rawPreviewUrl) URL.revokeObjectURL(rawPreviewUrl);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRawFile(null);
    setRawPreviewUrl("");
    setRawImageSize(null);
    setAdjustRoi(null);
    setPreviewUrl("");
    setCroppedFile(null);
    setCropError("");
    setSubmitError("");
    setResult(null);
  };

  const capture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !region) return;

    if (rawPreviewUrl) URL.revokeObjectURL(rawPreviewUrl);
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSubmitError("");
    setCropError("");
    setResult(null);
    setPreviewUrl("");
    setCroppedFile(null);

    try {
      const nextUrl = URL.createObjectURL(file);
      const image = await loadImage(nextUrl);
      setRawFile(file);
      setRawPreviewUrl(nextUrl);
      setRawImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setAdjustRoi({ ...region.roi });
    } catch (error) {
      setCropError(error instanceof Error ? error.message : "촬영 이미지를 불러오지 못했습니다.");
    }
  };

  const confirmPosition = async () => {
    if (!rawFile || !adjustRoi) return;

    setCropError("");

    try {
      const cropped = await cropImageFile(rawFile, adjustRoi, "ocr-capture");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(cropped.file));
      setCroppedFile(cropped.file);
    } catch (error) {
      setCropError(error instanceof Error ? error.message : "촬영 이미지를 처리하지 못했습니다.");
    }
  };

  const adjustAgain = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setCroppedFile(null);
    setResult(null);
    setSubmitError("");
  };

  const submit = async () => {
    if (!croppedFile || !adjustRoi) return;

    setSubmitLoading(true);
    setSubmitError("");

    try {
      const formData = new FormData();
      formData.append("departmentId", scope.departmentId);
      formData.append("shipperId", scope.shipperId);
      formData.append("inspectionId", inspection.id);
      formData.append("workId", workId);
      formData.append("image", croppedFile);
      formData.append("roi", JSON.stringify(adjustRoi));

      const response = await fetch("/api/work-inspection/ocr", { method: "POST", body: formData });
      const payload = (await response.json()) as OcrSubmitResponse;

      if (!response.ok) throw new Error(payload.error ?? "OCR 검수 저장에 실패했습니다.");

      setResult(payload);
      // 합격 저장 또는 기준 미달 증거 저장 시 서버 데이터가 바뀌므로 재조회한다(판정 불가는 변경 없음).
      if (payload.saved || payload.evidenceSaved) {
        await onSubmitted();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "OCR 검수 저장에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  // 검수 취소(실패 후)와 확인요청(진행 중 특이사항)은 모두 request_review 액션을 공유한다. label로 저장 사유의
  // 접두어만 구분한다.
  const submitReviewRequest = async (label: string, confirmText: string, promptLabel: string, autoReason?: string) => {
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    const memo = window.prompt(promptLabel, "");
    const trimmedMemo = [autoReason, memo && memo.trim() ? memo.trim() : undefined].filter(Boolean).join(" / ") || undefined;

    setCancelLoading(true);
    setCancelError("");

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...scope,
          workId,
          action: { type: "request_review", inspectionId: inspection.id, reason: trimmedMemo, label }
        })
      });
      const payload = (await response.json()) as ReviewActionResponse;

      if (!response.ok) throw new Error(payload.error ?? "확인요청 처리에 실패했습니다.");

      await onSubmitted();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "확인요청 처리에 실패했습니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const requestCancel = () =>
    submitReviewRequest(
      "현장 검수 취소 요청",
      "검수를 취소하고 관리자 확인을 요청하시겠습니까?",
      "취소 사유를 입력하세요 (선택, 비워두면 기본 사유로 저장됩니다)"
    );

  const requestReview = () =>
    submitReviewRequest(
      "현장 확인요청",
      "특이사항을 관리자에게 확인 요청하시겠습니까?",
      "확인요청 사유를 입력하세요 (선택, 비워두면 기본 사유로 저장됩니다)"
    );

  const requestNoGuideReview = () =>
    submitReviewRequest(
      noText ? "기준 텍스트 미등록 확인요청" : "기준 미등록 확인요청",
      noText
        ? "OCR 기준 텍스트가 없어 검수를 진행할 수 없습니다. 관리자에게 확인을 요청하시겠습니까?"
        : "기준 사진이 없어 OCR 검수를 진행할 수 없습니다. 관리자에게 확인을 요청하시겠습니까?",
      "확인요청 사유를 입력하세요 (선택, 비워두면 기본 사유로 저장됩니다)"
    );

  // 판정 결과: 방금 판정한 값이 있으면 그것, 없으면 서버에 남은 최근 판정(새로고침 후에도 유지).
  const persistedRate =
    inspection.ocr_match_rate != null && ["pending", "retrying", "failed", "passed"].includes(inspection.status)
      ? inspection.ocr_match_rate
      : undefined;
  const judged = result != null && result.canVerify !== false && typeof result.matchRate === "number";
  const shownRate = judged ? result.matchRate : persistedRate;
  const shownThreshold = (judged ? result.threshold : undefined) ?? inspection.ocrThreshold;
  const shownRecognized = judged ? result.recognizedText : inspection.ocr_result_text;
  const shownExpected = (judged ? result.expectedValue : undefined) || expectedValue;
  const belowThreshold = judged ? result.judgement === "below_threshold" : persistedRate !== undefined && inspection.status !== "passed";
  const matchedNow = judged && result.judgement === "passed";

  const requestBelowThreshold = () => {
    const rateNote = `일치율 ${shownRate}% (기준 ${shownThreshold ?? 90}%)`;
    return submitReviewRequest(
      "OCR 일치율 미달 확인요청",
      `${rateNote}로 기준에 미달했습니다. 관리자에게 확인을 요청하시겠습니까?`,
      "추가 사유를 입력하세요 (선택, 일치율은 자동으로 포함됩니다)",
      rateNote
    );
  };

  // 기준 사진/텍스트가 없으면 촬영 UI가 열리지 않아 재검수로는 진행할 수 없다. 이때는 상태와 관계없이
  // 관리자 확인요청 버튼을 항상 노출해 관리자 조정승인으로 진행할 수 있게 한다.
  const noGuide = !guideLoading && (Boolean(guideError) || !guideImageUrl || noText);
  const showFailureActions =
    !noGuide && (belowThreshold || inspection.status === "failed" || inspection.status === "retrying");
  const canRequestReview = inspection.status !== "admin_requested" && !showFailureActions;

  return (
    <CuteCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">부자재 {index + 1} · OCR 검수</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{material?.name ?? inspection.material_id}</h3>
          <p className="mt-1 text-xs text-muted-foreground">부자재코드 {material?.code ?? "-"}</p>
        </div>
        <span className={cn("shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", statusTone(inspection.status))}>
          {statusLabel(inspection.status)}
        </span>
      </div>

      {canRequestReview && (
        <CloudButton
          tone={noGuide ? "warning" : "soft"}
          className="mb-3 min-h-12 w-full"
          disabled={cancelLoading}
          onClick={() => void (noGuide ? requestNoGuideReview() : requestReview())}
        >
          <AlertTriangle className="size-4" />
          {cancelLoading ? "요청 중..." : noGuide ? "관리자 확인요청 (기준 미등록)" : "확인요청"}
        </CloudButton>
      )}

      {guideLoading && (
        <div className="rounded-md bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          기준 사진을 불러오는 중입니다.
        </div>
      )}

      {noText && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>기준 텍스트 미등록 — 작업등록 또는 부자재등록에서 OCR 텍스트를 등록하세요. 현장에서는 관리자 확인요청을 눌러 주세요.</span>
        </div>
      )}

      {!noText && !guideLoading && (guideError || !guideImageUrl) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{guideError || "기준 사진 미등록 — 부자재등록에서 먼저 등록하세요."}</span>
        </div>
      )}

      {!guideLoading && guideImageUrl && region && !noText && (
        <>
          <p className="mb-2 text-xs font-medium text-muted-foreground">표시된 위치가 보이도록 촬영하세요</p>
          <GuideRoiOverlay imageUrl={guideImageUrl} roi={region.roi} />
          <p className="mt-2 text-xs font-medium text-emerald-700">
            등록 텍스트 {expectedValue || "-"}
            {expectedSource && (
              <span className="ml-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                {expectedSource === "work" ? "작업지정" : "마스터"}
              </span>
            )}
          </p>

          {/* 1단계: 촬영 */}
          {!rawFile && (
            <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs">
              <Camera className="size-4" />
              촬영
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={capture}
                aria-label={`${material?.name ?? "부자재"} OCR 촬영`}
              />
            </label>
          )}

          {/* 2단계: 촬영한 사진 위에서 위치 조정 */}
          {rawFile && !croppedFile && adjustRoi && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">인식할 위치를 드래그/리사이즈로 조정한 뒤 확정하세요</p>
              <TouchRegionSelector
                rect={adjustRoi}
                onChange={setAdjustRoi}
                defaultRect={region.roi}
                aspectRatio={rawImageSize ? `${rawImageSize.width} / ${rawImageSize.height}` : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={rawPreviewUrl} alt="촬영 원본" className="pointer-events-none h-full w-full object-contain" />
              </TouchRegionSelector>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <CloudButton tone="soft" className="min-h-12" onClick={resetAll}>
                  <RotateCcw className="size-4" />
                  다시 촬영
                </CloudButton>
                <CloudButton className="min-h-12" onClick={confirmPosition}>
                  <CheckCircle2 className="size-4" />
                  위치 확정
                </CloudButton>
              </div>
            </div>
          )}

          {/* 3단계: 확정된 위치로 크롭한 미리보기 + 검수 실행 */}
          {croppedFile && previewUrl && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">촬영한 영역 미리보기</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="촬영 미리보기" className="w-full max-w-full rounded-lg border border-border" />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <CloudButton tone="soft" className="min-h-12" disabled={submitLoading} onClick={adjustAgain}>
                  <RotateCcw className="size-4" />
                  위치 다시 조정
                </CloudButton>
                <CloudButton className="min-h-12" disabled={submitLoading} onClick={submit}>
                  <ScanText className="size-4" />
                  {submitLoading ? "검수 중..." : "검수 실행"}
                </CloudButton>
              </div>
            </div>
          )}
        </>
      )}

      {cropError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium leading-6 text-red-700">{cropError}</div>
      )}

      {submitError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium leading-6 text-red-700">{submitError}</div>
      )}

      {result && result.canVerify === false && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            OCR 서버 미설정 — 판정 불가
          </p>
        </div>
      )}

      {shownRate !== undefined && (
        <div
          className={cn(
            "mt-3 rounded-md border p-3 text-sm font-medium leading-6",
            belowThreshold ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}
        >
          <p className="flex items-center gap-2 text-xs font-semibold">
            {belowThreshold ? (
              <>
                <XCircle className="size-4" />
                {judged ? "일치율 미달 — 재촬영하거나 관리자 확인을 요청하세요" : "최근 판정 미달 — 재촬영하거나 관리자 확인을 요청하세요"}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                {matchedNow ? "합격 · 저장 완료" : "합격"}
              </>
            )}
          </p>
          <OcrTextCompare
            className="mt-2 text-foreground"
            expectedText={shownExpected}
            expectedSource={expectedSource}
            recognizedText={shownRecognized}
            matchRate={shownRate}
            threshold={shownThreshold}
          />
        </div>
      )}

      {showFailureActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CloudButton tone="soft" className="min-h-12" disabled={cancelLoading} onClick={resetAll}>
            <RotateCcw className="size-4" />
            {belowThreshold ? "재촬영" : "재검수(재촬영)"}
          </CloudButton>
          <CloudButton
            tone={belowThreshold ? "warning" : "danger"}
            className="min-h-12"
            disabled={cancelLoading}
            onClick={() => void (belowThreshold ? requestBelowThreshold() : requestCancel())}
          >
            {belowThreshold ? <AlertTriangle className="size-4" /> : <XCircle className="size-4" />}
            {cancelLoading ? "요청 중..." : belowThreshold ? "관리자 확인요청" : "검수 취소"}
          </CloudButton>
        </div>
      )}

      {inspection.status === "admin_requested" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          관리자 확인 대기 중입니다. 관리자 처리 결과를 기다려 주세요.
        </div>
      )}

      {cancelError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium leading-6 text-red-700">{cancelError}</div>
      )}
    </CuteCard>
  );
}
