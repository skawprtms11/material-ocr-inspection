"use client";

import type { DocumentTemplate } from "@/lib/types/document-template";
import { PendingTemplatePanel } from "./PendingTemplatePanel";

// 양식제작(template_type 'editor'): 편집기로 직접 문서를 설계하는 분류. 화면은 추후 정의.
export function EditorTemplatePanel({ templates, onClose }: { templates: DocumentTemplate[]; onClose: () => void }) {
  return (
    <PendingTemplatePanel
      templateType="editor"
      description="편집기에서 작업지시서를 직접 설계하는 방식입니다. 정의가 확정되면 이 영역에 편집 화면이 연결됩니다."
      templates={templates}
      onClose={onClose}
    />
  );
}
