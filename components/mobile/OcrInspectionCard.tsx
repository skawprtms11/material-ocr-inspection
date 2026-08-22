"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, RotateCcw, ScanText, XCircle } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { TouchRegionSelector } from "@/components/mobile/TouchRegionSelector";
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
  matched?: boolean;
  canVerify?: boolean;
  error?: string;
};

type ReviewActionResponse = {
  error?: string;
};

function GuideRoiOverlay({ imageUrl, roi }: { imageUrl: string; roi: RoiRect }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="기준 사진" className="block w-full max-w-full" />
      <div
        className="absolute rounded-md border-2 border-sky-500 bg-sky-400/20 shadow-sm"
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
  if (status === "passed" || status === "admin_approved") return "bg-emerald-100 text-emerald-700";
  if (status === "failed" || status === "retrying") return "bg-rose-100 text-rose-700";
  if (status === "admin_requested") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
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
  onSubmitted: () => Promise<void> | void;
}) {
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

    fetch(`/api/material-master/registration?material_id=${inspection.material_id}`, { cache: "no-store" })
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
  }, [inspection.material_id]);

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

  const expectedValue = material?.verification_value || region?.expected_text || "";
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
      formData.append("inspectionId", inspection.id);
      formData.append("workId", workId);
      formData.append("image", croppedFile);
      formData.append("roi", JSON.stringify(adjustRoi));

      const response = await fetch("/api/work-inspection/ocr", { method: "POST", body: formData });
      const payload = (await response.json()) as OcrSubmitResponse;

      if (!response.ok) throw new Error(payload.error ?? "OCR 검수 저장에 실패했습니다.");

      setResult(payload);
      await onSubmitted();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "OCR 검수 저장에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const requestCancel = async () => {
    const confirmed = window.confirm("검수를 취소하고 관리자 확인을 요청하시겠습니까?");
    if (!confirmed) return;

    const memo = window.prompt("취소 사유를 입력하세요 (선택, 비워두면 기본 사유로 저장됩니다)", "");
    const trimmedMemo = memo && memo.trim() ? memo.trim() : undefined;

    setCancelLoading(true);
    setCancelError("");

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          action: { type: "request_review", inspectionId: inspection.id, reason: trimmedMemo }
        })
      });
      const payload = (await response.json()) as ReviewActionResponse;

      if (!response.ok) throw new Error(payload.error ?? "검수 취소 요청에 실패했습니다.");

      await onSubmitted();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "검수 취소 요청에 실패했습니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const showFailureActions = inspection.status === "failed" || inspection.status === "retrying";

  return (
    <CuteCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-sky-600">부자재 {index + 1} · OCR 검수</p>
          <h3 className="mt-1 text-lg font-black text-slate-800">{material?.name ?? inspection.material_id}</h3>
          <p className="mt-1 text-xs font-bold text-slate-400">부자재코드 {material?.code ?? "-"}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-xs font-black", statusTone(inspection.status))}>
          {statusLabel(inspection.status)}
        </span>
      </div>

      {guideLoading && (
        <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
          기준 사진을 불러오는 중입니다.
        </div>
      )}

      {!guideLoading && (guideError || !guideImageUrl) && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{guideError || "기준 사진 미등록 — 부자재등록에서 먼저 등록하세요."}</span>
        </div>
      )}

      {!guideLoading && guideImageUrl && region && (
        <>
          <p className="mb-2 text-xs font-black text-slate-500">표시된 위치가 보이도록 촬영하세요</p>
          <GuideRoiOverlay imageUrl={guideImageUrl} roi={region.roi} />
          <p className="mt-2 text-xs font-bold text-emerald-600">검증값 {expectedValue || "-"}</p>

          {/* 1단계: 촬영 */}
          {!rawFile && (
            <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-sky-500 px-4 text-sm font-extrabold text-white shadow-sm">
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
              <p className="mb-2 text-xs font-black text-slate-500">인식할 위치를 드래그/리사이즈로 조정한 뒤 확정하세요</p>
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
                <CloudButton tone="soft" onClick={resetAll}>
                  <RotateCcw className="size-4" />
                  다시 촬영
                </CloudButton>
                <CloudButton onClick={confirmPosition}>
                  <CheckCircle2 className="size-4" />
                  위치 확정
                </CloudButton>
              </div>
            </div>
          )}

          {/* 3단계: 확정된 위치로 크롭한 미리보기 + 검수 실행 */}
          {croppedFile && previewUrl && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-black text-slate-500">촬영한 영역 미리보기</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="촬영 미리보기" className="w-full max-w-full rounded-2xl border border-sky-200" />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <CloudButton tone="soft" disabled={submitLoading} onClick={adjustAgain}>
                  <RotateCcw className="size-4" />
                  위치 다시 조정
                </CloudButton>
                <CloudButton disabled={submitLoading} onClick={submit}>
                  <ScanText className="size-4" />
                  {submitLoading ? "검수 중..." : "검수 실행"}
                </CloudButton>
              </div>
            </div>
          )}
        </>
      )}

      {cropError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{cropError}</div>
      )}

      {submitError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{submitError}</div>
      )}

      {result && (
        <div
          className={cn(
            "mt-3 rounded-2xl p-3 text-sm font-bold leading-6",
            result.canVerify === false
              ? "bg-amber-50 text-amber-700"
              : result.matched
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
          )}
        >
          <p className="flex items-center gap-2 text-xs font-black">
            {result.canVerify === false ? (
              <>
                <AlertTriangle className="size-4" />
                OCR 서버 미설정 — 판정 불가
              </>
            ) : result.matched ? (
              <>
                <CheckCircle2 className="size-4" />
                합격
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                불합격
              </>
            )}
          </p>
          <p className="mt-1 text-xs">인식값: {result.recognizedText || "-"}</p>
          <p className="mt-1 text-xs">기대값: {result.expectedValue || "-"}</p>
        </div>
      )}

      {showFailureActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CloudButton tone="soft" disabled={cancelLoading} onClick={resetAll}>
            <RotateCcw className="size-4" />
            재검수(재촬영)
          </CloudButton>
          <CloudButton tone="danger" disabled={cancelLoading} onClick={requestCancel}>
            <XCircle className="size-4" />
            {cancelLoading ? "요청 중..." : "검수 취소"}
          </CloudButton>
        </div>
      )}

      {inspection.status === "admin_requested" && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
          <AlertTriangle className="size-4 shrink-0" />
          관리자 확인 대기 중입니다. 관리자 처리 결과를 기다려주세요.
        </div>
      )}

      {cancelError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{cancelError}</div>
      )}
    </CuteCard>
  );
}
