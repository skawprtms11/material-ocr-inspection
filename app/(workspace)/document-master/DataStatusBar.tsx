type DataStatusBarProps = {
  message: string;
  source: "supabase" | "mock" | null;
  loadError: boolean;
  onRetry: () => void;
};

export function DataStatusBar({ message, source, loadError, onRetry }: DataStatusBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
      <span>{message}</span>
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
          데이터: {loadError ? "연결 오류" : source === "supabase" ? "Supabase" : source === "mock" ? "Mock/Fallback" : "연결 확인 중"}
        </span>
        {loadError && (
          <button type="button" onClick={onRetry} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
