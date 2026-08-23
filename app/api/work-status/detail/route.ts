import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod, InspectionStatus } from "@/lib/types/domain";
import type {
  WorkDetailInfoDto,
  WorkDetailMaterialDto,
  WorkDetailMaterialInspectionDto,
  WorkDetailProductDto,
  WorkDetailProductsSourceDto,
  WorkDetailResponse
} from "@/lib/types/work-status-api";

type DbRow = Record<string, unknown>;

const inspectionImageBucket = "inspection-images";
// 검수 사진 표시 우선순위: OCR 촬영본을 먼저, 제품검수 촬영본을 뒤에 보여준다.
const imageTypePriority: Record<string, number> = { ocr_capture: 0, product: 1, vision_capture: 1, admin_review: 2 };

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getFallbackFinishedProductLot(workDate: string) {
  return `LOT-${workDate.replaceAll("-", "").slice(2)}-01`;
}

// inspection_images.storage_path는 "{버킷명}/{경로}" 형태로 저장돼 있어 서명 URL 발급 전 버킷 프리픽스를 제거해야 한다.
function relativeStoragePath(path: string) {
  return path.startsWith(`${inspectionImageBucket}/`) ? path.slice(inspectionImageBucket.length + 1) : path;
}

function mockDetail(workId: string): WorkDetailResponse | null {
  const work = appRepository.findWorkById(workId);
  if (!work) return null;

  const workMaster = appRepository.listWorkMasters({}).find((item) => item.id === work.work_master_id);
  const materialMappings = appRepository.listWorkMasterMaterials(work.work_master_id);
  const materialById = new Map(appRepository.listMaterials({}).map((material) => [material.id, material]));
  const inspections = appRepository.listInspections(work.id);

  const products: WorkDetailProductDto[] = workMaster
    ? [
        {
          id: workMaster.id,
          productCode: workMaster.code,
          productName: workMaster.name,
          unitQuantity: 1,
          productType: "정상품"
        }
      ]
    : [];

  const materials: WorkDetailMaterialDto[] = materialMappings
    .slice()
    .sort((a, b) => a.inspection_order - b.inspection_order)
    .map((mapping) => {
      const material = materialById.get(mapping.material_id);
      const materialInspections: WorkDetailMaterialInspectionDto[] = inspections
        .filter((inspection) => inspection.material_id === mapping.material_id)
        .map((inspection) => ({ method: inspection.method, status: inspection.status }));

      return {
        id: mapping.id,
        materialId: mapping.material_id,
        materialCode: material?.code ?? "-",
        materialName: material?.name ?? "-",
        inspectionMethod: material?.inspection_method ?? "BOTH",
        unitQuantity: 1,
        verificationValue: material?.verification_value ?? "",
        inspections: materialInspections,
        // mock storage_path는 실제 Supabase 버킷 경로가 아니므로 서명 URL을 발급할 수 없다.
        imageUrls: []
      };
    });

  return {
    source: "mock",
    work: {
      workId: work.id,
      documentNo: work.document_no,
      productCode: workMaster?.code ?? "-",
      productName: workMaster?.name ?? "-",
      quantity: 0,
      lot: getFallbackFinishedProductLot(work.work_date),
      workerName: work.worker_name,
      workDate: work.work_date
    },
    products,
    productsSource: "work_master",
    materials
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workId = searchParams.get("work_id");

  if (!workId) {
    return NextResponse.json({ error: "work_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    const detail = mockDetail(workId);
    if (!detail) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(detail);
  }

  try {
    const { data: workRow, error: workError } = await supabase.from("works").select("*").eq("id", workId).maybeSingle();
    if (workError) throw workError;
    if (!workRow) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

    const work = workRow as DbRow;
    const workMasterId = text(work.work_master_id);

    const { data: workMasterRow, error: workMasterError } = await supabase
      .from("work_masters")
      .select("*")
      .eq("id", workMasterId)
      .maybeSingle();
    if (workMasterError) throw workMasterError;
    const workMaster = workMasterRow as DbRow | null;

    // 1) 제품내역: 해당 작업에 실제 배분된 work_components(LOT 단위)를 우선 사용하고, 없으면 작업마스터 구성으로 폴백한다.
    const { data: componentRows, error: componentError } = await supabase
      .from("work_components")
      .select("*")
      .eq("work_id", workId);
    if (componentError) throw componentError;

    const productComponentRows = ((componentRows ?? []) as DbRow[]).filter((row) => text(row.component_type) === "제품");

    let products: WorkDetailProductDto[];
    let productsSource: WorkDetailProductsSourceDto;

    if (productComponentRows.length > 0) {
      productsSource = "work_components";
      products = productComponentRows.map((row) => ({
        id: text(row.id),
        productCode: text(row.component_code),
        productName: text(row.component_name),
        unitQuantity: numberValue(row.unit_quantity, 1),
        lot: text(row.lot) || undefined,
        requiredQuantity: typeof row.required_quantity === "number" ? row.required_quantity : undefined,
        allocatedQuantity: typeof row.allocated_quantity === "number" ? row.allocated_quantity : undefined,
        memo: text(row.memo) || undefined
      }));
    } else {
      productsSource = "work_master";
      const { data: productRows, error: productError } = await supabase
        .from("work_master_products")
        .select("product_code, product_name, unit_quantity, product_type, sort_order")
        .eq("work_master_id", workMasterId)
        .order("sort_order", { ascending: true });
      if (productError) throw productError;

      products = ((productRows ?? []) as DbRow[]).map((row, index) => {
        const productType = text(row.product_type, "정상품");
        return {
          id: `${workMasterId}-product-${index}`,
          productCode: text(row.product_code),
          productName: text(row.product_name),
          unitQuantity: numberValue(row.unit_quantity, 1),
          productType: productType === "샘플" || productType === "세트제품" ? productType : "정상품"
        };
      });
    }

    // 2) 부자재 내역: work_master_materials + material_masters 조합.
    const { data: materialMappingRows, error: materialMappingError } = await supabase
      .from("work_master_materials")
      .select("*")
      .eq("work_master_id", workMasterId)
      .order("inspection_order", { ascending: true });
    if (materialMappingError) throw materialMappingError;

    const materialMappings = (materialMappingRows ?? []) as DbRow[];
    const materialIds = materialMappings.map((row) => text(row.material_id)).filter(Boolean);

    const { data: materialRows, error: materialError } =
      materialIds.length > 0
        ? await supabase.from("material_masters").select("*").in("id", materialIds)
        : { data: [] as DbRow[], error: null };
    if (materialError) throw materialError;

    const materialById = new Map(((materialRows ?? []) as DbRow[]).map((row) => [text(row.id), row]));

    const { data: inspectionRows, error: inspectionError } = await supabase
      .from("work_inspections")
      .select("id, material_id, method, status")
      .eq("work_id", workId);
    if (inspectionError) throw inspectionError;

    const inspectionRowList = (inspectionRows ?? []) as DbRow[];
    const inspectionsByMaterial = new Map<string, WorkDetailMaterialInspectionDto[]>();
    const materialIdByInspectionId = new Map<string, string>();

    for (const row of inspectionRowList) {
      const materialId = text(row.material_id);
      materialIdByInspectionId.set(text(row.id), materialId);
      const list = inspectionsByMaterial.get(materialId) ?? [];
      list.push({
        method: text(row.method, "OCR") as Exclude<InspectionMethod, "BOTH">,
        status: text(row.status, "pending") as InspectionStatus
      });
      inspectionsByMaterial.set(materialId, list);
    }

    // 3) 부자재별 OCR/제품검수 사진: inspection_images를 work_id로 조회 후 inspection_id -> material_id로 매핑한다.
    const { data: imageRows, error: imageError } = await supabase
      .from("inspection_images")
      .select("inspection_id, image_type, storage_path, created_at")
      .eq("work_id", workId)
      .order("created_at", { ascending: true });
    if (imageError) throw imageError;

    const sortedImageRows = ((imageRows ?? []) as DbRow[])
      .filter((row) => materialIdByInspectionId.has(text(row.inspection_id)))
      .slice()
      .sort((a, b) => (imageTypePriority[text(a.image_type)] ?? 9) - (imageTypePriority[text(b.image_type)] ?? 9));

    const relativePaths = sortedImageRows.map((row) => relativeStoragePath(text(row.storage_path)));
    let signedUrlByPath = new Map<string, string>();

    if (relativePaths.length > 0) {
      const { data: signedUrls, error: signedUrlError } = await supabase.storage
        .from(inspectionImageBucket)
        .createSignedUrls(relativePaths, 60 * 60);
      // 서명 URL 발급 실패는 사진 미리보기 없이 나머지 상세내역은 정상 표시되도록 조용히 넘긴다.
      if (!signedUrlError) {
        signedUrlByPath = new Map(
          (signedUrls ?? [])
            .filter((item) => !item.error && item.signedUrl && item.path)
            .map((item) => [item.path as string, item.signedUrl as string])
        );
      }
    }

    const imageUrlsByMaterial = new Map<string, string[]>();
    sortedImageRows.forEach((row, index) => {
      const materialId = materialIdByInspectionId.get(text(row.inspection_id));
      if (!materialId) return;
      const signedUrl = signedUrlByPath.get(relativePaths[index]);
      if (!signedUrl) return;
      const list = imageUrlsByMaterial.get(materialId) ?? [];
      list.push(signedUrl);
      imageUrlsByMaterial.set(materialId, list);
    });

    const materials: WorkDetailMaterialDto[] = materialMappings.map((mapping) => {
      const materialId = text(mapping.material_id);
      const material = materialById.get(materialId);
      const inspectionMethod = text(material?.inspection_method, "BOTH");

      return {
        id: text(mapping.id),
        materialId,
        materialCode: text(material?.code, "-"),
        materialName: text(material?.name, "-"),
        inspectionMethod: inspectionMethod === "OCR" || inspectionMethod === "VISION" ? inspectionMethod : "BOTH",
        unitQuantity: numberValue(mapping.unit_quantity, 1),
        verificationValue: text(material?.verification_value),
        inspections: inspectionsByMaterial.get(materialId) ?? [],
        imageUrls: imageUrlsByMaterial.get(materialId) ?? []
      };
    });

    const workInfo: WorkDetailInfoDto = {
      workId: text(work.id),
      documentNo: text(work.document_no),
      productCode: text(workMaster?.code, "-"),
      productName: text(workMaster?.name, "-"),
      quantity: numberValue(work.quantity, 0),
      lot: text(work.finished_product_lot) || getFallbackFinishedProductLot(text(work.work_date)),
      workerName: text(work.worker_name),
      workDate: text(work.work_date)
    };

    return NextResponse.json({
      source: "supabase",
      work: workInfo,
      products,
      productsSource,
      materials
    } satisfies WorkDetailResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업 상세내역 조회에 실패했습니다.") }, { status: 502 });
  }
}
