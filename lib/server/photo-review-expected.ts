import { MATERIAL_IMAGE_BUCKET, ownedMaterialImagePath } from "@/lib/server/material-reference";
import { buildWorkOrderPrintDto } from "@/lib/server/work-order";
import { text, type DbRow, type ServerSupabase } from "@/lib/server/work-register-shared";
import type { WorkOrderMaterialDto, WorkOrderPrintDto } from "@/lib/types/document-template";
import type { PhotoReviewExpectedDto, PhotoReviewWorkDto } from "@/lib/types/work-inspection-api";

type PhotoTarget = { inspectionId: string; targetType: "product" | "material"; code: string; lot?: string; materialId?: string };

// 사진 확인 팝업의 "기대 정보". 구성품(work_components) 우선·작업마스터 BOM 폴백 로직은 작업지시서 조립(buildWorkOrderPrintDto)을 그대로 쓴다.
export async function loadPhotoReviewExpected(supabase: ServerSupabase, workRow: DbRow, targets: PhotoTarget[]) {
  const print = await buildWorkOrderPrintDto(supabase, workRow, { templateCode: "", templateName: "", revisionDate: "" });
  const referenceUrls = await loadReferenceImageUrls(
    supabase,
    targets.flatMap((target) => (target.targetType === "material" && target.materialId ? [target.materialId] : []))
  );

  const expectedByInspection = new Map<string, { expected?: PhotoReviewExpectedDto; referenceImageUrl?: string }>();
  for (const target of targets) {
    const expected = target.targetType === "product" ? matchProduct(print, target) : matchMaterial(print, target);
    const referenceImageUrl = target.materialId ? referenceUrls.get(target.materialId) : undefined;
    expectedByInspection.set(target.inspectionId, {
      ...(expected ? { expected } : {}),
      ...(referenceImageUrl ? { referenceImageUrl } : {})
    });
  }

  return { work: toWorkSummary(print), expectedByInspection };
}

function toWorkSummary(print: WorkOrderPrintDto): PhotoReviewWorkDto {
  return {
    documentNo: print.work.documentNo,
    workType: print.work.workType,
    finishedProductCode: print.finished.code,
    finishedProductName: print.finished.name,
    quantity: print.work.quantity,
    finishedProductLot: print.work.finishedProductLot,
    workDate: print.work.workDate,
    dueDate: print.work.dueDate
  };
}

// 같은 코드에 LOT 분할 행이 여럿이면 해당 LOT 행을 우선하고, 없으면 합계로 보여준다.
function matchProduct(print: WorkOrderPrintDto, target: PhotoTarget): PhotoReviewExpectedDto | undefined {
  const product = print.products.find((item) => item.code === target.code);
  if (!product) return undefined;

  const exact = target.lot ? product.lots.find((lot) => lot.lot === target.lot) : undefined;
  const lots = exact ? [exact] : product.lots;
  return {
    code: product.code,
    name: product.name,
    lot: joinUnique(lots.map((lot) => lot.lot)),
    unitQuantity: product.unitQuantity,
    requiredQuantity: product.requiredQuantity,
    allocatedQuantity: lots.reduce((sum, lot) => sum + lot.allocatedQuantity, 0),
    memo: joinUnique(lots.map((lot) => lot.memo))
  };
}

function matchMaterial(print: WorkOrderPrintDto, target: PhotoTarget): PhotoReviewExpectedDto | undefined {
  const rows: WorkOrderMaterialDto[] = print.materials.filter((item) => item.code === target.code);
  if (rows.length === 0) return undefined;

  const first = rows[0];
  const methodLabel = rows.find((row) => row.inspectionMethodLabel)?.inspectionMethodLabel;
  return {
    code: first.code,
    name: first.name,
    lot: joinUnique(rows.map((row) => row.lot)),
    unitQuantity: first.unitQuantity,
    requiredQuantity: first.requiredQuantity,
    allocatedQuantity: rows.reduce((sum, row) => sum + row.allocatedQuantity, 0),
    memo: joinUnique(rows.map((row) => row.memo)),
    ...(methodLabel ? { inspectionMethodLabel: methodLabel } : {})
  };
}

function joinUnique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(", ");
}

// 부자재마스터에 등록된 기준 이미지(대표 → OCR → 비전 순)의 서명 URL. 서명 실패는 미리보기에서만 제외한다.
async function loadReferenceImageUrls(supabase: ServerSupabase, materialIds: string[]) {
  const urls = new Map<string, string>();
  const ids = Array.from(new Set(materialIds));
  if (ids.length === 0) return urls;

  const { data, error } = await supabase
    .from("material_masters")
    .select("id, reference_image_path, ocr_image_path, vision_image_path")
    .in("id", ids);
  if (error) throw error;

  const pathById = new Map<string, string>();
  for (const row of (data ?? []) as DbRow[]) {
    const path = text(row.reference_image_path) || text(row.ocr_image_path) || text(row.vision_image_path);
    if (!path) continue;
    // 해당 부자재 폴더 밖 경로(조작된 imagePath 등)는 서명하지 않는다.
    const owned = ownedMaterialImagePath(path, text(row.id));
    if (owned) pathById.set(text(row.id), owned);
    else console.warn("소유 폴더 밖 기준이미지 경로를 서명에서 제외했습니다.", { materialId: text(row.id) });
  }
  if (pathById.size === 0) return urls;

  try {
    const entries = Array.from(pathById.entries());
    const { data: signed, error: signedError } = await supabase.storage
      .from(MATERIAL_IMAGE_BUCKET)
      .createSignedUrls(entries.map(([, path]) => path), 60 * 60);
    if (signedError) throw signedError;
    entries.forEach(([id], index) => {
      const url = signed?.[index]?.signedUrl;
      if (url && !signed?.[index]?.error) urls.set(id, url);
    });
  } catch (error) {
    console.error("기준 이미지 서명 URL 발급에 실패했습니다.", error);
  }
  return urls;
}
