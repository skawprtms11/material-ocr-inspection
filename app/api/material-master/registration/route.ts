import { NextRequest, NextResponse } from "next/server";
import { normalizeMaterialInspectionMethod } from "@/lib/inspection/method-plan";
import { appRepository } from "@/lib/repositories/app-repository";
import {
  assertMaterialInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody,
  scopeFromSearchParams,
} from "@/lib/server/scope-guard";
import { attachMissingReferences } from "@/lib/server/material-reference";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MaterialInspectionRegion, MaterialMaster, RoiRect } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

type RegistrationPayload = {
  departmentId?: string;
  shipperId?: string;
  materialId?: string;
  method?: "OCR" | "VISION";
  imagePath?: string;
  roi?: RoiRect;
  expectedText?: string;
  recognizedText?: string;
  similarity?: number;
};

type RegistrationDeletePayload = {
  departmentId?: string;
  shipperId?: string;
  materialId?: string;
  method?: "OCR" | "VISION";
};

const materialImageBucket = "material-images";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toMaterial(row: DbRow): MaterialMaster {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: normalizeMaterialInspectionMethod(row.inspection_method),
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    verification_value: text(row.verification_value)
  };
}

function toRegion(row: DbRow): MaterialInspectionRegion {
  const method = row.method === "OCR" || row.method === "VISION" ? row.method : "OCR";

  return {
    id: text(row.id),
    material_id: text(row.material_id),
    method,
    name: text(row.name),
    roi: (row.roi as RoiRect) ?? defaultRoi(),
    expected_text: text(row.expected_text) || undefined,
    similarity_threshold: typeof row.similarity_threshold === "number" ? row.similarity_threshold : undefined,
    options: (row.options as Record<string, unknown>) ?? {}
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

function defaultRoi(): RoiRect {
  return { x: 0, y: 0, width: 100, height: 100 };
}

function parseOptionalJson<T>(value: string, field: string): T | undefined {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${field} 형식이 올바르지 않습니다.`);
  }
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validateRoi(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("roi 형식이 올바르지 않습니다.");

  const record = value as Record<string, unknown>;
  const x = numberField(record.x);
  const y = numberField(record.y);
  const width = numberField(record.width);
  const height = numberField(record.height);

  if (x === null || y === null || width === null || height === null) throw new Error("roi 값은 숫자여야 합니다.");
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
    throw new Error("roi 범위는 0~100 안에 있어야 합니다.");
  }

  return { x, y, width, height };
}

async function parseRequest(
  request: NextRequest
): Promise<RegistrationPayload & { files: File[]; recognizedTextProvided: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    const body = (await request.json()) as RegistrationPayload;
    return {
      ...body,
      roi: validateRoi(body.roi),
      files: [],
      recognizedTextProvided: typeof body.recognizedText === "string"
    };
  }

  const formData = await request.formData();
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const singleFile = formData.get("image");

  if (singleFile instanceof File && singleFile.size > 0) files.unshift(singleFile);

  return {
    departmentId: text(formData.get("departmentId")),
    shipperId: text(formData.get("shipperId")),
    materialId: text(formData.get("materialId")),
    method: text(formData.get("method")) as RegistrationPayload["method"],
    imagePath: text(formData.get("imagePath")) || undefined,
    roi: validateRoi(parseOptionalJson<RoiRect>(text(formData.get("roi")), "roi")),
    expectedText: text(formData.get("expectedText")) || undefined,
    // 값이 빈 문자열이어도(OCR 검증불가 등) 실제로 전송됐는지를 구분해야 검증값 저장 시 fallback 여부를 판단할 수 있다.
    recognizedText: formData.has("recognizedText") ? text(formData.get("recognizedText")) : undefined,
    recognizedTextProvided: formData.has("recognizedText"),
    similarity: text(formData.get("similarity")) ? Number(text(formData.get("similarity"))) : undefined,
    files
  };
}

async function saveInspectionRegion(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  body: RegistrationPayload,
  uploadedPaths: string[],
  imagePath: string
) {
  if (!body.materialId || !body.method) return;

  const methodLabel = body.method === "OCR" ? "OCR 선택 영역" : "비전 선택 영역";
  const options = {
    source: "mobile-material-registration",
    recognizedText: body.recognizedText ?? "",
    similarity: typeof body.similarity === "number" ? body.similarity : undefined,
    imagePath,
    uploadedPaths,
    savedAt: new Date().toISOString()
  };

  const { error: deleteError } = await supabase
    .from("material_inspection_regions")
    .delete()
    .eq("material_id", body.materialId)
    .eq("method", body.method);

  if (deleteError) throw deleteError;

  const { error } = await supabase.from("material_inspection_regions").insert({
    material_id: body.materialId,
    method: body.method,
    name: methodLabel,
    roi: body.roi ?? defaultRoi(),
    expected_text: body.expectedText ?? "",
    similarity_threshold: body.method === "VISION" && typeof body.similarity === "number" ? body.similarity : null,
    options
  });

  if (error) throw error;
}

function deletedMethodSet(method?: "OCR" | "VISION") {
  return {
    ocr: !method || method === "OCR",
    vision: !method || method === "VISION"
  };
}

function nextReferencePath(row: DbRow, deleteOcr: boolean, deleteVision: boolean) {
  const currentReference = text(row.reference_image_path);
  const ocrPath = text(row.ocr_image_path);
  const visionPath = text(row.vision_image_path);
  const nextOcrPath = deleteOcr ? "" : ocrPath;
  const nextVisionPath = deleteVision ? "" : visionPath;

  if (currentReference && currentReference !== ocrPath && currentReference !== visionPath) return currentReference;
  return nextOcrPath || nextVisionPath || "";
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

function relativeStoragePath(path: string) {
  return path.startsWith(`${materialImageBucket}/`) ? path.slice(materialImageBucket.length + 1) : path;
}

function regionImagePaths(region: MaterialInspectionRegion) {
  const options = region.options as { uploadedPaths?: unknown; imagePath?: unknown };
  const uploadedPaths = Array.isArray(options.uploadedPaths)
    ? options.uploadedPaths.filter((path): path is string => typeof path === "string" && path.length > 0)
    : [];

  if (uploadedPaths.length > 0) return uploadedPaths;
  return typeof options.imagePath === "string" && options.imagePath ? [options.imagePath] : [];
}

async function resolveRegionImageUrls(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  region: MaterialInspectionRegion
) {
  const relativePaths = regionImagePaths(region).map(relativeStoragePath);
  if (relativePaths.length === 0) return [];

  try {
    const { data, error } = await supabase.storage.from(materialImageBucket).createSignedUrls(relativePaths, 60 * 60);
    if (error) throw error;

    return (data ?? [])
      .filter((item) => !item.error && item.signedUrl)
      .map((item) => item.signedUrl as string);
  } catch (error) {
    // 서명 URL 발급 실패는 미리보기에서만 조용히 제외한다.
    console.error("서명 URL 발급에 실패했습니다.", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const materialId = searchParams.get("material_id");
  const requestScope = scopeFromSearchParams(searchParams);

  if (!materialId) {
    return NextResponse.json({ error: "material_id가 필요합니다." }, { status: 400 });
  }
  if (!requestScope) return missingScopeResponse();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    const regions = appRepository
      .listMaterialRegions(materialId)
      .map((region) => ({ ...region, imageUrls: [] as string[] }));
    return NextResponse.json({ source: "mock", regions });
  }

  try {
    await assertMaterialInScope(supabase, materialId, await resolveRequestScope(supabase, requestScope));

    const { data, error } = await supabase
      .from("material_inspection_regions")
      .select("*")
      .eq("material_id", materialId);

    if (error) throw error;

    const regions = await Promise.all(
      ((data ?? []) as DbRow[]).map(async (row) => {
        const region = toRegion(row);
        const imageUrls = await resolveRegionImageUrls(supabase, region);
        return { ...region, imageUrls };
      })
    );

    return NextResponse.json({ source: "supabase", regions });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json(
      { error: errorMessage(error, "등록 영역 조회에 실패했습니다.") },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: RegistrationPayload & { files: File[]; recognizedTextProvided: boolean };

  try {
    body = await parseRequest(request);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "등록 요청 형식이 올바르지 않습니다.") }, { status: 400 });
  }

  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

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
        reference_image_path: fallbackPath,
        ...(body.method === "OCR" ? { ocr_image_path: fallbackPath } : { vision_image_path: fallbackPath })
      }
    });
  }

  try {
    // 스코프 밖 부자재는 여기서 403/404로 끊는다(업로드·수정 이전).
    const currentRow = await assertMaterialInScope(supabase, body.materialId, await resolveRequestScope(supabase, requestScope));
    const currentReferencePath = text(currentRow.reference_image_path);
    const uploadedPaths = await uploadFiles(supabase, body.materialId, body.method, body.files);
    const imagePath = uploadedPaths[0] ?? fallbackPath;

    // 기준 이미지 등록은 inspection_method(운영자의 검수 방식 선택)를 바꾸지 않는다.
    const updatePayload = {
      reference_image_path: currentReferencePath || imagePath,
      ...(body.method === "OCR" ? { ocr_image_path: imagePath } : {}),
      ...(body.method === "VISION" ? { vision_image_path: imagePath } : {}),
      // 검증값은 모바일 OCR 검수·저장 시 확정된 인식값을 작업검수 기준값으로 사용한다.
      // recognizedText가 실제로 전송된 경우(OCR 검토를 거친 경우)는 빈 값이어도 그대로 저장하고,
      // 전송되지 않은 경우(예: 웹 관리자의 단순 이미지 등록)는 기존 검증값을 유지하고, 없을 때만 부자재코드로 폴백한다.
      ...(body.method === "OCR"
        ? {
            verification_value: body.recognizedTextProvided
              ? body.recognizedText ?? ""
              : text(currentRow.verification_value) || body.expectedText
          }
        : {})
    };

    let data: DbRow;

    try {
      const { data: updated, error } = await supabase
        .from("material_masters")
        .update(updatePayload)
        .eq("id", body.materialId)
        .select("*")
        .single();

      if (error) throw error;

      data = updated as DbRow;

      await saveInspectionRegion(supabase, body, uploadedPaths, imagePath);
    } catch (dbError) {
      // 업로드 성공 후 DB 저장이 실패하면 고아 파일이 남지 않도록 스토리지를 정리한다.
      if (uploadedPaths.length > 0) {
        try {
          const relativePaths = uploadedPaths.map((path) =>
            path.startsWith(`${materialImageBucket}/`) ? path.slice(materialImageBucket.length + 1) : path
          );
          await supabase.storage.from(materialImageBucket).remove(relativePaths);
        } catch (cleanupError) {
          console.error("업로드된 파일 정리에 실패했습니다.", cleanupError);
        }
      }

      throw dbError;
    }

    const [material] = await attachMissingReferences(supabase, [toMaterial(data)]);
    return NextResponse.json({ source: "supabase", material, uploadedPaths });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "부자재 등록 정보를 저장하지 못했습니다.") }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RegistrationDeletePayload;

  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

  if (!body.materialId) {
    return NextResponse.json({ error: "부자재 ID가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const deleted = deletedMethodSet(body.method);

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      material: {
        id: body.materialId,
        reference_image_path: "",
        ...(deleted.ocr ? { ocr_image_path: "" } : {}),
        ...(deleted.vision ? { vision_image_path: "" } : {})
      }
    });
  }

  try {
    const currentRow = await assertMaterialInScope(supabase, body.materialId, await resolveRequestScope(supabase, requestScope));
    const updatePayload = {
      reference_image_path: nextReferencePath(currentRow, deleted.ocr, deleted.vision),
      ...(deleted.ocr ? { ocr_image_path: "", verification_value: "" } : {}),
      ...(deleted.vision ? { vision_image_path: "" } : {})
    };

    const regionDelete = supabase
      .from("material_inspection_regions")
      .delete()
      .eq("material_id", body.materialId);
    const { error: regionError } = body.method ? await regionDelete.eq("method", body.method) : await regionDelete;
    if (regionError) throw regionError;

    const { data, error } = await supabase
      .from("material_masters")
      .update(updatePayload)
      .eq("id", body.materialId)
      .select("*")
      .single();

    if (error) throw error;

    const [material] = await attachMissingReferences(supabase, [toMaterial(data as DbRow)]);
    return NextResponse.json({ source: "supabase", material });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "부자재 등록 삭제에 실패했습니다.") }, { status: 502 });
  }
}
