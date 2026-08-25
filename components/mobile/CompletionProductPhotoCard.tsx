"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Trash2 } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { cn } from "@/lib/utils/cn";
import type { InspectionWithVerificationDto } from "@/lib/types/work-inspection-api";

type CompletionPhoto = { id: string; url: string };

type PhotoResponse = {
  photos?: CompletionPhoto[];
  maxCount?: number;
  error?: string;
};

const maxPhotoCount = 3;

// 완료제품 사진: 작업이 완료된 제품을 촬영해 최소 1장 ~ 최대 3장까지 저장한다. 촬영본은 업로드 전에
// browser-image-compression으로 압축(최대 0.8MB / 긴 변 1600px)한 뒤 저장하며, 잘못 찍은 사진은 개별
// 삭제할 수 있다. 1장 이상 저장되면 이 검수 항목이 합격 처리되고, 나머지 완료검수 항목까지 전부 끝나면
// 서버가 작업상태를 "완료"로 자동 전이시킨다(lib/server/work-auto-status.ts).
export function CompletionProductPhotoCard({
  workId,
  inspection,
  onSubmitted
}: {
  workId: string;
  inspection: InspectionWithVerificationDto;
  onSubmitted: () => Promise<void> | void;
}) {
  const [photos, setPhotos] = useState<CompletionPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/work-inspection/completion-photo?inspection_id=${inspection.id}&work_id=${workId}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as PhotoResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "완료제품 사진을 불러오지 못했습니다.");
      setPhotos(payload.photos ?? []);
    } catch (loadError) {
      setErrorMessage(loadError instanceof Error ? loadError.message : "완료제품 사진을 불러오지 못했습니다.");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [inspection.id, workId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const capture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setErrorMessage("");

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
      const payload = (await response.json()) as PhotoResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "완료제품 사진 저장에 실패했습니다.");

      setPhotos(payload.photos ?? []);
      await onSubmitted();
    } catch (uploadError) {
      setErrorMessage(uploadError instanceof Error ? uploadError.message : "완료제품 사진 저장에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (imageId: string) => {
    if (!window.confirm("이 사진을 삭제할까요?")) return;

    setDeletingId(imageId);
    setErrorMessage("");

    try {
      const response = await fetch("/api/work-inspection/completion-photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId: inspection.id, workId, imageId })
      });
      const payload = (await response.json()) as PhotoResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "사진 삭제에 실패했습니다.");

      setPhotos(payload.photos ?? []);
      await onSubmitted();
    } catch (deleteError) {
      setErrorMessage(deleteError instanceof Error ? deleteError.message : "사진 삭제에 실패했습니다.");
    } finally {
      setDeletingId("");
    }
  };

  const reachedMax = photos.length >= maxPhotoCount;
  const saved = photos.length > 0;

  return (
    <CuteCard className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-violet-600">완료검수</p>
          <h3 className="mt-1 text-lg font-black text-slate-800">완료제품 사진등록</h3>
          <p className="mt-1 text-xs font-bold text-slate-400">작업이 완료된 제품을 촬영해 최소 1장 ~ 최대 3장 저장</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-black",
            saved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          )}
        >
          {photos.length}/{maxPhotoCount}장
        </span>
      </div>

      {loading ? (
        <p className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
          저장된 사진을 불러오는 중이에요.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative overflow-hidden rounded-2xl ring-1 ring-sky-200">
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.url} alt={`완료제품 사진 ${index + 1}`} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-[11px] font-bold text-slate-400">
                  사진 {index + 1}
                </div>
              )}
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => void removePhoto(photo.id)}
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1.5 text-rose-600 shadow-sm disabled:opacity-50"
                aria-label={`완료제품 사진 ${index + 1} 삭제`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {!reachedMax && (
            <label
              className={cn(
                "flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition",
                uploading ? "cursor-not-allowed border-slate-200 bg-slate-100" : "border-sky-200 bg-sky-50/70"
              )}
            >
              {photos.length === 0 ? <Camera className="size-6 text-sky-400" /> : <ImagePlus className="size-6 text-sky-400" />}
              <span className="px-1 text-[11px] font-black text-slate-600">{uploading ? "저장 중..." : "촬영"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploading}
                className="sr-only"
                onChange={(event) => void capture(event)}
                aria-label="완료제품 사진 촬영"
              />
            </label>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{errorMessage}</div>
      )}

      {saved && !errorMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">
          <CheckCircle2 className="size-4 shrink-0" />
          완료제품 사진 {photos.length}장 저장 완료 (압축 저장)
        </div>
      )}

      {!saved && !loading && !errorMessage && (
        <p className="mt-3 text-center text-[11px] font-bold text-slate-400">최소 1장은 촬영해야 완료 처리돼요.</p>
      )}
    </CuteCard>
  );
}
