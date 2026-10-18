import type {
  DocumentLayoutSettings,
  DocumentTemplate,
  LayoutKey,
  LayoutMetaDto,
  RenderableTemplate,
  WorkOrderIssue
} from "@/lib/types/document-template";

const baseSettings = {
  headerTitle: "작업지시서",
  headerSubtitle: "",
  companyName: "용마로지스",
  footerNote: "",
  approvalLines: [{ label: "담당" }, { label: "검토" }, { label: "승인" }],
  code: { type: "qr", position: "header-right" },
  sections: { products: true, materials: true, memo: true, signature: false },
  blankRows: 0
} as const;

function cloneBase() {
  return {
    ...baseSettings,
    approvalLines: baseSettings.approvalLines.map((line) => ({ ...line })),
    code: { ...baseSettings.code },
    sections: { ...baseSettings.sections }
  };
}

export const LAYOUT_KEYS: LayoutKey[] = ["standard", "bom-detail", "lot-split"];

export const LAYOUT_META: LayoutMetaDto[] = [
  {
    key: "standard",
    label: "표준 작업지시서",
    description: "헤더, 작업정보, 제품/부자재 요약표, 결재란",
    defaultSettings: cloneBase()
  },
  {
    key: "bom-detail",
    label: "BOM 상세형",
    description: "제품·부자재 단위수량/필요수량/할당수량과 검수방식을 상세 표기",
    defaultSettings: { ...cloneBase(), showInspectionMethod: true }
  },
  {
    key: "lot-split",
    label: "LOT 분할형",
    description: "제품 코드별 LOT 행을 나누어 LOT별 할당수량과 체크칸 표기",
    defaultSettings: { ...cloneBase(), showLotCheckbox: true }
  }
];

export function isLayoutKey(value: unknown): value is LayoutKey {
  return typeof value === "string" && (LAYOUT_KEYS as string[]).includes(value);
}

export function getLayoutMeta(key: LayoutKey): LayoutMetaDto {
  const meta = LAYOUT_META.find((item) => item.key === key);
  if (!meta) throw new Error(`unknown layout key: ${key}`);
  return meta;
}

export function getDefaultSettings(key: LayoutKey): DocumentLayoutSettings {
  const defaults = getLayoutMeta(key).defaultSettings;
  return {
    ...defaults,
    approvalLines: defaults.approvalLines.map((line) => ({ ...line })),
    code: { ...defaults.code },
    sections: { ...defaults.sections }
  };
}

// 저장된 settings에 없는 필드는 기본값으로 채워 필드 추가 시 하위호환을 유지한다.
export function resolveSettings(
  key: LayoutKey,
  raw: Partial<DocumentLayoutSettings> | null | undefined
): DocumentLayoutSettings {
  const defaults = getDefaultSettings(key);
  const source = raw ?? {};
  return {
    ...defaults,
    ...source,
    approvalLines: Array.isArray(source.approvalLines) ? source.approvalLines : defaults.approvalLines,
    code: { ...defaults.code, ...(source.code ?? {}) },
    sections: { ...defaults.sections, ...(source.sections ?? {}) }
  } as DocumentLayoutSettings;
}

export function resolveRenderableSettings(template: RenderableTemplate): DocumentLayoutSettings | null {
  if (template.templateType !== "layout" || !template.layoutKey) return null;
  return resolveSettings(template.layoutKey, template.settings);
}

export function toRenderableTemplate(
  source: Pick<DocumentTemplate, "template_type" | "layout_key" | "settings">
): RenderableTemplate {
  return { templateType: source.template_type, layoutKey: source.layout_key, settings: source.settings };
}

// 출력 이력은 당시 settings 스냅샷으로 재현한다.
export function issueToRenderableTemplate(
  issue: Pick<WorkOrderIssue, "template_type" | "layout_key" | "settings_snapshot">
): RenderableTemplate {
  return { templateType: issue.template_type, layoutKey: issue.layout_key, settings: issue.settings_snapshot };
}
