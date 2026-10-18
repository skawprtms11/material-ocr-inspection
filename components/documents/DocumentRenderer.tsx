import "@/components/documents/print.css";
import type { CSSProperties, ReactNode } from "react";
import { layoutRegistry } from "@/components/documents/layout-registry";
import { resolveRenderableSettings } from "@/lib/documents/layout-meta";
import type {
  DocumentRenderMode,
  RenderableTemplate,
  WorkOrderPrintDto
} from "@/lib/types/document-template";

type DocumentRendererProps = {
  template: RenderableTemplate;
  data: WorkOrderPrintDto;
  mode?: DocumentRenderMode;
};

function Unsupported({ message }: { message: string }) {
  return <div className="doc-unsupported">{message}</div>;
}

// mode=print일 때만 @page를 주입해 다른 화면의 인쇄 설정에 영향이 가지 않게 한다.
export function DocumentRenderer({ template, data, mode = "preview" }: DocumentRendererProps) {
  let body: ReactNode;

  if (template.templateType === "layout") {
    const settings = resolveRenderableSettings(template);
    const Layout = template.layoutKey ? layoutRegistry[template.layoutKey] : undefined;
    body =
      settings && Layout ? (
        <Layout data={data} settings={settings} mode={mode} />
      ) : (
        <Unsupported message={`알 수 없는 레이아웃입니다: ${template.layoutKey ?? "-"}`} />
      );
  } else if (template.templateType === "editor") {
    body = <Unsupported message="편집형 양식은 아직 지원하지 않습니다." />;
  } else {
    body = <Unsupported message="파일형 양식은 아직 지원하지 않습니다." />;
  }

  return (
    <div className="doc-root" data-doc-mode={mode}>
      {mode === "print" ? <style>{"@page { size: A4 portrait; margin: 10mm; }"}</style> : null}
      {body}
    </div>
  );
}

type DocumentPreviewFrameProps = {
  scale: number;
  children: ReactNode;
};

// A4(210x297mm)를 scale 배율로 축소해 모달·카드 안에 맞춘다. 레이아웃 높이가 넘치면 잘린다.
export function DocumentPreviewFrame({ scale, children }: DocumentPreviewFrameProps) {
  const frameStyle: CSSProperties = {
    width: `calc(210mm * ${scale})`,
    height: `calc(297mm * ${scale})`
  };
  return (
    <div className="doc-root">
      <div className="doc-preview-frame" style={frameStyle}>
        <div className="doc-preview-inner" style={{ transform: `scale(${scale})`, width: "210mm" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
