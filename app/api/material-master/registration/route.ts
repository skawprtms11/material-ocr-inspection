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
import { checkImageFile, imageExtension } from "@/lib/server/image-upload";
import {
  attachMissingReferences,
  materialImageFolder,
  ownedMaterialImagePath,
  safePathSegment
} from "@/lib/server/material-reference";
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
  ocrRawText?: string;
  source?: string;
  imageWidth?: number;
  imageHeight?: number;
  similarity?: number;
};

type Supa = NonNullable<ReturnType<typeof createServerSupabaseClient>>;
type RegistrationMethod = "OCR" | "VISION";

type RegistrationDeletePayload = {
  departmentId?: string;
  shipperId?: string;
  materialId?: string;
  method?: "OCR" | "VISION";
};

const materialImageBucket = "material-images";
const webSource = "web-material-registration";
const mobileSource = "mobile-material-registration";
const maxVisionImages = 5;

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

// 허용값이 아니면 모바일로 간주한다(기존 호출 호환). 'web'/'mobile' 약칭도 받는다.
function normalizeSource(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("web") ? webSource : mobileSource;
}

function positiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function methodChecked(inspectionMethod: string, method: RegistrationMethod) {
  return inspectionMethod === "BOTH" || inspectionMethod === method;
}

// 내역 보기용 필드: 등록일·출처·인식 원문·수정 여부를 options에서 꺼내 평탄화한다.
function describeRegion(row: DbRow, region: MaterialInspectionRegion) {
  const options = region.options as Record<string, unknown>;
  const savedAt = typeof options.savedAt === "string" ? options.savedAt : text(row.created_at);
  const source = typeof options.source === "string" ? options.source : "";
  const recognizedText = typeof options.recognizedText === "string" ? options.recognizedText : "";
  const ocrRawText = typeof options.ocrRawText === "string" ? options.ocrRawText : recognizedText;
  const similarity =
    typeof options.similarity === "number" ? options.similarity : region.similarity_threshold ?? undefined;

  return {
    registeredAt: savedAt || undefined,
    registrationSource: source.startsWith("web") ? "web" : source ? "mobile" : "unknown",
    ocrRawText,
    manualEdited: typeof options.manualEdited === "boolean" ? options.manualEdited : undefined,
    similarity,
    imageCount: regionImagePaths(region).length
  };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function storagePath(materialId: string, method: "OCR" | "VISION", file: File, index: number) {
  const safeMaterialId = safePathSegment(materialId);
  const safeFileName = safePathSegment(file.name.replace(/\.[^.]+$/, ""));
  const stamp = `${Date.now()}-${index + 1}`;

  return `${materialImageFolder(safeMaterialId, method)}${stamp}-${safeFileName}.${imageExtension(file.type)}`;
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
    ocrRawText: formData.has("ocrRawText") ? text(formData.get("ocrRawText")) : undefined,
    source: text(formData.get("source")) || undefined,
    imageWidth: positiveNumber(text(formData.get("imageWidth"))),
    imageHeight: positiveNumber(text(formData.get("imageHeight"))),
    similarity: text(formData.get("similarity")) ? Number(text(formData.get("similarity"))) : undefined,
    files
  };
}

