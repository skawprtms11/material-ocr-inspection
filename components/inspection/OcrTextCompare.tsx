import { diffOcrText } from "@/lib/inspection/ocr-match";
import { cn } from "@/lib/utils/cn";

type OcrExpectedSource = "work" | "master" | "none";

const sourceLabels: Record<OcrExpectedSource, string> = { work: "작업등록", master: "마스터", none: "미등록" };

function Highlighted({ chars, tone }: { chars: { char: string; diff: boolean }[]; tone: "expected" | "recognized" }) {
  if (chars.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <span className="break-all font-mono">
      {chars.map((item, index) => (
        <span
          key={index}
          className={cn(item.diff && (tone === "expected" ? "rounded bg-sky-200 text-sky-900" : "rounded bg-rose-200 text-rose-900"))}
        >
          {item.char}
        </span>
      ))}
    </span>
  );
}

// 일치율과 등록(기준) 텍스트 vs 스캔 텍스트를 함께 보여준다. 정규화(공백 제거·대문자) 후 다른 글자는 강조한다.
export function OcrTextCompare({
  expectedText,
  expectedSource,
  recognizedText,
  matchRate,
  threshold,
  className
}: {
  expectedText?: string;
  expectedSource?: OcrExpectedSource;
  recognizedText?: string;
  matchRate?: number;
  threshold?: number;
  className?: string;
}) {
  const diff = diffOcrText(expectedText ?? "", recognizedText ?? "");
  const hasRate = typeof matchRate === "number";
  const passed = hasRate && typeof threshold === "number" && matchRate >= threshold;

  return (
    <div className={cn("space-y-2 text-xs", className)}>
      {hasRate && (
        <p className="flex flex-wrap items-baseline gap-2">
          <span className={cn("text-lg font-black", passed ? "text-emerald-600" : "text-rose-600")}>일치율 {matchRate}%</span>
          {typeof threshold === "number" && <span className="font-bold text-slate-500">(기준 {threshold}%)</span>}
        </p>
      )}
      <div className="rounded-xl bg-white/80 p-2 ring-1 ring-slate-100">
        <p className="font-black text-slate-500">
          등록 텍스트{expectedSource ? ` (${sourceLabels[expectedSource]})` : ""}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-all font-bold text-slate-800">{expectedText || "-"}</p>
      </div>
      <div className="rounded-xl bg-white/80 p-2 ring-1 ring-slate-100">
        <p className="font-black text-slate-500">스캔 텍스트</p>
        <p className="mt-0.5 whitespace-pre-wrap break-all font-bold text-slate-800">{recognizedText || "-"}</p>
      </div>
      {hasRate && matchRate < 100 && (
        <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
          <p className="font-black text-slate-500">정규화 비교 (공백 제거·대문자, 다른 글자 강조)</p>
          <p className="mt-0.5">
            <Highlighted chars={diff.expected} tone="expected" />
          </p>
          <p className="mt-0.5">
            <Highlighted chars={diff.recognized} tone="recognized" />
          </p>
        </div>
      )}
    </div>
  );
}
