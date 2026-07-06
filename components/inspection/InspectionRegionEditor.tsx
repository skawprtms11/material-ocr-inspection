import type { MaterialInspectionRegion } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type InspectionRegionEditorProps = {
  regions: MaterialInspectionRegion[];
  mode: "OCR" | "VISION";
};

export function InspectionRegionEditor({ regions, mode }: InspectionRegionEditorProps) {
  const visibleRegions = regions.filter((region) => region.method === mode);

  return (
    <div className="rounded-[1.2rem] bg-slate-100 p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-white via-sky-50 to-violet-50">
        <div className="absolute inset-4 rounded-xl border border-dashed border-slate-200 bg-white/45" />
        {visibleRegions.map((region) => (
          <div
            key={region.id}
            className={cn(
              "absolute rounded-lg border-2 bg-white/25 shadow-sm",
              mode === "OCR" ? "border-sky-400" : "border-violet-400"
            )}
            style={{
              left: `${region.roi.x}%`,
              top: `${region.roi.y}%`,
              width: `${region.roi.width}%`,
              height: `${region.roi.height}%`
            }}
          >
            <span className="absolute -top-7 left-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 shadow-sm">
              {region.name}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {visibleRegions.map((region) => (
          <div key={region.id} className="rounded-2xl bg-white p-3 text-sm">
            <p className="font-black text-slate-700">{region.name}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              ROI x:{region.roi.x} y:{region.roi.y} w:{region.roi.width} h:{region.roi.height}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
