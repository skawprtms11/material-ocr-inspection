import { NextResponse } from "next/server";
import { z } from "zod";
import { documentSettingsSchema, layoutKeySchema } from "@/lib/documents/settings-schema";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { guardErrorResponse } from "@/lib/server/scope-guard";
import { RouteError, text, type DbRow, type ServerSupabase } from "@/lib/server/work-register-shared";
import type {
  DocumentLayoutSettings,
  DocumentTemplate,
  LayoutKey,
  ShipperDocumentTemplate
} from "@/lib/types/document-template";

// 양식·화주매핑 API 공용 헬퍼. 스코프 가드(scope-guard.ts)는 그대로 쓰고, 양식 리소스 전용 대조만 여기에 둔다.

export function toTemplate(row: DbRow): DocumentTemplate {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    doc_kind: "work_order",
    code: text(row.code),
    name: text(row.name),
    revision_date: text(row.revision_date).slice(0, 10),
    template_type: text(row.template_type, "layout") as DocumentTemplate["template_type"],
    layout_key: (typeof row.layout_key === "string" ? row.layout_key : null) as LayoutKey | null,
    settings: (row.settings && typeof row.settings === "object" ? row.settings : {}) as DocumentTemplate["settings"],
    schema_version: typeof row.schema_version === "number" ? row.schema_version : 1,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    memo: typeof row.memo === "string" ? row.memo : null,
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

export function toMappingRow(row: DbRow): ShipperDocumentTemplate {
  return {
    id: text(row.id),
    shipper_id: text(row.shipper_id),
    template_id: text(row.template_id),
    is_default: row.is_default === true,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function pgCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

export const isUniqueViolation = (error: unknown) => pgCode(error) === "23505";
export const isForeignKeyViolation = (error: unknown) => pgCode(error) === "23503";

// 가드 RouteError는 그 상태로, 그 외 DB 오류는 502(mock 폴백 없음)로 응답한다.
export function routeErrorResponse(error: unknown, fallback: string) {
  const guardResponse = guardErrorResponse(error);
  if (guardResponse) return guardResponse;
  return NextResponse.json({ error: errorMessage(error, fallback) }, { status: 502 });
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return body as T;
  } catch {
    throw new RouteError("요청 본문이 올바른 JSON이 아닙니다.", 400);
  }
}

export function isMockMode(supabase: unknown) {
  return !supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
}

// 양식 존재(404)·부서 일치(403)를 대조해 행을 돌려준다.
export async function fetchTemplateInDepartment(supabase: ServerSupabase, templateId: string, departmentId: string) {
  const { data, error } = await supabase.from("document_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RouteError("양식을 찾을 수 없습니다.", 404);
  if (text((data as DbRow).department_id) !== departmentId) throw new RouteError("선택한 부서에 속하지 않는 양식입니다.", 403);
  return toTemplate(data as DbRow);
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "날짜");

const codeSchema = z.string().trim().min(1).max(40);
const nameSchema = z.string().trim().min(1).max(80);
const memoSchema = z.string().max(500);

export const createTemplateSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  revisionDate: dateSchema,
  layoutKey: layoutKeySchema,
  settings: documentSettingsSchema,
  isActive: z.boolean().optional(),
  memo: memoSchema.optional(),
  inheritFromTemplateId: z.string().optional()
});

export const updateTemplateSchema = z.object({
  code: codeSchema.optional(),
  name: nameSchema.optional(),
  revisionDate: dateSchema.optional(),
  layoutKey: layoutKeySchema.optional(),
  settings: documentSettingsSchema.optional(),
  isActive: z.boolean().optional(),
  memo: memoSchema.optional()
});

export function validationMessage(error: z.ZodError) {
  const issue = error.issues[0];
  return `입력값이 올바르지 않습니다. (${issue?.path.join(".") || "body"}: ${issue?.message ?? "형식 오류"})`;
}

// editor/file은 DB CHECK에는 있으나 이번 단계에서 받지 않는다.
export function assertLayoutType(templateType: unknown) {
  if (templateType === undefined || templateType === "layout") return;
  if (templateType === "editor" || templateType === "file") throw new RouteError("편집형·파일형 양식은 준비 중입니다.", 400);
  throw new RouteError("templateType이 올바르지 않습니다.", 400);
}

// 레이아웃에 속하지 않는 옵션 키는 저장하지 않는다.
export function normalizeSettings(layoutKey: LayoutKey, settings: object) {
  const { showInspectionMethod, showLotCheckbox, ...base } = settings as {
    showInspectionMethod?: boolean;
    showLotCheckbox?: boolean;
  };
  const normalized: Record<string, unknown> = { ...base };
  if (layoutKey === "bom-detail" && showInspectionMethod !== undefined) normalized.showInspectionMethod = showInspectionMethod;
  if (layoutKey === "lot-split" && showLotCheckbox !== undefined) normalized.showLotCheckbox = showLotCheckbox;
  return normalized as unknown as DocumentLayoutSettings;
}

export const UNIQUE_TEMPLATE_MESSAGE = "같은 문서코드·개정일자의 양식이 이미 있습니다.";
