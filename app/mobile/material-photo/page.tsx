"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, Pencil, Plus, RotateCcw, Save, ScanText, Trash2, XCircle } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { appRepository } from "@/lib/repositories/app-repository";
import type { MaterialMaster } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type RegisterMode = "OCR" | "VISION" | null;
type RegistrationMethod = Exclude<RegisterMode, null>;
type StatusFilter = "all" | "registered" | "unregistered";
type Rect = { x: number; y: number; width: number; height: number };
type ResizeHandle = "nw" | "ne" | "sw" | "se";
type OcrApiResult = {
  extractedText?: string;
  matched?: boolean;
  provider?: string;
  summary?: string;
  canVerify?: boolean;
  error?: string;
};
type VisionPhoto = {
  id: string;
  name: string;
  url: string;
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
};
type VisionPairScore = {
  a: number;
  b: number;
  similarity: number;
};
type VisionSimilarityState =
  | { status: "idle"; message: string }
  | { status: "processing"; message: string }
  | { status: "ready"; comparisonKey: string; average: number; minimum: number; pairScores: VisionPairScore[] }
  | { status: "error"; message: string };
type RegionInteraction =
  | { mode: "move"; startPoint: { x: number; y: number }; startRect: Rect }
  | { mode: "resize"; handle: ResizeHandle; startPoint: { x: number; y: number }; startRect: Rect };

const defaultRect: Rect = { x: 18, y: 24, width: 56, height: 22 };
const visionMaxPhotos = 5;
const visionSampleSize = 24;
const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "registered", label: "등록" },
  { value: "unregistered", label: "미등록" }
];

function accuracyText(count: number) {
  if (count >= visionMaxPhotos) return "5장 압축 완료: 일치율 계산 가능";
  if (count === 4) return "정확도 상승: 높음";
  if (count === 3) return "정확도 상승: 보통";
  return "5장까지 촬영하면 이미지 간 일치율을 계산합니다";
}

function hasAnyRegistration(status: Record<RegistrationMethod, Set<string>>, materialId: string) {
  return status.OCR.has(materialId) || status.VISION.has(materialId);
}

function hasMethodRegistration(status: Record<RegistrationMethod, Set<string>>, method: RegistrationMethod, materialId: string) {
  return status[method].has(materialId);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPoint(event: ReactPointerEvent<HTMLDivElement>, element: HTMLDivElement) {
  const bounds = element.getBoundingClientRect();

  return {
    x: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
    y: clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100)
  };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = url;
  });
}

