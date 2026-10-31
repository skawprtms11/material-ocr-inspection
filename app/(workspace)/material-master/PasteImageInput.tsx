"use client";

import { ClipboardPaste, ImagePlus, Loader2 } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadImage } from "@/lib/utils/image-crop";
import { cn } from "@/lib/utils/cn";

export type PickedImage = { id: string; file: File; url: string; width: number; height: number };

const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
const extensionByType: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// 최대 2400px / 2MB로 압축하되 원본 비율은 유지한다(버킷 제약: 8MB, png·jpeg·webp).
async function normalizeImage(file: File, baseName: string): Promise<PickedImage> {
  const { default: imageCompression } = await import("browser-image-compression");
  const compressed = await imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 2400,
    useWebWorker: false,
    fileType: "image/jpeg",
    initialQuality: 0.9
  });
  const type = allowedTypes.includes(compressed.type) ? compressed.type : "image/jpeg";
  const normalized = new File([compressed], `${baseName}.${extensionByType[type]}`, { type, lastModified: Date.now() });
  const url = URL.createObjectURL(normalized);

  try {
    const image = await loadImage(url);
    return { id: `${baseName}-${Math.random().toString(36).slice(2, 8)}`, file: normalized, url, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function PasteImageInput({
  namePrefix,
  maxFiles,
  currentCount,
  disabled,
  onPicked
}: {
  namePrefix: string;
  maxFiles: number;
  currentCount: number;
  disabled?: boolean;
  onPicked: (images: PickedImage[]) => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFilesRef = useRef<(files: File[]) => Promise<void>>(async () => {});

  handleFilesRef.current = async (files: File[]) => {
    const images = files.filter((file) => allowedTypes.includes(file.type));
    if (images.length < files.length) toast.error("PNG, JPEG, WEBP 이미지만 사용할 수 있습니다.");
    if (images.length === 0) return;

    // 단일 이미지(OCR)는 새로 붙여넣으면 교체하고, 다중(비전)은 남은 칸만큼만 받는다.
    const accepted = maxFiles === 1 ? images.slice(0, 1) : images.slice(0, Math.max(0, maxFiles - currentCount));
    if (accepted.length === 0) {
      toast.error(`이미지는 최대 ${maxFiles}장까지 등록할 수 있습니다.`);
      return;
    }
    if (accepted.length < images.length && maxFiles !== 1) toast.warning(`최대 ${maxFiles}장까지만 추가됩니다.`);

    setIsProcessing(true);
    try {
      const stamp = timestamp();
      const picked = await Promise.all(accepted.map((file, index) => normalizeImage(file, `${namePrefix}-${stamp}${accepted.length > 1 ? `-${index + 1}` : ""}`)));
      onPicked(picked);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "이미지를 처리하지 못했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (disabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      // 텍스트 붙여넣기(검증값 입력 등)는 그대로 통과시킨다.
      if (files.length === 0) return;
      event.preventDefault();
      void handleFilesRef.current(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [disabled]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleFilesRef.current(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    void handleFilesRef.current(Array.from(event.dataTransfer.files));
  };

  const handleClipboardRead = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];

      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], `clipboard.${extensionByType[type] ?? "png"}`, { type }));
      }

      if (files.length === 0) {
        toast.warning("클립보드에 이미지가 없습니다. 화면을 캡처한 뒤 다시 시도하세요.");
        return;
      }
      await handleFilesRef.current(files);
    } catch {
      toast.warning("클립보드를 직접 읽을 수 없습니다. Ctrl/Cmd+V로 붙여넣으세요.");
    }
  };

  return (
    <div
      data-testid="paste-zone"
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors",
        isDragging ? "border-primary bg-accent" : "border-input bg-card",
        disabled && "opacity-50"
      )}
    >
      {isProcessing ? <Loader2 className="size-8 animate-spin text-primary" /> : <ClipboardPaste className="size-8 text-muted-foreground" />}
      <p className="font-medium text-foreground">캡처 이미지를 Ctrl/Cmd+V로 붙여넣으세요</p>
      <p className="text-xs leading-5 text-muted-foreground">
        파일을 이 영역에 끌어다 놓거나 아래 버튼으로 선택할 수도 있습니다. PNG·JPEG·WEBP, 최대 2400px로 자동 압축됩니다.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled || isProcessing}
          onClick={() => void handleClipboardRead()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ClipboardPaste className="size-3.5" />
          클립보드에서 붙여넣기
        </button>
        <button
          type="button"
          disabled={disabled || isProcessing}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-card px-3 text-xs font-medium text-foreground ring-1 ring-input transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-3.5" />
          파일 선택
        </button>
      </div>
      <input
        ref={fileInputRef}
        data-testid="reference-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={maxFiles > 1}
        className="sr-only"
        aria-label="기준 이미지 파일 선택"
        onChange={handleFileChange}
      />
    </div>
  );
}
