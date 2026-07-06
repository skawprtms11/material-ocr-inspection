import { ImageUp } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";

type ImageUploadCardProps = {
  title: string;
  storagePath?: string;
  bucket: "material-images" | "inspection-images" | "signatures";
};

export function ImageUploadCard({ title, storagePath, bucket }: ImageUploadCardProps) {
  return (
    <CuteCard className="bg-gradient-to-br from-white to-sky-50/70">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-800">{title}</h3>
          <p className="text-xs font-semibold text-slate-400">Storage bucket: {bucket}</p>
        </div>
        <div className="rounded-full bg-sky-100 p-3 text-sky-600">
          <ImageUp className="size-5" />
        </div>
      </div>
      <label className="flex aspect-[5/3] cursor-pointer flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-sky-200 bg-white/70 text-center text-sm text-slate-500">
        <ImageUp className="mb-2 size-7 text-sky-300" />
        기준 이미지 또는 촬영 이미지를 올려요
        <span className="mt-1 text-xs text-slate-400">{storagePath ?? "저장 전 미리보기 영역"}</span>
        <input aria-label={`${title} 이미지 업로드`} type="file" accept="image/*" className="sr-only" />
      </label>
    </CuteCard>
  );
}