async function cropImageFile(file: File, rect: Rect, filePrefix = "ocr-roi") {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const safeRect = constrainRect(rect);
    const sourceX = clamp(Math.round((safeRect.x / 100) * image.naturalWidth), 0, Math.max(0, image.naturalWidth - 1));
    const sourceY = clamp(Math.round((safeRect.y / 100) * image.naturalHeight), 0, Math.max(0, image.naturalHeight - 1));
    const sourceWidth = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round((safeRect.width / 100) * image.naturalWidth)));
    const sourceHeight = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round((safeRect.height / 100) * image.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("선택 영역 이미지를 만들지 못했습니다.");

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("선택 영역 이미지를 변환하지 못했습니다."));
      }, "image/jpeg", 0.92);
    });

    return {
      file: new File([blob], `${filePrefix}-${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }),
      width: sourceWidth,
      height: sourceHeight,
      sourceRect: { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight },
      originalSize: { width: image.naturalWidth, height: image.naturalHeight }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressVisionFile(file: File) {
  const { default: imageCompression } = await import("browser-image-compression");
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: false,
    fileType: "image/jpeg",
    initialQuality: 0.82
  });
  const name = `vision-${file.name.replace(/\.[^.]+$/, "")}.jpg`;

  return new File([compressed], name, { type: "image/jpeg", lastModified: Date.now() });
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

async function getVisionSignature(file: File, rect: Rect) {
  const cropped = await cropImageFile(file, rect, "vision-roi");
  const url = URL.createObjectURL(cropped.file);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = visionSampleSize;
    canvas.height = visionSampleSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("비전 일치율 샘플을 만들지 못했습니다.");

    context.drawImage(image, 0, 0, visionSampleSize, visionSampleSize);
    const pixels = context.getImageData(0, 0, visionSampleSize, visionSampleSize).data;
    const signature = new Uint8Array(visionSampleSize * visionSampleSize);

    for (let index = 0; index < signature.length; index += 1) {
      const pixelIndex = index * 4;
      signature[index] = Math.round(
        pixels[pixelIndex] * 0.299 +
          pixels[pixelIndex + 1] * 0.587 +
          pixels[pixelIndex + 2] * 0.114
      );
    }

    return signature;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function compareVisionSignatures(a: Uint8Array, b: Uint8Array) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let diff = 0;
  for (let index = 0; index < length; index += 1) {
    diff += Math.abs(a[index] - b[index]);
  }

  return clamp(1 - diff / length / 255, 0, 1);
}

async function compareVisionPhotos(
  photos: VisionPhoto[],
  rect: Rect
): Promise<Omit<Extract<VisionSimilarityState, { status: "ready" }>, "status" | "comparisonKey">> {
  const signatures = await Promise.all(photos.map((photo) => getVisionSignature(photo.file, rect)));
  const pairScores: VisionPairScore[] = [];

  for (let a = 0; a < signatures.length; a += 1) {
    for (let b = a + 1; b < signatures.length; b += 1) {
      pairScores.push({ a, b, similarity: compareVisionSignatures(signatures[a], signatures[b]) });
    }
  }

  const average = pairScores.reduce((sum, pair) => sum + pair.similarity, 0) / Math.max(1, pairScores.length);
  const minimum = pairScores.reduce((min, pair) => Math.min(min, pair.similarity), 1);

  return { average, minimum, pairScores };
}

function buildVisionComparisonKey(photos: VisionPhoto[], rect: Rect) {
  const safeRect = constrainRect(rect);
  const photoKey = photos.map((photo) => photo.id).join("|");
  const rectKey = [safeRect.x, safeRect.y, safeRect.width, safeRect.height]
    .map((value) => value.toFixed(2))
    .join(",");

  return `${photoKey}:${rectKey}`;
}

function constrainRect(rect: Rect): Rect {
  const width = clamp(rect.width, 8, 96);
  const height = clamp(rect.height, 8, 96);
  const x = clamp(rect.x, 0, 100 - width);
  const y = clamp(rect.y, 0, 100 - height);

  return { x, y, width, height };
}

function resizeRect(startRect: Rect, point: { x: number; y: number }, handle: ResizeHandle): Rect {
  const minSize = 8;
  const right = startRect.x + startRect.width;
  const bottom = startRect.y + startRect.height;

  if (handle === "nw") {
    const x = clamp(point.x, 0, right - minSize);
    const y = clamp(point.y, 0, bottom - minSize);
    return constrainRect({ x, y, width: right - x, height: bottom - y });
  }

  if (handle === "ne") {
    const y = clamp(point.y, 0, bottom - minSize);
    const width = clamp(point.x - startRect.x, minSize, 100 - startRect.x);
    return constrainRect({ x: startRect.x, y, width, height: bottom - y });
  }

  if (handle === "sw") {
    const x = clamp(point.x, 0, right - minSize);
    const height = clamp(point.y - startRect.y, minSize, 100 - startRect.y);
    return constrainRect({ x, y: startRect.y, width: right - x, height });
  }

  return constrainRect({
    x: startRect.x,
    y: startRect.y,
    width: clamp(point.x - startRect.x, minSize, 100 - startRect.x),
    height: clamp(point.y - startRect.y, minSize, 100 - startRect.y)
  });
}

function TouchRegionSelector({
  rect,
  onChange,
  tone = "sky",
  aspectRatio,
  children
}: {
  rect: Rect;
  onChange: (rect: Rect) => void;
  tone?: "sky" | "violet";
  aspectRatio?: string;
  children?: ReactNode;
}) {
  const [interaction, setInteraction] = useState<RegionInteraction | null>(null);
  const borderClass = tone === "sky" ? "border-sky-500 bg-sky-200/20" : "border-violet-500 bg-violet-200/20";
  const guideClass = tone === "sky" ? "bg-sky-500 text-white" : "bg-violet-500 text-white";
  const handleClass = tone === "sky" ? "bg-sky-500 ring-sky-100" : "bg-violet-500 ring-violet-100";
  const softButtonClass = tone === "sky" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700";

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event, event.currentTarget);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as ResizeHandle | undefined;

    if (handle) {
      setInteraction({ mode: "resize", handle, startPoint: point, startRect: rect });
      return;
    }

    if (target.dataset.region === "box") {
      setInteraction({ mode: "move", startPoint: point, startRect: rect });
      return;
    }

    const centeredRect = constrainRect({
      ...rect,
      x: point.x - rect.width / 2,
      y: point.y - rect.height / 2
    });
    onChange(centeredRect);
    setInteraction({ mode: "move", startPoint: point, startRect: centeredRect });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction) return;

    event.preventDefault();
    const point = getPoint(event, event.currentTarget);

    if (interaction.mode === "move") {
      onChange(
        constrainRect({
          ...interaction.startRect,
          x: interaction.startRect.x + point.x - interaction.startPoint.x,
          y: interaction.startRect.y + point.y - interaction.startPoint.y
        })
      );
      return;
    }

    onChange(resizeRect(interaction.startRect, point, interaction.handle));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction) return;

    event.preventDefault();
    setInteraction(null);
  };

  const nudge = (patch: Partial<Rect>) => {
    onChange(constrainRect({ ...rect, ...patch }));
  };

  return (
    <div>
      <div
        role="application"
        aria-label="검수 영역 직접 지정"
        className="relative aspect-[4/3] touch-none select-none overflow-hidden rounded-[1.4rem] bg-slate-100"
        style={aspectRatio ? { aspectRatio } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {children}
        <div
          data-region="box"
          className={cn("absolute rounded-xl border-2 shadow-[0_0_0_999px_rgba(15,23,42,0.18)]", borderClass)}
          style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm">
            이동
          </span>
          {([
            ["nw", "-left-4 -top-4 cursor-nwse-resize"],
            ["ne", "-right-4 -top-4 cursor-nesw-resize"],
            ["sw", "-bottom-4 -left-4 cursor-nesw-resize"],
            ["se", "-bottom-4 -right-4 cursor-nwse-resize"]
          ] as [ResizeHandle, string][]).map(([handle, position]) => (
            <button
              key={handle}
              type="button"
              data-handle={handle}
              aria-label={`${handle} 방향으로 영역 크기 조정`}
              className={cn("absolute flex size-8 items-center justify-center rounded-full", position)}
            >
              <span data-handle={handle} className={cn("block size-2.5 rounded-full ring-4 shadow-sm", handleClass)} />
            </button>
          ))}
        </div>
        <div className={cn("pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-black shadow-sm", guideClass)}>
          박스 이동/모서리 조정
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-white/75 px-3 py-2 text-[11px] font-black text-slate-500 ring-1 ring-white/80">
        <span>박스는 끌어서 이동, 모서리는 끌어서 크기 조정</span>
        <span>
          x {Math.round(rect.x)} / y {Math.round(rect.y)} / w {Math.round(rect.width)} / h {Math.round(rect.height)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-black">
        <button type="button" onClick={() => nudge({ y: rect.y - 2 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          위
        </button>
        <button type="button" onClick={() => nudge({ width: rect.width + 3, height: rect.height + 3 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          크게
        </button>
        <button type="button" onClick={() => nudge({ y: rect.y + 2 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          아래
        </button>
        <button type="button" onClick={() => nudge({ x: rect.x - 2 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          왼쪽
        </button>
        <button type="button" onClick={() => nudge(defaultRect)} className="rounded-2xl bg-white py-2 text-slate-600 ring-1 ring-slate-200">
          초기화
        </button>
        <button type="button" onClick={() => nudge({ x: rect.x + 2 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          오른쪽
        </button>
        <span />
        <button type="button" onClick={() => nudge({ width: rect.width - 3, height: rect.height - 3 })} className={cn("rounded-2xl py-2", softButtonClass)}>
          작게
        </button>
        <span />
      </div>
    </div>
  );
}

export default function MobileMaterialRegistrationPage() {
  const materials = useMemo(() => appRepository.listMaterials({}), []);
  const initialRegistrationStatus = useMemo(() => {
    return materials.reduce<Record<RegistrationMethod, Set<string>>>(
      (acc, material) => {
        appRepository.listMaterialRegions(material.id).forEach((region) => {
          acc[region.method].add(material.id);
        });
        return acc;
      },
      { OCR: new Set<string>(), VISION: new Set<string>() }
    );
  }, [materials]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [productCodeFilter, setProductCodeFilter] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [lotFilter, setLotFilter] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<Record<RegistrationMethod, Set<string>>>(initialRegistrationStatus);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [mode, setMode] = useState<RegisterMode>(null);
  const [editing, setEditing] = useState(false);

  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? materials[0];
  const filteredMaterials = materials.filter((material) => {
    const registered = hasAnyRegistration(registrationStatus, material.id);
    const statusMatched =
      filter === "registered" ? registered : filter === "unregistered" ? !registered : true;
    const productCodeMatched = material.code.toLowerCase().includes(productCodeFilter.trim().toLowerCase());
    const productNameMatched = material.name.toLowerCase().includes(productNameFilter.trim().toLowerCase());
    const lotMatched = (material.lot ?? "").toLowerCase().includes(lotFilter.trim().toLowerCase());

    return statusMatched && productCodeMatched && productNameMatched && lotMatched;
  });

  useEffect(() => {
    const queryMaterialId = new URLSearchParams(window.location.search).get("materialId");
    if (queryMaterialId && materials.some((material) => material.id === queryMaterialId)) {
      setSelectedMaterialId(queryMaterialId);
      setEditing(hasAnyRegistration(initialRegistrationStatus, queryMaterialId));
    }
  }, [initialRegistrationStatus, materials]);

  const openRegistration = (material: MaterialMaster, isEdit: boolean) => {
    setSelectedMaterialId(material.id);
    setEditing(isEdit);
    setMode(null);
  };

  const markRegistered = (method: RegistrationMethod) => {
    if (!selectedMaterialId) return;

    setRegistrationStatus((current) => ({
      ...current,
      [method]: new Set(current[method]).add(selectedMaterialId)
    }));
    setEditing(true);
  };

  const backToList = () => {
    setSelectedMaterialId("");
    setMode(null);
    setEditing(false);
  };

  const deleteRegistration = () => {
    if (!selectedMaterialId) return;

    setRegistrationStatus((current) => {
      const nextOcr = new Set(current.OCR);
      const nextVision = new Set(current.VISION);
      nextOcr.delete(selectedMaterialId);
      nextVision.delete(selectedMaterialId);
      return { OCR: nextOcr, VISION: nextVision };
    });
    setMode(null);
    setEditing(false);
  };

  if (mode === "OCR" && selectedMaterial) {
    return (
      <OcrRegistration
        material={selectedMaterial}
        alreadyRegistered={hasMethodRegistration(registrationStatus, "OCR", selectedMaterial.id)}
        onSaved={() => markRegistered("OCR")}
        onCancel={() => setMode(null)}
        onBack={() => setMode(null)}
      />
    );
  }

  if (mode === "VISION" && selectedMaterial) {
    return (
      <VisionRegistration
        material={selectedMaterial}
        alreadyRegistered={hasMethodRegistration(registrationStatus, "VISION", selectedMaterial.id)}
        onSaved={() => markRegistered("VISION")}
        onCancel={() => setMode(null)}
        onBack={() => setMode(null)}
      />
    );
  }

  if (selectedMaterialId && selectedMaterial) {
    const ocrRegistered = hasMethodRegistration(registrationStatus, "OCR", selectedMaterial.id);
    const visionRegistered = hasMethodRegistration(registrationStatus, "VISION", selectedMaterial.id);

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/85 px-4 text-sm font-black text-slate-600 shadow-sm ring-1 ring-white/80"
        >
          <ArrowLeft className="size-4" />
          목록으로
        </button>

        <CuteCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-sky-600">{editing ? "수정등록" : "신규등록"}</p>
              <h1 className="mt-1 text-2xl font-black text-slate-800">{selectedMaterial.name}</h1>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {selectedMaterial.code} / LOT {selectedMaterial.lot ?? "-"}
              </p>
              <div className="mt-3 flex gap-1 text-[10px] font-black">
                <span className={cn("rounded-full px-2 py-1", ocrRegistered ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700")}>
                  OCR {ocrRegistered ? "등록완료" : "대기"}
                </span>
                <span className={cn("rounded-full px-2 py-1", visionRegistered ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700")}>
                  비전 {visionRegistered ? "등록완료" : "대기"}
                </span>
              </div>
            </div>
            {editing && (
              <button
                type="button"
                onClick={deleteRegistration}
                aria-label="등록 삭제"
                className="inline-flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-700"
              >
                <Trash2 className="size-5" />
              </button>
            )}
          </div>
        </CuteCard>

        <CuteCard className="p-4">
          <p className="text-sm font-black text-slate-800">등록 방식을 선택하세요</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            선택하면 목록 아래가 아니라 별도 등록 화면으로 전환됩니다.
          </p>
          <div className="mt-4 grid gap-2">
            <CloudButton onClick={() => setMode("OCR")}>
              <ScanText className="size-4" />
              {ocrRegistered ? "OCR 수정 화면으로" : "OCR 신규등록"}
            </CloudButton>
            <CloudButton tone="soft" onClick={() => setMode("VISION")}>
              <ImagePlus className="size-4" />
              {visionRegistered ? "비전 수정 화면으로" : "비전 신규등록"}
            </CloudButton>
          </div>
        </CuteCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-sky-600">부자재등록</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">부자재 목록</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">관리자웹에서 등록한 부자재 목록 중 하나를 선택합니다.</p>
      </CuteCard>

      <div className="grid grid-cols-3 gap-2">
        {statusFilters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setFilter(item.value);
              setMode(null);
              setSelectedMaterialId("");
            }}
            className={cn(
              "min-h-11 rounded-2xl text-sm font-black transition",
              filter === item.value ? "bg-sky-500 text-white shadow-sm" : "bg-white/80 text-slate-500 ring-1 ring-white/80"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-[1.1rem] bg-white/82 p-2 shadow-sm ring-1 ring-white/80">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1.5">
          <input
            value={productCodeFilter}
            onChange={(event) => {
              setProductCodeFilter(event.target.value);
              setSelectedMaterialId("");
              setMode(null);
            }}
            className="h-9 min-w-0 rounded-xl border border-sky-100 bg-white px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="제품코드"
            aria-label="제품코드 조회필터"
          />
          <input
            value={productNameFilter}
            onChange={(event) => {
              setProductNameFilter(event.target.value);
              setSelectedMaterialId("");
              setMode(null);
            }}
            className="h-9 min-w-0 rounded-xl border border-sky-100 bg-white px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="제품명"
            aria-label="제품명 조회필터"
          />
          <input
            value={lotFilter}
            onChange={(event) => {
              setLotFilter(event.target.value);
              setSelectedMaterialId("");
              setMode(null);
            }}
            className="h-9 min-w-0 rounded-xl border border-sky-100 bg-white px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="LOT"
            aria-label="LOT 조회필터"
          />
          <span className="whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-2 text-[11px] font-black text-sky-700">{filteredMaterials.length}건</span>
        </div>
      </div>

      <CuteCard className="overflow-hidden p-0">
        <div className="grid grid-cols-[1fr_70px_54px] bg-sky-50/80 px-3 py-3 text-[11px] font-black text-sky-700">
          <span>제품코드 / 제품명 / LOT</span>
          <span className="text-center">상태</span>
          <span className="text-center">등록</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredMaterials.map((material) => {
            const registered = hasAnyRegistration(registrationStatus, material.id);
            const ocrRegistered = hasMethodRegistration(registrationStatus, "OCR", material.id);
            const visionRegistered = hasMethodRegistration(registrationStatus, "VISION", material.id);
            const selected = material.id === selectedMaterialId;

          return (
            <div
              key={material.id}
              className={cn(
                "grid grid-cols-[1fr_70px_54px] items-center gap-2 px-3 py-3 transition",
                selected ? "bg-sky-50/90" : "bg-white/70"
              )}
            >
              <button type="button" onClick={() => openRegistration(material, registered)} className="text-left">
                <p className="text-xs font-black text-sky-600">{material.code}</p>
                <p className="mt-1 font-black text-slate-800">{material.name}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">LOT {material.lot ?? "-"}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-black">
                  <span className={cn("rounded-full px-2 py-0.5", ocrRegistered ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                    OCR {ocrRegistered ? "완료" : "대기"}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5", visionRegistered ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                    비전 {visionRegistered ? "완료" : "대기"}
                  </span>
                </div>
              </button>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-center text-[11px] font-black",
                  registered ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}
              >
                {registered ? "등록" : "미등록"}
              </span>
              <button
                type="button"
                onClick={() => openRegistration(material, registered)}
                aria-label={registered ? `${material.name} 수정` : `${material.name} 등록`}
                className={cn(
                  "inline-flex size-10 items-center justify-center justify-self-center rounded-full transition",
                  registered ? "bg-white text-sky-600 ring-1 ring-sky-100" : "bg-sky-500 text-white"
                )}
              >
                {registered ? <Pencil className="size-4" /> : <Plus className="size-5" />}
              </button>
            </div>
          );
        })}
          {filteredMaterials.length === 0 && (
            <div className="px-4 py-8 text-center text-sm font-bold text-slate-400">조회된 부자재가 없습니다.</div>
          )}
        </div>
      </CuteCard>
    </div>
  );
}

function OcrRegistration({
  material,
  alreadyRegistered,
  onSaved,
  onCancel,
  onBack
}: {
  material: MaterialMaster;
  alreadyRegistered: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState(defaultRect);
  const [recognizedText, setRecognizedText] = useState("");
  const [ocrMatched, setOcrMatched] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrReviewed, setOcrReviewed] = useState(false);
  const [ocrSummary, setOcrSummary] = useState("");
  const [ocrProvider, setOcrProvider] = useState("");
  const [ocrError, setOcrError] = useState("");
  const [saved, setSaved] = useState(false);
  const expectedText = material.code;
  const matched = ocrReviewed && ocrMatched;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetOcrReview = () => {
    setRecognizedText("");
    setOcrMatched(false);
    setOcrReviewed(false);
    setOcrSummary("");
    setOcrProvider("");
    setOcrError("");
    setSaved(false);
  };

  const handleRectChange = (nextRect: Rect) => {
    setRect(constrainRect(nextRect));
    if (selectedFile || ocrReviewed || saved) resetOcrReview();
  };

  const capture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const nextPreviewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = nextPreviewUrl;

    setPreviewUrl(nextPreviewUrl);
    setSelectedFile(file);
    resetOcrReview();
    event.target.value = "";
  };

  const retry = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setSelectedFile(null);
    setImageSize(null);
    resetOcrReview();
    setRect(defaultRect);
  };

  const reviewOcr = async () => {
    if (!selectedFile) return;

    setOcrLoading(true);
    setOcrError("");
    setOcrSummary("");
    setOcrProvider("");
    setOcrReviewed(false);
    setOcrMatched(false);
    setSaved(false);

    try {
      const reviewRect = constrainRect(rect);
      setRect(reviewRect);

      const croppedImage = await cropImageFile(selectedFile, reviewRect);
      const formData = new FormData();
      formData.append("image", croppedImage.file);
      formData.append("expectedText", expectedText);
      formData.append("roi", JSON.stringify({ x: 0, y: 0, width: 100, height: 100 }));
      formData.append("originalRoi", JSON.stringify(reviewRect));
      formData.append("imageWidth", String(croppedImage.width));
      formData.append("imageHeight", String(croppedImage.height));
      formData.append("originalImageWidth", String(croppedImage.originalSize.width));
      formData.append("originalImageHeight", String(croppedImage.originalSize.height));
      formData.append("sourceRect", JSON.stringify(croppedImage.sourceRect));
      formData.append("isCropped", "true");
      formData.append("materialId", material.id);

      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData
      });
      const result = (await response.json()) as OcrApiResult;

      if (!response.ok) {
        throw new Error(result.error ?? "OCR 검토 중 오류가 발생했습니다.");
      }

      setRecognizedText(result.extractedText ?? "");
      setOcrMatched(Boolean(result.canVerify !== false && result.matched));
      setOcrReviewed(true);
      setOcrProvider(result.provider ?? "");
      setOcrSummary(result.summary ?? "");
    } catch (error) {
      setRecognizedText("");
      setOcrMatched(false);
      setOcrReviewed(false);
      setOcrError(error instanceof Error ? error.message : "OCR 검토 중 오류가 발생했습니다.");
    } finally {
      setOcrLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/85 px-4 text-sm font-black text-slate-600 shadow-sm ring-1 ring-white/80"
      >
        <ArrowLeft className="size-4" />
        등록 선택으로
      </button>

      <CuteCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-sky-600">OCR등록</p>
          <h1 className="mt-1 text-2xl font-black text-slate-800">{material.name}</h1>
          <p className="mt-1 text-xs font-bold text-slate-400">
            {material.code} · {alreadyRegistered ? "OCR 등록완료" : "OCR 신규등록"}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-full bg-white p-2 text-slate-400 ring-1 ring-slate-200">
          <XCircle className="size-5" />
        </button>
      </div>

      <TouchRegionSelector
        rect={rect}
        onChange={handleRectChange}
        aspectRatio={imageSize ? `${imageSize.width} / ${imageSize.height}` : undefined}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="OCR 촬영 이미지" className="pointer-events-none h-full w-full object-contain" />
        ) : (
          <div className="pointer-events-none flex h-full flex-col items-center justify-center text-center">
            <Camera className="mb-3 size-12 text-sky-400" />
            <p className="font-black text-slate-800">OCR 사진을 먼저 촬영하세요</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">촬영 후 전체 사진 기준으로 읽을 영역을 지정합니다.</p>
          </div>
        )}
      </TouchRegionSelector>

      <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-sky-500 px-4 text-sm font-extrabold text-white shadow-sm">
        <Camera className="size-4" />
        {previewUrl ? "OCR 사진 다시 촬영" : "OCR 사진 촬영"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={capture} aria-label="OCR 등록 사진 촬영" />
      </label>

      <CloudButton
        className="mt-4 w-full"
        disabled={!selectedFile || ocrLoading}
        onClick={reviewOcr}
      >
        <ScanText className="size-4" />
        {ocrLoading ? "OCR 검토 중..." : "OCR 검토"}
      </CloudButton>

      {ocrError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">
          OCR 오류: {ocrError}
        </div>
      )}

      {ocrReviewed && (
        <div className={cn("mt-3 rounded-2xl p-3 text-sm font-bold leading-6", matched ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
          <p className="text-xs font-black">{matched ? "OCR 검토 결과 일치" : "OCR 검토 결과 불일치"}</p>
          <p className="mt-1 text-xs">{ocrSummary || "선택 영역 기준 OCR 결과입니다."}</p>
          {ocrProvider && <p className="mt-1 text-xs">OCR provider: {ocrProvider}</p>}
          <label className="mt-2 block">
            <span className="text-xs">OCR로 읽은 텍스트</span>
            <textarea
              value={recognizedText || "인식된 텍스트 없음"}
              readOnly
              className="mt-1 min-h-16 w-full rounded-2xl border border-white/80 bg-white/80 p-3 text-sm font-black text-slate-800 outline-none"
            />
          </label>
          <p className="mt-2 text-xs">기준 텍스트: {expectedText}</p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CloudButton tone="soft" onClick={retry}>
          <RotateCcw className="size-4" />
          재처리
        </CloudButton>
        <CloudButton tone="danger" onClick={onCancel}>
          취소
        </CloudButton>
        <CloudButton
          disabled={!matched || ocrLoading}
          onClick={() => {
            setSaved(true);
            onSaved();
          }}
        >
          <Save className="size-4" />
          저장
        </CloudButton>
      </div>

      {saved && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mb-1 size-5" />
          OCR 등록 저장 완료
        </div>
      )}
      </CuteCard>
    </div>
  );
}

function VisionRegistration({
  material,
  alreadyRegistered,
  onSaved,
  onCancel,
  onBack
}: {
  material: MaterialMaster;
  alreadyRegistered: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [photos, setPhotos] = useState<VisionPhoto[]>([]);
  const [rect, setRect] = useState(defaultRect);
  const [compressing, setCompressing] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [similarity, setSimilarity] = useState<VisionSimilarityState>({
    status: "idle",
    message: "5장을 촬영하면 선택 영역 기준 일치율을 계산합니다."
  });
  const [saved, setSaved] = useState(false);
  const photoUrlsRef = useRef<string[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const currentComparisonKey = useMemo(() => buildVisionComparisonKey(photos, rect), [photos, rect]);

  useEffect(() => {
    let cancelled = false;
    const comparisonKey = currentComparisonKey;

    if (photos.length < 2) {
      setSimilarity({
        status: "idle",
        message: photos.length === 0 ? "5장을 촬영하면 선택 영역 기준 일치율을 계산합니다." : "2장 이상 촬영하면 이미지 간 일치율을 미리 계산합니다."
      });
      return;
    }

    setSimilarity({ status: "processing", message: "선택 영역 기준으로 압축 이미지 일치율을 계산 중입니다." });
    const timer = window.setTimeout(() => {
      void compareVisionPhotos(photos, constrainRect(rect))
        .then((result) => {
          if (!cancelled) setSimilarity({ status: "ready", comparisonKey, ...result });
        })
        .catch((error) => {
          if (!cancelled) {
            setSimilarity({
              status: "error",
              message: error instanceof Error ? error.message : "비전 일치율 계산 중 오류가 발생했습니다."
            });
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [photos, rect, currentComparisonKey]);

  const capture = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file || photos.length >= visionMaxPhotos || compressing) return;

    setCompressing(true);
    setCaptureError("");
    setSaved(false);

    try {
      const compressedFile = await compressVisionFile(file);
      let url = "";

      try {
        url = URL.createObjectURL(compressedFile);
        const image = await loadImage(url);
        if (!mountedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        photoUrlsRef.current = [...photoUrlsRef.current, url];

        setPhotos((current) => [
          ...current,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: compressedFile.name,
            url,
            file: compressedFile,
            originalSize: file.size,
            compressedSize: compressedFile.size,
            width: image.naturalWidth,
            height: image.naturalHeight
          }
        ]);
      } catch (error) {
        if (url) URL.revokeObjectURL(url);
        throw error;
      }
    } catch (error) {
      if (mountedRef.current) {
        setCaptureError(error instanceof Error ? error.message : "비전 사진 압축 중 오류가 발생했습니다.");
      }
    } finally {
      if (mountedRef.current) setCompressing(false);
      input.value = "";
    }
  };

  const retry = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    photoUrlsRef.current = [];
    setPhotos([]);
    setRect(defaultRect);
    setCaptureError("");
    setSimilarity({ status: "idle", message: "5장을 촬영하면 선택 영역 기준 일치율을 계산합니다." });
    setSaved(false);
  };

  const handleRectChange = (nextRect: Rect) => {
    setRect(constrainRect(nextRect));
    setSaved(false);
  };

  const readyToSave = photos.length === visionMaxPhotos && similarity.status === "ready" && similarity.comparisonKey === currentComparisonKey;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white/85 px-4 text-sm font-black text-slate-600 shadow-sm ring-1 ring-white/80"
      >
        <ArrowLeft className="size-4" />
        등록 선택으로
      </button>

      <CuteCard className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-violet-600">비전등록</p>
          <h1 className="mt-1 text-2xl font-black text-slate-800">{material.name}</h1>
          <p className="mt-1 text-xs font-bold text-slate-400">
            5장 압축 저장 · {alreadyRegistered ? "비전 등록완료" : "비전 신규등록"}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-full bg-white p-2 text-slate-400 ring-1 ring-slate-200">
          <XCircle className="size-5" />
        </button>
      </div>

      <TouchRegionSelector
        rect={rect}
        onChange={handleRectChange}
        tone="violet"
        aspectRatio={photos[0]?.width && photos[0]?.height ? `${photos[0].width} / ${photos[0].height}` : undefined}
      >
        {photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0].url} alt="비전 기준 이미지" className="pointer-events-none h-full w-full object-contain" />
        ) : (
          <div className="pointer-events-none flex h-full flex-col items-center justify-center text-center">
            <Camera className="mb-3 size-12 text-violet-400" />
            <p className="font-black text-slate-800">비전 기준 사진 촬영</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">첫 사진 촬영 후 전체 사진 기준으로 검사 영역을 지정합니다.</p>
          </div>
        )}
      </TouchRegionSelector>

      <label className={cn("mt-4 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-extrabold shadow-sm", photos.length >= visionMaxPhotos ? "bg-slate-100 text-slate-300" : "bg-sky-500 text-white")}>
        <Camera className="size-4" />
        {compressing ? "압축 중..." : `사진 촬영 ${photos.length}/${visionMaxPhotos}`}
        <input type="file" accept="image/*" capture="environment" disabled={photos.length >= visionMaxPhotos || compressing} className="sr-only" onChange={capture} aria-label="비전 등록 사진 촬영" />
      </label>

      {captureError && (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">
          비전 사진 오류: {captureError}
        </div>
      )}

      <div className="mt-3 grid grid-cols-5 gap-2">
        {Array.from({ length: visionMaxPhotos }).map((_, index) => {
          const photo = photos[index];

          return (
            <div key={photo?.id ?? index} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`비전 등록 ${index + 1}`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-black text-violet-700 shadow-sm">
                    {formatFileSize(photo.compressedSize)}
                  </span>
                </>
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] font-black text-slate-300">{index + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className={cn("mt-3 rounded-2xl p-3 text-sm font-bold", photos.length === visionMaxPhotos ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
        {accuracyText(photos.length)}
      </div>

      <div
        className={cn(
          "mt-3 rounded-2xl p-3 text-sm font-bold leading-6",
          similarity.status === "ready" ? "bg-violet-50 text-violet-700" : similarity.status === "error" ? "bg-rose-50 text-rose-700" : "bg-white/75 text-slate-500"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black">비전 이미지 일치율</p>
            <p className="mt-1 text-xs">
              {similarity.status === "ready"
                ? `${photos.length}장 중 ${similarity.pairScores.length}개 조합을 선택 영역 기준으로 비교했습니다.`
                : similarity.message}
            </p>
          </div>
          {similarity.status === "ready" && (
            <div className="shrink-0 text-right">
              <p className="text-2xl font-black text-slate-800">{formatPercent(similarity.average)}</p>
              <p className="text-[10px] font-black text-violet-500">최저 {formatPercent(similarity.minimum)}</p>
            </div>
          )}
        </div>
        {similarity.status === "ready" && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px] font-black">
            {similarity.pairScores.map((pair) => (
              <span key={`${pair.a}-${pair.b}`} className="rounded-full bg-white/85 px-2 py-1 text-center text-slate-600">
                {pair.a + 1}-{pair.b + 1}: {formatPercent(pair.similarity)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CloudButton tone="soft" onClick={retry}>
          <RotateCcw className="size-4" />
          재처리
        </CloudButton>
        <CloudButton tone="danger" onClick={onCancel}>
          취소
        </CloudButton>
        <CloudButton
          disabled={!readyToSave}
          onClick={() => {
            setSaved(true);
            onSaved();
          }}
        >
          <Save className="size-4" />
          저장
        </CloudButton>
      </div>

      {saved && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mb-1 size-5" />
          비전등록 저장 완료 · 압축 이미지 {photos.length}장 · 평균 일치율 {similarity.status === "ready" ? formatPercent(similarity.average) : "-"}
        </div>
      )}
      </CuteCard>
    </div>
  );
}
