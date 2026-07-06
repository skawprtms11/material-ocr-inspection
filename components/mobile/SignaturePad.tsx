"use client";

import { useRef, useState } from "react";
import { Eraser, Save } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";

export function SignaturePad({ onSave }: { onSave: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => setDrawing(false)}
        onPointerLeave={() => setDrawing(false)}
        className="h-56 w-full touch-none rounded-[1.5rem] border border-sky-100 bg-white shadow-inner"
        aria-label="작업자 서명 입력 패드"
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <CloudButton tone="soft" onClick={clear}>
          <Eraser className="size-4" />
          초기화
        </CloudButton>
        <CloudButton onClick={onSave}>
          <Save className="size-4" />
          저장
        </CloudButton>
      </div>
    </div>
  );
}