async function insertInspectionRegion(
  supabase: Supa,
  body: RegistrationPayload,
  method: RegistrationMethod,
  materialId: string,
  uploadedPaths: string[],
  imagePath: string
) {
  const manualEdited =
    method === "OCR" && body.ocrRawText !== undefined && body.recognizedText !== undefined
      ? body.ocrRawText.trim() !== body.recognizedText.trim()
      : undefined;
  const options = {
    source: normalizeSource(body.source),
    recognizedText: body.recognizedText ?? "",
    ...(method === "OCR" && body.ocrRawText !== undefined ? { ocrRawText: body.ocrRawText } : {}),
    ...(manualEdited !== undefined ? { manualEdited } : {}),
    ...(body.imageWidth && body.imageHeight ? { imageNaturalSize: { width: body.imageWidth, height: body.imageHeight } } : {}),
    similarity: typeof body.similarity === "number" ? body.similarity : undefined,
    imagePath,
    uploadedPaths,
    savedAt: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("material_inspection_regions")
    .insert({
      material_id: materialId,
      method,
      name: method === "OCR" ? "OCR 선택 영역" : "비전 선택 영역",
      roi: body.roi ?? defaultRoi(),
      expected_text: body.expectedText ?? "",
      similarity_threshold: method === "VISION" && typeof body.similarity === "number" ? body.similarity : null,
      options
    })
    .select("id")
    .single();

  if (error) throw error;

  return text((data as DbRow).id);
}

// 이 부자재·방식의 업로드 폴더 안 파일만 삭제 대상으로 인정한다(다른 부자재 파일 오삭제 방지).
function ownedStoragePaths(paths: string[], materialId: string, method: RegistrationMethod) {
  const owned = paths.flatMap((path) => ownedMaterialImagePath(path, materialId, method) ?? []);
  return Array.from(new Set(owned));
}

async function removeStorageFiles(supabase: Supa, relativePaths: string[]) {
  if (relativePaths.length === 0) return;

  try {
    const { error } = await supabase.storage.from(materialImageBucket).remove(relativePaths);
    if (error) throw error;
  } catch (cleanupError) {
    console.error("스토리지 파일 정리에 실패했습니다.", cleanupError);
  }
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

async function uploadFiles(supabase: Supa, materialId: string, method: RegistrationMethod, files: File[]) {
  if (files.length === 0) return [];

  await ensureMaterialImageBucket(supabase);

  const results = await Promise.allSettled(
    files.map(async (file, index) => {
      const path = storagePath(materialId, method, file, index);
      const { error } = await supabase.storage.from(materialImageBucket).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true
      });

      if (error) throw error;

      return `${materialImageBucket}/${path}`;
    })
  );

  const uploaded = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");

  if (failed) {
    await removeStorageFiles(supabase, uploaded.map(relativeStoragePath));
    throw failed.reason;
  }

  return uploaded;
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
  // 소유 폴더 밖 경로(조작된 imagePath 등)는 서명하지 않는다.
  const allPaths = regionImagePaths(region);
  const relativePaths = allPaths.flatMap((path) => ownedMaterialImagePath(path, region.material_id, region.method) ?? []);
  if (relativePaths.length < allPaths.length) {
    console.warn("소유 폴더 밖 기준이미지 경로를 서명에서 제외했습니다.", { regionId: region.id, materialId: region.material_id });
  }
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
      .map((region) => ({ ...region, ...describeRegion({}, region), imageUrls: [] as string[] }));
    return NextResponse.json({ source: "mock", regions });
  }

  try {
    const materialRow = await assertMaterialInScope(supabase, materialId, await resolveRequestScope(supabase, requestScope));

    const { data, error } = await supabase
      .from("material_inspection_regions")
      .select("*")
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const regions = await Promise.all(
      ((data ?? []) as DbRow[]).map(async (row) => {
        const region = toRegion(row);
        const imageUrls = await resolveRegionImageUrls(supabase, region);
        return { ...region, ...describeRegion(row, region), imageUrls };
      })
    );
    const [material] = await attachMissingReferences(supabase, [toMaterial(materialRow)]);

    // material: 검증값·기준 경로·누락 사유(missing_reference)를 내역 팝업이 한 번에 쓰도록 함께 내려준다.
    return NextResponse.json({ source: "supabase", regions, verificationValue: material.verification_value, material });
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
  if (body.method !== "OCR" && body.method !== "VISION") {
    return NextResponse.json({ error: "등록 방식은 OCR 또는 VISION이어야 합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const defaultFallbackPath = `${materialImageBucket}/mobile/${body.materialId}/${body.method.toLowerCase()}-${Date.now()}.jpg`;

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    const mockPath = body.imagePath || defaultFallbackPath;
    return NextResponse.json({
      source: "mock",
      material: {
        id: body.materialId,
        reference_image_path: mockPath,
        ...(body.method === "OCR" ? { ocr_image_path: mockPath } : { vision_image_path: mockPath })
      }
    });
  }

  try {
    // 스코프 밖 부자재는 여기서 403/404로 끊는다(업로드·수정 이전).
    const currentRow = await assertMaterialInScope(supabase, body.materialId, await resolveRequestScope(supabase, requestScope));
    const materialId = body.materialId;
    const method = body.method;
    const currentReferencePath = text(currentRow.reference_image_path);

    const { data: prevData, error: prevError } = await supabase
      .from("material_inspection_regions")
      .select("*")
      .eq("material_id", materialId)
      .eq("method", method);

    if (prevError) throw prevError;

    const prevRows = (prevData ?? []) as DbRow[];
    const prevRegions = prevRows.map(toRegion);
    const currentMethodPath = text(method === "OCR" ? currentRow.ocr_image_path : currentRow.vision_image_path);

    // 체크 안 된 방식은 미사용이라 신규 등록을 막는다. 이미 등록된 기준이 있으면 조회·재등록은 허용한다.
    const alreadyRegistered = prevRegions.length > 0 || Boolean(currentMethodPath);
    if (!methodChecked(normalizeMaterialInspectionMethod(currentRow.inspection_method), method) && !alreadyRegistered) {
      return NextResponse.json(
        { error: `${method === "OCR" ? "OCR" : "비전"} 검수 방식이 체크되지 않은 부자재입니다. 부자재 수정에서 방식을 체크한 뒤 등록하세요.` },
        { status: 400 }
      );
    }

    const isWeb = normalizeSource(body.source) === webSource;
    const maxImages = method === "VISION" ? maxVisionImages : 1;

    if (body.files.length > maxImages) {
      return NextResponse.json(
        { error: method === "VISION" ? `비전 기준 이미지는 최대 ${maxVisionImages}장입니다.` : "OCR 기준 이미지는 1장만 등록할 수 있습니다." },
        { status: 400 }
      );
    }
    for (const file of body.files) {
      const imageFailure = checkImageFile(file);
      if (imageFailure) return NextResponse.json({ error: imageFailure.error }, { status: imageFailure.status });
    }

    // 파일 없이 온 클라이언트 imagePath는 이 부자재·방식 폴더 안일 때만 저장한다(다른 부자재 파일 참조 차단).
    let fallbackPath = defaultFallbackPath;
    if (body.files.length === 0 && body.imagePath) {
      const ownedPath = ownedMaterialImagePath(body.imagePath, materialId, method);
      if (!ownedPath) {
        return NextResponse.json({ error: "imagePath가 해당 부자재의 업로드 경로가 아닙니다." }, { status: 400 });
      }
      fallbackPath = `${materialImageBucket}/${ownedPath}`;
    }

    if (isWeb && body.files.length === 0) {
      return NextResponse.json({ error: "기준 이미지 파일이 필요합니다." }, { status: 400 });
    }
    if (isWeb && method === "OCR" && !body.recognizedText?.trim()) {
      return NextResponse.json({ error: "OCR 검증값(recognizedText)이 필요합니다." }, { status: 400 });
    }

    const newPaths = await uploadFiles(supabase, materialId, method, body.files);
    const imagePath = newPaths[0] ?? fallbackPath;
    let newRegionId = "";

    try {
      // 새 region을 먼저 넣고 material을 갱신한 뒤에만 이전 region·파일을 지운다(부분 실패 시 경로가 깨지지 않게).
      newRegionId = await insertInspectionRegion(supabase, body, method, materialId, newPaths, imagePath);

      // 기준 이미지 등록은 inspection_method(운영자의 검수 방식 선택)를 바꾸지 않는다.
      // OCR 검증값: recognizedText가 전송된 경우 빈 값이어도 그대로 저장하고, 미전송이면 기존 검증값 유지 후 부자재코드(expectedText)로 폴백한다.
      const updatePayload = {
        // 대표 경로가 이번에 교체되는 같은 방식의 이전 파일이면 새 경로로 바꾼다(삭제된 파일을 가리키지 않게).
        reference_image_path:
          currentReferencePath && currentReferencePath !== currentMethodPath ? currentReferencePath : imagePath,
        ...(method === "OCR" ? { ocr_image_path: imagePath } : { vision_image_path: imagePath }),
        ...(method === "OCR"
          ? {
              verification_value: body.recognizedTextProvided
                ? body.recognizedText ?? ""
                : text(currentRow.verification_value) || body.expectedText
            }
          : {})
      };

      const { data: updated, error: updateError } = await supabase
        .from("material_masters")
        .update(updatePayload)
        .eq("id", materialId)
        .select("*")
        .single();

      if (updateError) throw updateError;

      const prevRegionIds = prevRows.map((row) => text(row.id)).filter(Boolean);

      if (prevRegionIds.length > 0) {
        const { error: oldDeleteError } = await supabase.from("material_inspection_regions").delete().in("id", prevRegionIds);
        // 실패해도 새 기준은 이미 반영됨. 소비처는 첫 행만 쓰고 다음 저장 때 정리되므로 로그만 남긴다.
        if (oldDeleteError) console.error("이전 등록 영역 삭제에 실패했습니다.", oldDeleteError);
      }

      // 새 파일이 있을 때만 이전 파일을 정리한다(새 파일이 없으면 경로 교체가 없으므로).
      if (newPaths.length > 0) {
        const keep = new Set(newPaths.map(relativeStoragePath));
        const prevPaths = [...prevRegions.flatMap(regionImagePaths), currentMethodPath];
        await removeStorageFiles(
          supabase,
          ownedStoragePaths(prevPaths, materialId, method).filter((path) => !keep.has(path))
        );
      }

      const [material] = await attachMissingReferences(supabase, [toMaterial(updated as DbRow)]);
      return NextResponse.json({ source: "supabase", material, uploadedPaths: newPaths });
    } catch (dbError) {
      if (newRegionId) {
        const { error: rollbackError } = await supabase.from("material_inspection_regions").delete().eq("id", newRegionId);
        if (rollbackError) console.error("새 등록 영역 롤백에 실패했습니다.", rollbackError);
      }
      await removeStorageFiles(supabase, newPaths.map(relativeStoragePath));
      throw dbError;
    }
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

    const regionSelect = supabase.from("material_inspection_regions").select("*").eq("material_id", body.materialId);
    const { data: prevData, error: prevError } = body.method ? await regionSelect.eq("method", body.method) : await regionSelect;
    if (prevError) throw prevError;

    // material 갱신이 성공한 뒤에만 region을 지운다(갱신 실패 시 region만 사라지지 않게).
    const { data, error } = await supabase
      .from("material_masters")
      .update(updatePayload)
      .eq("id", body.materialId)
      .select("*")
      .single();

    if (error) throw error;

    const regionDelete = supabase
      .from("material_inspection_regions")
      .delete()
      .eq("material_id", body.materialId);
    const { error: regionError } = body.method ? await regionDelete.eq("method", body.method) : await regionDelete;
    if (regionError) throw regionError;

    for (const method of ["OCR", "VISION"] as const) {
      if (!(method === "OCR" ? deleted.ocr : deleted.vision)) continue;

      const methodPaths = ((prevData ?? []) as DbRow[])
        .map(toRegion)
        .filter((region) => region.method === method)
        .flatMap(regionImagePaths);
      const rowPath = text(method === "OCR" ? currentRow.ocr_image_path : currentRow.vision_image_path);
      await removeStorageFiles(supabase, ownedStoragePaths([...methodPaths, rowPath], body.materialId, method));
    }

    const [material] = await attachMissingReferences(supabase, [toMaterial(data as DbRow)]);
    return NextResponse.json({ source: "supabase", material });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "부자재 등록 삭제에 실패했습니다.") }, { status: 502 });
  }
}
