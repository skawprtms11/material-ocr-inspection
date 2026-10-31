import { ImageUp } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";

type ImageUploadCardProps = {
  title: string;
  storagePath?: string;
  bucket: "material-images" | "inspection-images" | "signatures";
};

export function ImageUploadCard({ title, storagePath, bucket }: ImageUploadCardProps) {
  return (
    <CuteCard>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">Storage bucket: {bucket}</p>
        </div>
        <div className="rounded-md bg-accent p-2 text-primary">
          <ImageUp className="size-5" />
        </div>
      </div>
      <label className="flex aspect-[5/3] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-muted/30 text-center text-sm text-muted-foreground hover:bg-muted/50">
        <ImageUp className="mb-2 size-7 text-muted-foreground" />
        기준 이미지 또는 촬영 이미지를 업로드합니다
        <span className="mt-1 text-xs text-muted-foreground">{storagePath ?? "저장 전 미리보기 영역"}</span>
        <input aria-label={`${title} 이미지 업로드`} type="file" accept="image/*" className="sr-only" />
      </label>
    </CuteCard>
  );
}
