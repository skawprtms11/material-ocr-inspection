"use client";

// 부자재등록(material-photo)에서 쓰던 드래그/리사이즈 ROI 선택기를 공용 컴포넌트로 추출한 것.
// 홈 화면의 OCR 검수 카드(OcrInspectionCard)도 촬영 후 위치 조정 UI로 이 컴포넌트를 재사용한다.
import { PointerEvent as ReactPointerEvent, ReactNode, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { RoiRect } from "@/lib/types/domain";

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

type RegionInteraction =
  | { mode: "move"; startPoint: { x: number; y: number }; startRect: RoiRect }
  | { mode: "resize"; handle: ResizeHandle; startPoint: { x: number; y: number }; startRect: RoiRect };

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

export function constrainRect(rect: RoiRect): RoiRect {
  const width = clamp(rect.width, 0.8, 96);
  const height = clamp(rect.height, 0.8, 96);
  const x = clamp(rect.x, 0, 100 - width);
  const y = clamp(rect.y, 0, 100 - height);

  return { x, y, width, height };
}

function resizeRect(startRect: RoiRect, point: { x: number; y: number }, handle: ResizeHandle): RoiRect {
  const minSize = 0.8;
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

const fallbackDefaultRect: RoiRect = { x: 18, y: 24, width: 56, height: 22 };

export function TouchRegionSelector({
  rect,
  onChange,
  tone = "sky",
  aspectRatio,
  label = "박스 이동/모서리 조정",
  defaultRect = fallbackDefaultRect,
  children
}: {
  rect: RoiRect;
  onChange: (rect: RoiRect) => void;
  tone?: "sky" | "violet";
  aspectRatio?: string;
  label?: string;
  defaultRect?: RoiRect;
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

  const nudge = (patch: Partial<RoiRect>) => {
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
          {label}
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
