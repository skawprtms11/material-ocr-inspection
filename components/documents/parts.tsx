import type { ReactNode } from "react";
import { CodeMark } from "@/components/documents/CodeMark";
import type {
  BaseLayoutSettings,
  WorkOrderPrintDto
} from "@/lib/types/document-template";

export function formatQty(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("ko-KR") : "-";
}

function text(value: string | undefined | null): string {
  return value && value.trim() ? value : "-";
}

function showsCode(settings: BaseLayoutSettings, position: "header-right" | "footer") {
  return settings.code.type !== "none" && settings.code.position === position;
}

export function ApprovalBox({ lines }: { lines: BaseLayoutSettings["approvalLines"] }) {
  if (lines.length === 0) return null;
  return (
    <table className="doc-approval">
      <thead>
        <tr>
          {lines.map((line, index) => (
            <th key={`${line.label}-${index}`}>{line.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {lines.map((line, index) => (
            <td key={`${line.label}-${index}`} />
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export function DocHeader({ data, settings }: { data: WorkOrderPrintDto; settings: BaseLayoutSettings }) {
  return (
    <header className="doc-header">
      <div>
        <h1 className="doc-title">{settings.headerTitle || data.document.templateName}</h1>
        {settings.headerSubtitle ? <p className="doc-subtitle">{settings.headerSubtitle}</p> : null}
        {settings.companyName ? <p className="doc-company">{settings.companyName}</p> : null}
      </div>
      <div className="doc-header-right">
        {showsCode(settings, "header-right") ? <CodeMark value={data.codeValue} /> : null}
        <ApprovalBox lines={settings.approvalLines} />
      </div>
    </header>
  );
}

export function InfoGrid({ data }: { data: WorkOrderPrintDto }) {
  const { work, finished, shipper, department } = data;
  return (
    <table className="doc-info">
      <tbody>
        <tr>
          <th>문서번호</th>
          <td>{work.documentNo}</td>
          <th>작업유형</th>
          <td>{text(work.workType)}</td>
        </tr>
        <tr>
          <th>화주</th>
          <td>{shipper.name}</td>
          <th>부서</th>
          <td>{department.name}</td>
        </tr>
        <tr>
          <th>작업일자</th>
          <td>{text(work.workDate)}</td>
          <th>납기일</th>
          <td>{text(work.dueDate)}</td>
        </tr>
        <tr>
          <th>완성품</th>
          <td>
            {finished.name}
            {finished.code ? ` (${finished.code})` : ""}
          </td>
          <th>수량</th>
          <td>{formatQty(work.quantity)}</td>
        </tr>
        <tr>
          <th>완성품 LOT</th>
          <td colSpan={3}>{text(work.finishedProductLot)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="doc-section-title">{title}</h2>
      {children}
    </section>
  );
}

export function EmptyRows({ message }: { message: string }) {
  return <div className="doc-empty">{message}</div>;
}

export function BlankRows({ count, columns }: { count: number | undefined; columns: number }) {
  const rows = Math.max(0, Math.min(10, count ?? 0));
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={`blank-${row}`} className="blank">
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} />
          ))}
        </tr>
      ))}
    </>
  );
}

export function MemoSection({ data, settings }: { data: WorkOrderPrintDto; settings: BaseLayoutSettings }) {
  if (!settings.sections.memo) return null;
  return (
    <Section title="비고">
      <div className="doc-memo">{data.work.memo}</div>
    </Section>
  );
}

export function SignatureSection({ settings }: { settings: BaseLayoutSettings }) {
  if (!settings.sections.signature) return null;
  return (
    <div className="doc-signature">
      <div>작업자 서명</div>
      <div>확인자 서명</div>
    </div>
  );
}

export function DocFooter({ data, settings }: { data: WorkOrderPrintDto; settings: BaseLayoutSettings }) {
  const { document } = data;
  return (
    <footer className="doc-footer">
      <div className="doc-footer-note">{settings.footerNote}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "4mm" }}>
        <div className="doc-footer-meta">
          <div>
            {document.templateCode} / 개정 {document.revisionDate}
          </div>
          {document.issuedAt ? <div>출력 {document.issuedAt.slice(0, 16).replace("T", " ")}</div> : null}
        </div>
        {showsCode(settings, "footer") ? <CodeMark value={data.codeValue} /> : null}
      </div>
    </footer>
  );
}

// 표 하단 빈 행은 부자재표가 있으면 부자재표, 없으면 제품표에만 붙인다.
export function blankRowsFor(
  table: "products" | "materials",
  settings: BaseLayoutSettings
): number {
  const target = settings.sections.materials ? "materials" : "products";
  return table === target ? settings.blankRows ?? 0 : 0;
}
