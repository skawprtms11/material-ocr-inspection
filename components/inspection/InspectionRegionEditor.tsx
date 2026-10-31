import type { MaterialInspectionRegion } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type InspectionRegionEditorProps = {
  regions: MaterialInspectionRegion[];
  mode: "OCR" | "VISION";
};

export function InspectionRegionEditor({ regions, mode }: InspectionRegionEditorProps) {
  const visibleRegions = regions.filter((region) => region.method === mode);

  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted/30">
        <div className="absolute inset-4 rounded-md border border-dashed border-input" />
        {visibleRegions.map((region) => (
          <div
            key={region.id}
            className={cn(
              "absolute rounded-md border-2 bg-white/25",
              mode === "OCR" ? "border-blue-400" : "border-violet-400"
            )}
            style={{
              left: `${region.roi.x}%`,
              top: `${region.roi.y}%`,
              width: `${region.roi.width}%`,
              height: `${region.roi.height}%`
            }}
          >
            <span className="absolute -top-7 left-0 rounded-md bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-xs">
              {region.name}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {visibleRegions.map((region) => (
          <div key={region.id} className="rounded-md border border-border bg-card p-3 text-sm">
            <p className="font-semibold text-foreground">{region.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ROI x:{region.roi.x} y:{region.roi.y} w:{region.roi.width} h:{region.roi.height}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
