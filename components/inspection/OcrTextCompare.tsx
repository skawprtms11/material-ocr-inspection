import { diffOcrText } from "@/lib/inspection/ocr-match";
import { cn } from "@/lib/utils/cn";

type OcrExpectedSource = "work" | "master" | "none";

const sourceLabels: Record<OcrExpectedSource, string> = { work: "작업등록", master: "마스터", none: "미등록" };

function Highlighted({ chars, tone }: { chars: { char: string; diff: boolean }[]; tone: "expected" | "recognized" }) {
  if (chars.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="break-all font-mono">
      {chars.map((item, index) => (
        <span
          key={index}
          className={cn(item.diff && (tone === "expected" ? "rounded-sm bg-blue-200 text-blue-900" : "rounded-sm bg-red-200 text-red-900"))}
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
          <span className={cn("text-lg font-semibold", passed ? "text-emerald-600" : "text-red-600")}>일치율 {matchRate}%</span>
          {typeof threshold === "number" && <span className="text-muted-foreground">(기준 {threshold}%)</span>}
        </p>
      )}
      <div className="rounded-md border border-border bg-card p-2">
        <p className="font-medium text-muted-foreground">
          등록 텍스트{expectedSource ? ` (${sourceLabels[expectedSource]})` : ""}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-all text-foreground">{expectedText || "-"}</p>
      </div>
      <div className="rounded-md border border-border bg-card p-2">
        <p className="font-medium text-muted-foreground">스캔 텍스트</p>
        <p className="mt-0.5 whitespace-pre-wrap break-all text-foreground">{recognizedText || "-"}</p>
      </div>
      {hasRate && matchRate < 100 && (
        <div className="rounded-md border border-border bg-muted/40 p-2">
          <p className="font-medium text-muted-foreground">정규화 비교 (공백 제거·대문자, 다른 글자 강조)</p>
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
