"use client";

import type { DocumentTemplate } from "@/lib/types/document-template";
import { PendingTemplatePanel } from "./PendingTemplatePanel";

// 화주양식(template_type 'file'): 화주가 제공한 파일 양식을 등록하는 분류. 화면은 추후 정의.
export function ShipperFileTemplatePanel({ templates, onClose }: { templates: DocumentTemplate[]; onClose: () => void }) {
  return (
    <PendingTemplatePanel
      templateType="file"
      description="화주가 제공한 파일 양식을 등록하는 방식입니다. 정의가 확정되면 이 영역에 파일 등록 화면이 연결됩니다."
      templates={templates}
      onClose={onClose}
    />
  );
}
