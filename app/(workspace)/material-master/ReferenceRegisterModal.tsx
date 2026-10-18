"use client";

import { AlertTriangle, Loader2, ScanText, Save, ScanEye, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { TouchRegionSelector } from "@/components/mobile/TouchRegionSelector";
import { compareVisionRegions } from "@/lib/inspection/vision-signature";
import { useFilterStore } from "@/lib/state/filter-store";
import type { MaterialMaster, RoiRect } from "@/lib/types/domain";
import { cropImageFile } from "@/lib/utils/image-crop";
import { cn } from "@/lib/utils/cn";
import { PasteImageInput, type PickedImage } from "./PasteImageInput";
import type { ReferenceMethod } from "./reference-status";

const defaultRect: RoiRect = { x: 18, y: 24, width: 56, height: 22 };
const fullRoi: RoiRect = { x: 0, y: 0, width: 100, height: 100 };
const visionMaxImages = 5;

type OcrResult = { provider: string; extractedText: string; canVerify: boolean; matched: boolean; key: string };
type VisionResult = { average: number; minimum: number; key: string };

function rectKey(rect: RoiRect) {
  return [rect.x, rect.y, rect.width, rect.height].map((value) => value.toFixed(1)).join(",");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "material";
}

export function ReferenceRegisterModal({
  material,
  method,
  previousRoi,
  onClose,
  onSaved
}: {
  material: MaterialMaster;
  method: ReferenceMethod;
  // 값이 있으면 재등록 모드(저장 시 기존 기준을 교체한다)
  previousRoi?: RoiRect;
  onClose: () => void;
  onSaved: (material: MaterialMaster) => void;
}) {
  const { departmentId, shipperId } = useFilterStore();
  const isOcr = method === "OCR";
  const isReregister = Boolean(previousRoi);
  const maxFiles = isOcr ? 1 : visionMaxImages;
  const initialRect = previousRoi ?? defaultRect;

  const [images, setImages] = useState<PickedImage[]>([]);
  const [rect, setRect] = useState<RoiRect>(initialRect);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [verifyValue, setVerifyValue] = useState("");
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const imagesRef = useRef<PickedImage[]>([]);

  imagesRef.current = images;

  useEffect(() => {
    return () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
  }, []);

  const representative = images[0];
  const currentKey = `${representative?.id ?? ""}|${images.map((image) => image.id).join(",")}|${rectKey(rect)}`;
  const ocrStale = Boolean(ocrResult && ocrResult.key !== currentKey);
  const visionStale = Boolean(visionResult && visionResult.key !== currentKey);
  const rawText = ocrResult?.extractedText ?? "";
  const trimmedValue = verifyValue.trim();
  const manualEdited = Boolean(ocrResult) && trimmedValue !== rawText.trim();
  const isMockOcr = Boolean(ocrResult) && (ocrResult?.provider === "mock" || ocrResult?.canVerify === false);

  const canSave = isOcr
    ? Boolean(representative) && Boolean(ocrResult) && trimmedValue.length > 0
    : images.length >= 1;

  const handlePicked = (picked: PickedImage[]) => {
    setSaveError("");
    if (isOcr) {
      images.forEach((image) => URL.revokeObjectURL(image.url));
      setImages(picked.slice(0, 1));
      setOcrResult(null);
      setVerifyValue("");
      setRecognizeError("");
      return;
    }
    setImages((prev) => [...prev, ...picked]);
  };

  const removeImage = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setImages((prev) => prev.filter((image) => image.id !== id));
  };

  const handleRecognize = async () => {
    if (!representative) return;

    setIsRecognizing(true);
    setRecognizeError("");

    try {
      const cropped = await cropImageFile(representative.file, rect, "ocr-roi");
      const formData = new FormData();

      formData.append("image", cropped.file);
      formData.append("isCropped", "true");
      formData.append("roi", JSON.stringify(fullRoi));
      formData.append("originalRoi", JSON.stringify(rect));
      formData.append("expectedText", material.code);
      formData.append("imageWidth", String(cropped.width));
      formData.append("imageHeight", String(cropped.height));
      formData.append("departmentId", departmentId);
      formData.append("shipperId", shipperId);
      formData.append("materialId", material.id);

      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const data = (await response.json()) as Partial<OcrResult> & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "텍스트 인식에 실패했습니다.");

      const extractedText = data.extractedText ?? "";

      setOcrResult({
        provider: data.provider ?? "mock",
        extractedText,
        canVerify: Boolean(data.canVerify),
        matched: Boolean(data.matched),
        key: currentKey
      });
      if (extractedText.trim()) setVerifyValue(extractedText.trim());
    } catch (error) {
      setRecognizeError(error instanceof Error ? error.message : "텍스트 인식에 실패했습니다.");
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleCompare = async () => {
    if (images.length < 2) return;

    setIsRecognizing(true);
    setRecognizeError("");

    try {
      const result = await compareVisionRegions(images.map((image) => ({ file: image.file, rect })));
      setVisionResult({ average: result.average, minimum: result.minimum, key: currentKey });
    } catch (error) {
      setRecognizeError(error instanceof Error ? error.message : "일치율을 계산하지 못했습니다.");
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const formData = new FormData();

      formData.append("departmentId", departmentId);
      formData.append("shipperId", shipperId);
      formData.append("materialId", material.id);
      formData.append("method", method);
      formData.append("expectedText", material.code);
      formData.append("roi", JSON.stringify({ x: round2(rect.x), y: round2(rect.y), width: round2(rect.width), height: round2(rect.height) }));
      formData.append("source", "web");
      if (representative) {
        formData.append("imageWidth", String(representative.width));
        formData.append("imageHeight", String(representative.height));
      }
      images.forEach((image) => formData.append("images", image.file));

      if (isOcr) {
        formData.append("recognizedText", trimmedValue);
        formData.append("ocrRawText", rawText);
      } else if (visionResult && !visionStale) {
        formData.append("similarity", String(visionResult.average));
      }

      const response = await fetch("/api/material-master/registration", { method: "POST", body: formData });
      const data = (await response.json()) as { material?: MaterialMaster; error?: string };

      if (!response.ok || !data.material) {
        const message = data.error ?? "기준 등록에 실패했습니다.";
        throw new Error(response.status === 502 ? `연결 오류 — 다시 시도해주세요. (${message})` : message);
      }

      onSaved(data.material);
      toast.success(`${isOcr ? "OCR" : "비전"} 기준이 ${isReregister ? "재등록" : "등록"}되었습니다.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "기준 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const tone = isOcr ? "sky" : "violet";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={`${isOcr ? "OCR" : "비전"} 기준 ${isReregister ? "재등록" : "등록"}`}
        className="w-full max-w-4xl rounded-[1.4rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={cn("text-xs font-black", isOcr ? "text-sky-600" : "text-violet-600")}>
              {isOcr ? "OCR" : "비전스캔"} 기준 {isReregister ? "재등록" : "등록"}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-normal text-slate-800">
              {material.name} <span className="text-base text-slate-400">{material.code}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {isReregister && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800 ring-1 ring-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            재등록입니다. 저장하면 기존 기준 이미지·영역{isOcr ? "·검증값" : ""}이 교체되고 이전 이미지는 삭제됩니다. 이미지를 새로 붙여넣어야 저장할 수 있어요.
          </div>
        )}

        <div className="grid gap-5">
          <CuteCard>
            <h3 className="mb-1 text-lg font-black text-slate-800">1. 기준 이미지 {isOcr ? "붙여넣기" : `붙여넣기 (1~${visionMaxImages}장)`}</h3>
            <p className="mb-3 text-xs font-semibold text-slate-500">
              {isOcr
                ? "라벨이 보이는 캡처 이미지를 붙여넣으세요. 새로 붙여넣으면 이미지가 교체됩니다."
                : "기준이 될 캡처 이미지를 붙여넣으세요. 여러 장은 반복해서 붙여넣으면 추가됩니다. 첫 번째 이미지가 대표입니다."}
            </p>
            <PasteImageInput
              namePrefix={`${safeSegment(material.code)}-${method.toLowerCase()}`}
              maxFiles={maxFiles}
              currentCount={images.length}
              disabled={isSaving}
              onPicked={handlePicked}
            />
            {!isOcr && images.length > 0 && (
              <ul data-testid="vision-image-list" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {images.map((image, index) => (
                  <li key={image.id} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={`기준 이미지 ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-black text-white">
                      {index === 0 ? "대표 1" : index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`기준 이미지 ${index + 1} 삭제`}
                      onClick={() => removeImage(image.id)}
                      className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow-sm"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CuteCard>

          {representative && (
            <CuteCard>
              <h3 className="mb-1 text-lg font-black text-slate-800">2. 영역 지정</h3>
              <p className="mb-3 text-xs font-semibold text-slate-500">
                박스를 마우스로 끌어 이동하고 모서리를 끌어 크기를 조정하세요.
                {!isOcr && " 대표 이미지에서 지정한 영역이 모든 기준 이미지에 적용됩니다."}
              </p>
              <TouchRegionSelector
                rect={rect}
                onChange={setRect}
                tone={tone}
                aspectRatio={`${representative.width} / ${representative.height}`}
                label={isOcr ? "인식할 영역" : "비교할 영역"}
                defaultRect={initialRect}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={representative.url} alt="영역 지정 이미지" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
              </TouchRegionSelector>
            </CuteCard>
          )}

          {representative && isOcr && (
            <CuteCard>
              <h3 className="mb-1 text-lg font-black text-slate-800">3. 텍스트 인식 · 검증값 확정</h3>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <CloudButton type="button" disabled={isRecognizing || isSaving} onClick={() => void handleRecognize()}>
                  {isRecognizing ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-4" />}
                  텍스트 인식
                </CloudButton>
                {ocrStale && <span className="text-xs font-black text-amber-700">영역이 바뀌었어요. 다시 인식해주세요.</span>}
              </div>

              {ocrResult && (
                <div data-testid="ocr-result" className="mb-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
                  <p>
                    인식 원문: <span className="text-slate-800">{ocrResult.extractedText || "(없음)"}</span> · 제공자 {ocrResult.provider}
                  </p>
                  {ocrResult.extractedText && <p>부자재코드와 {ocrResult.matched ? "일치" : "다름"} (참고)</p>}
                </div>
              )}
              {isMockOcr && (
                <div data-testid="ocr-mock-notice" className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800 ring-1 ring-amber-100">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  OCR 서버가 mock 모드(미설정)라 실제 글자를 인식하지 못합니다. 위 결과는 실제 인쇄 문구가 아닐 수 있으니 검증값을 직접 확인·입력하세요.
                </div>
              )}

              <label className="block text-xs font-black text-slate-600">
                검증값 (현장 OCR 합격 기준)
                <input
                  data-testid="verification-input"
                  value={verifyValue}
                  onChange={(event) => setVerifyValue(event.target.value)}
                  disabled={!ocrResult}
                  placeholder={ocrResult ? "라벨에 인쇄된 문구" : "먼저 텍스트 인식을 실행하세요"}
                  className="mt-1 h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-800 disabled:bg-slate-50"
                />
              </label>
              {manualEdited && trimmedValue && (
                <p data-testid="manual-edit-warning" className="mt-2 flex items-start gap-1.5 text-xs font-black leading-5 text-amber-700">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  인식 원문과 다르게 수정했어요. 현장 OCR은 이 값과 완전 일치해야 합격합니다(공백·대소문자 무시).
                </p>
              )}
            </CuteCard>
          )}

          {representative && !isOcr && (
            <CuteCard>
              <h3 className="mb-1 text-lg font-black text-slate-800">3. 일치율 미리보기 (참고용)</h3>
              <p className="mb-3 text-xs font-semibold text-slate-500">
                현장 비전은 기준 이미지를 참고 사진으로 보여주며 서버 일치율 판정은 하지 않습니다. 저장 조건이 아닙니다.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CloudButton type="button" tone="soft" disabled={images.length < 2 || isRecognizing || isSaving} onClick={() => void handleCompare()}>
                  {isRecognizing ? <Loader2 className="size-4 animate-spin" /> : <ScanEye className="size-4" />}
                  비전 인식(미리보기)
                </CloudButton>
                {images.length < 2 && <span className="text-xs font-bold text-slate-500">비교 대상 없음 — 기준만 저장됩니다.</span>}
                {visionStale && <span className="text-xs font-black text-amber-700">이미지·영역이 바뀌었어요. 다시 계산해주세요.</span>}
              </div>
              {visionResult && (
                <p data-testid="vision-result" className="mt-3 rounded-2xl bg-violet-50 p-3 text-xs font-black text-violet-700">
                  영역 평균 일치율 {formatPercent(visionResult.average)} · 최저 {formatPercent(visionResult.minimum)}
                </p>
              )}
            </CuteCard>
          )}

          {recognizeError && <p className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{recognizeError}</p>}
          {saveError && (
            <p data-testid="save-error" className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">
              {saveError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            {!canSave && (
              <span className="text-xs font-bold text-slate-400 sm:mr-auto">
                {isOcr ? "이미지 붙여넣기 → 텍스트 인식 → 검증값 입력 후 저장할 수 있어요." : "이미지를 1장 이상 붙여넣으면 저장할 수 있어요."}
              </span>
            )}
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="button" disabled={!canSave || isSaving} onClick={() => void handleSave()}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isReregister ? "재등록 저장" : "저장"}
            </CloudButton>
          </div>
        </div>
      </div>
    </div>
  );
}
