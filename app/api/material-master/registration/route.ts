import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod, MaterialMaster, RoiRect } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

type RegistrationPayload = {
  materialId?: string;
  method?: "OCR" | "VISION";
  imagePath?: string;
  roi?: RoiRect;
  expectedText?: string;
  recognizedText?: string;
  similarity?: number;
};

const materialImageBucket = "material-images";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toInspectionMethod(value: unknown): InspectionMethod {
  return value === "OCR" || value === "VISION" || value === "BOTH" ? value : "BOTH";
}

function mergeInspectionMethod(current: InspectionMethod, method: "OCR" | "VISION"): InspectionMethod {
  const hasOcr = current === "OCR" || current === "BOTH" || method === "OCR";
  const hasVision = current === "VISION" || current === "BOTH" || method === "VISION";

  if (hasOcr && hasVision) return "BOTH";
  if (hasVision) return "VISION";
  return "OCR";
}

function toMaterial(row: DbRow): MaterialMaster {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: toInspectionMethod(row.inspection_method),
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true
  };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function safePathSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9가-힣._-]+/g, "-");
}

function fileExtension(file: File) {
  const nameExtension = file.name.split(".").pop();
  if (nameExtension && nameExtension !== file.name) return nameExtension.toLowerCase();
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function storagePath(materialId: string, method: "OCR" | "VISION", file: File, index: number) {
  const safeMaterialId = safePathSegment(materialId);
  const safeFileName = safePathSegment(file.name.replace(/\.[^.]+$/, ""));
  const stamp = `${Date.now()}-${index + 1}`;

  return `mobile/${safeMaterialId}/${method.toLowerCase()}/${stamp}-${safeFileName}.${fileExtension(file)}`;
}

async function parseRequest(request: NextRequest): Promise<RegistrationPayload & { files: File[] }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return { ...((await request.json()) as RegistrationPayload), files: [] };
  }

  const formData = await request.formData();
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const singleFile = formData.get("image");

  if (singleFile instanceof File && singleFile.size > 0) files.unshift(singleFile);

  return {
    materialId: text(formData.get("materialId")),
    method: text(formData.get("method")) as RegistrationPayload["method"],
    imagePath: text(formData.get("imagePath")) || undefined,
    roi: text(formData.get("roi")) ? (JSON.parse(text(formData.get("roi"))) as RoiRect) : undefined,
    expectedText: text(formData.get("expectedText")) || undefined,
    recognizedText: text(formData.get("recognizedText")) || undefined,
    similarity: text(formData.get("similarity")) ? Number(text(formData.get("similarity"))) : undefined,
    files
  };
}

async function ensureMaterialImageBucket(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const { error } = await supabase.storage.getBucket(materialImageBucket);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(materialImageBucket, {
    public: false,
    fileSizeLimit: 1024 * 1024 * 8,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) throw createError;
}

async function uploadFiles(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  materialId: string,
  method: "OCR" | "VISION",
  files: File[]
) {
  if (files.length === 0) return [];

  await ensureMaterialImageBucket(supabase);

  return Promise.all(
    files.map(async (file, index) => {
      const path = storagePath(materialId, method, file, index);
      const { error } = await supabase.storage.from(materialImageBucket).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
        upsert: true
      });

      if (error) throw error;

      return `${materialImageBucket}/${path}`;
    })
  );
}

export async function POST(request: NextRequest) {
  const body = await parseRequest(request);

  if (!body.materialId || !body.method) {
    return NextResponse.json({ error: "부자재 ID와 등록 방식이 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const fallbackPath = body.imagePath || `${materialImageBucket}/mobile/${body.materialId}/${body.method.toLowerCase()}-${Date.now()}.jpg`;

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      material: {
        id: body.materialId,
        inspection_method: body.method,
        reference_image_path: fallbackPath,
        ...(body.method === "OCR" ? { ocr_image_path: fallbackPath } : { vision_image_path: fallbackPath })
      }
    });
  }

  try {
    const { data: current, error: selectError } = await supabase
      .from("material_masters")
      .select("*")
      .eq("id", body.materialId)
      .single();

    if (selectError) throw selectError;

    const currentRow = current as DbRow;
    const currentMethod = toInspectionMethod(currentRow.inspection_method);
    const nextMethod = mergeInspectionMethod(currentMethod, body.method);
    const currentReferencePath = text(currentRow.reference_image_path);
    const uploadedPaths = await uploadFiles(supabase, body.materialId, body.method, body.files);
    const imagePath = uploadedPaths[0] ?? fallbackPath;

    const updatePayload = {
      inspection_method: nextMethod,
      reference_image_path: currentReferencePath || imagePath,
      ...(body.method === "OCR" ? { ocr_image_path: imagePath } : {}),
      ...(body.method === "VISION" ? { vision_image_path: imagePath } : {})
    };

    const { data, error } = await supabase
      .from("material_masters")
      .update(updatePayload)
      .eq("id", body.materialId)
      .select("*")
      .single();

    if (error) throw error;

    // TODO: material_inspection_regions 저장을 붙이면 roi/expectedText/similarity와 다중 비전 이미지 path를 함께 영속화한다.
    return NextResponse.json({ source: "supabase", material: toMaterial(data as DbRow), uploadedPaths });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "부자재 등록 정보를 저장하지 못했습니다.") }, { status: 500 });
  }
}
