"use client";

import { AlertTriangle, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { useFilterStore } from "@/lib/state/filter-store";
import type { MaterialInspectionRegion, MaterialMaster, RoiRect } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { getReferencePath, type ReferenceMethod } from "./reference-status";

// 서버가 내역 보기용으로 평탄화해 내려주는 필드(registration GET)를 optional로 받고, 없으면 options에서 꺼낸다.
type RegionWithImages = MaterialInspectionRegion & {
  imageUrls: string[];
  registeredAt?: string;
  registrationSource?: "web" | "mobile" | "unknown";
  ocrRawText?: string;
  manualEdited?: boolean;
  similarity?: number;
};

function optionText(options: Record<string, unknown>, key: string) {
  const value = options[key];
  return typeof value === "string" && value ? value : undefined;
}

function formatDate(value: string | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { hour12: false });
}

function sourceLabel(source: string | undefined) {
  if (source === "web") return "웹 등록";
  if (source === "mobile") return "모바일 등록";
  return "-";
}

function RoiOverlayImage({ imageUrl, roi, method }: { imageUrl: string; roi: RoiRect; method: ReferenceMethod }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="기준 이미지" className="block w-full max-w-full" />
      <div
        data-testid="roi-overlay"
        className={cn("absolute rounded-md border-2 bg-white/20 shadow-sm", method === "OCR" ? "border-sky-400" : "border-violet-400")}
        style={{ left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.width}%`, height: `${roi.height}%` }}
      />
    </div>
  );
}

export function ReferenceDetailModal({
  material,
  method,
  onClose,
  onReregister
}: {
  material: MaterialMaster;
  method: ReferenceMethod;
  onClose: () => void;
  onReregister: (roi: RoiRect) => void;
}) {
  const { departmentId, shipperId } = useFilterStore();
  const [region, setRegion] = useState<RegionWithImages | null>(null);
  const [freshMaterial, setFreshMaterial] = useState<MaterialMaster | null>(null);
  const [source, setSource] = useState<"supabase" | "mock" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const isOcr = method === "OCR";

  const load = useCallback(async (isCancelled: () => boolean) => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ material_id: material.id, department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/material-master/registration?${params.toString()}`);
      const data = (await response.json()) as { source?: "supabase" | "mock"; regions?: RegionWithImages[]; material?: MaterialMaster; error?: string };
      if (!response.ok) throw new Error(data.error ?? "등록 내역 조회에 실패했습니다.");
      if (isCancelled()) return;
      setRegion(data.regions?.find((candidate) => candidate.method === method) ?? null);
      setSource(data.source ?? null);
      setFreshMaterial(data.material ?? null);
    } catch (fetchError) {
      if (isCancelled()) return;
      setRegion(null);
      setError(fetchError instanceof Error ? `연결 오류 — ${fetchError.message}` : "연결 오류 — 등록 내역 조회에 실패했습니다.");
    } finally {
      if (!isCancelled()) setIsLoading(false);
    }
  }, [material.id, method, departmentId, shipperId]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const options = region?.options ?? {};
  const optionSource = optionText(options, "source");
  const regionSource = region?.registrationSource ?? (optionSource?.startsWith("web") ? "web" : optionSource ? "mobile" : undefined);
  const current = freshMaterial ?? material;
  const hasPath = Boolean(getReferencePath(current, method));
  const missingReasons: string[] = [];

  if (!isLoading && !error) {
    if (!hasPath) missingReasons.push("이미지 없음");
    if (!region) missingReasons.push("영역 없음");
    if (isOcr && !current.verification_value?.trim() && !region?.expected_text?.trim()) missingReasons.push("검증값 없음");
  }

  // 인식 원문이 빈 문자열(mock 등 인식 실패)이면 검증값으로 대체하지 않고 "(없음)"으로 표시한다.
  const storedRawText = typeof options.ocrRawText === "string" ? options.ocrRawText : region?.ocrRawText;
  const rawText =
    storedRawText !== undefined ? storedRawText.trim() || "(없음)" : optionText(options, "recognizedText");
  const manualEdited = region?.manualEdited ?? (typeof options.manualEdited === "boolean" ? options.manualEdited : undefined);
  const similarity = region?.similarity ?? (typeof options.similarity === "number" ? options.similarity : region?.similarity_threshold);
  const isMobileOcrCrop = isOcr && regionSource === "mobile";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={`${isOcr ? "OCR" : "비전"} 등록 내역`}
        className="w-full max-w-3xl rounded-[1.4rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={cn("text-xs font-black", isOcr ? "text-sky-600" : "text-violet-600")}>{isOcr ? "OCR" : "비전스캔"} 등록 내역</p>
            <h2 className="mt-1 text-2xl font-black tracking-normal text-slate-800">
              {material.name} <span className="text-base text-slate-400">{material.code}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <CloudButton type="button" disabled={isLoading || Boolean(error)} onClick={() => onReregister(region?.roi ?? { x: 18, y: 24, width: 56, height: 22 })}>
              <RefreshCw className="size-4" />
              재등록
            </CloudButton>
            <button
              type="button"
              onClick={onClose}
              aria-label="팝업 닫기"
              className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[1.2rem] bg-white/70 text-sm font-bold text-slate-500">
            <Loader2 className="size-6 animate-spin text-sky-400" />
            등록 내역을 불러오는 중이에요.
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.2rem] bg-rose-50 p-6 text-center text-sm font-bold text-rose-600">
            {error}
            <button type="button" onClick={() => void load(() => false)} className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
              다시 시도
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {missingReasons.length > 0 && (
              <div data-testid="missing-reasons" className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-black leading-5 text-amber-800 ring-1 ring-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                보완 필요: {missingReasons.join(" · ")} — 재등록으로 기준을 다시 저장하세요.
              </div>
            )}
            {isMobileOcrCrop && (
              <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800 ring-1 ring-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                모바일 등록본은 크롭 이미지 위에 원본 기준 영역이 저장돼 표시가 어긋날 수 있어요. 재등록을 권장합니다.
              </div>
            )}

            <CuteCard>
              <h3 className="mb-3 text-lg font-black text-slate-800">기준 이미지</h3>
              {region && region.imageUrls.length > 0 ? (
                <div className={cn("grid gap-3", !isOcr && "sm:grid-cols-2")}>
                  {(isOcr ? region.imageUrls.slice(0, 1) : region.imageUrls.slice(0, 5)).map((imageUrl, index) => (
                    <RoiOverlayImage key={`${imageUrl}-${index}`} imageUrl={imageUrl} roi={region.roi} method={method} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.2rem] bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                  {source === "mock" ? "Mock 모드 — 이미지 미보관" : "표시할 기준 이미지가 없습니다."}
                </div>
              )}
            </CuteCard>

            <CuteCard>
              <h3 className="mb-3 text-lg font-black text-slate-800">등록 정보</h3>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {isOcr ? (
                  <>
                    <Item label="검증값" value={current.verification_value || region?.expected_text || "-"} testId="detail-verification" />
                    <Item label="인식 원문" value={rawText ?? "-"} />
                    <Item label="수정 여부" value={manualEdited === undefined ? "-" : manualEdited ? "수정함 (인식 원문과 다름)" : "수정 안 함"} />
                  </>
                ) : (
                  <>
                    <Item label="이미지 장수" value={region ? `${region.imageUrls.length}장` : "-"} />
                    <Item label="참고 일치율" value={similarity === undefined ? "-" : `${Math.round(similarity * 100)}%`} />
                  </>
                )}
                <Item
                  label="영역(%)"
                  value={region ? `x ${Math.round(region.roi.x)} / y ${Math.round(region.roi.y)} / w ${Math.round(region.roi.width)} / h ${Math.round(region.roi.height)}` : "-"}
                />
                <Item label="등록일" value={formatDate(region?.registeredAt ?? optionText(options, "savedAt"))} />
                <Item label="등록 경로" value={sourceLabel(regionSource)} />
              </dl>
            </CuteCard>
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
      <dt className="shrink-0 text-xs font-black text-slate-500">{label}</dt>
      <dd data-testid={testId} className="break-all text-right font-bold text-slate-800">
        {value}
      </dd>
    </div>
  );
}
