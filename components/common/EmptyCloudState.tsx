import { Cloud, Sparkles } from "lucide-react";

type EmptyCloudStateProps = {
  title?: string;
  description?: string;
};

export function EmptyCloudState({
  title = "구름 위에서 부서와 화주를 기다리고 있어요.",
  description = "오른쪽 상단에서 부서와 화주를 선택하면 업무 데이터가 살포시 나타납니다."
}: EmptyCloudStateProps) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-sky-200 bg-white/60 p-8 text-center">
      <div className="relative mb-5">
        <Cloud className="size-20 text-sky-200" fill="currentColor" />
        <Sparkles className="absolute -right-2 bottom-0 size-8 text-amber-400" />
      </div>
      <h2 className="text-lg font-black text-slate-700">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
