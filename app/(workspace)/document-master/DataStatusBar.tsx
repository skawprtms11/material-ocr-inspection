type DataStatusBarProps = {
  message: string;
  source: "supabase" | "mock" | null;
  loadError: boolean;
  onRetry: () => void;
};

export function DataStatusBar({ message, source, loadError, onRetry }: DataStatusBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
      <span>{message}</span>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-3 py-1 ring-1 ${loadError ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
          데이터: {loadError ? "연결 오류" : source === "supabase" ? "Supabase" : source === "mock" ? "Mock/Fallback" : "연결 확인 중"}
        </span>
        {loadError && (
          <button type="button" onClick={onRetry} className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
            다시 시도
          </button>
        )}
      </div>
    </div>
  );
}
