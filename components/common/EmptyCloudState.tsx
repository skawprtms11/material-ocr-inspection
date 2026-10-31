import { ListFilter } from "lucide-react";

type EmptyCloudStateProps = {
  title?: string;
  description?: string;
};

export function EmptyCloudState({
  title = "부서와 화주를 선택하세요.",
  description = "상단 필터에서 부서와 화주를 선택하면 해당 범위의 업무 데이터가 표시됩니다."
}: EmptyCloudStateProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ListFilter className="size-6" />
      </div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
