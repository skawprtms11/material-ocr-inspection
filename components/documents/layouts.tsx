import {
  BlankRows,
  DocFooter,
  DocHeader,
  EmptyRows,
  InfoGrid,
  MemoSection,
  Section,
  SignatureSection,
  blankRowsFor,
  formatQty
} from "@/components/documents/parts";
import type {
  BomDetailLayoutSettings,
  DocumentRenderMode,
  LayoutKey,
  LayoutSettingsMap,
  LotSplitLayoutSettings,
  StandardLayoutSettings,
  WorkOrderPrintDto
} from "@/lib/types/document-template";

export type LayoutProps<K extends LayoutKey = LayoutKey> = {
  data: WorkOrderPrintDto;
  settings: LayoutSettingsMap[K];
  mode: DocumentRenderMode;
};

function lotsText(lots: WorkOrderPrintDto["products"][number]["lots"]): string {
  const values = lots.map((lot) => lot.lot).filter(Boolean);
  return values.length > 0 ? values.join(", ") : "-";
}

function lotsAllocated(lots: WorkOrderPrintDto["products"][number]["lots"]): number {
  return lots.reduce((sum, lot) => sum + lot.allocatedQuantity, 0);
}

function Shell({
  data,
  settings,
  children
}: {
  data: WorkOrderPrintDto;
  settings: StandardLayoutSettings;
  children: React.ReactNode;
}) {
  return (
    <article className="doc-page">
      <DocHeader data={data} settings={settings} />
      <InfoGrid data={data} />
      {children}
      <MemoSection data={data} settings={settings} />
      <SignatureSection settings={settings} />
      <DocFooter data={data} settings={settings} />
    </article>
  );
}

export function StandardLayout({ data, settings }: LayoutProps<"standard">) {
  return (
    <Shell data={data} settings={settings}>
      {settings.sections.products ? (
        <Section title="제품 내역">
          {data.products.length === 0 ? (
            <EmptyRows message="제품 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>제품코드</th>
                  <th>제품명</th>
                  <th>필요수량</th>
                  <th>LOT</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.code}>
                    <td>{product.code}</td>
                    <td>{product.name}</td>
                    <td className="num">{formatQty(product.requiredQuantity)}</td>
                    <td>{lotsText(product.lots)}</td>
                  </tr>
                ))}
                <BlankRows count={blankRowsFor("products", settings)} columns={4} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
      {settings.sections.materials ? (
        <Section title="부자재 내역">
          {data.materials.length === 0 ? (
            <EmptyRows message="부자재 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>부자재코드</th>
                  <th>부자재명</th>
                  <th>필요수량</th>
                  <th>LOT</th>
                  <th>할당수량</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.map((material, index) => (
                  <tr key={`${material.code}-${index}`}>
                    <td>{material.code}</td>
                    <td>{material.name}</td>
                    <td className="num">{formatQty(material.requiredQuantity)}</td>
                    <td>{material.lot || "-"}</td>
                    <td className="num">{formatQty(material.allocatedQuantity)}</td>
                    <td>{material.memo}</td>
                  </tr>
                ))}
                <BlankRows count={blankRowsFor("materials", settings)} columns={6} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
    </Shell>
  );
}

export function BomDetailLayout({ data, settings }: LayoutProps<"bom-detail">) {
  const showMethod = settings.showInspectionMethod;
  return (
    <Shell data={data} settings={settings as BomDetailLayoutSettings}>
      {settings.sections.products ? (
        <Section title="제품 BOM">
          {data.products.length === 0 ? (
            <EmptyRows message="제품 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>제품코드</th>
                  <th>제품명</th>
                  <th>단위수량</th>
                  <th>필요수량</th>
                  <th>할당수량</th>
                  <th>LOT</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((product) => (
                  <tr key={product.code}>
                    <td>{product.code}</td>
                    <td>{product.name}</td>
                    <td className="num">{formatQty(product.unitQuantity)}</td>
                    <td className="num">{formatQty(product.requiredQuantity)}</td>
                    <td className="num">{formatQty(lotsAllocated(product.lots))}</td>
                    <td>{lotsText(product.lots)}</td>
                  </tr>
                ))}
                <BlankRows count={blankRowsFor("products", settings)} columns={6} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
      {settings.sections.materials ? (
        <Section title="부자재 BOM">
          {data.materials.length === 0 ? (
            <EmptyRows message="부자재 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>부자재코드</th>
                  <th>부자재명</th>
                  <th>단위수량</th>
                  <th>필요수량</th>
                  <th>할당수량</th>
                  <th>LOT</th>
                  {showMethod ? <th>검수방식</th> : null}
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.map((material, index) => (
                  <tr key={`${material.code}-${index}`}>
                    <td>{material.code}</td>
                    <td>{material.name}</td>
                    <td className="num">{formatQty(material.unitQuantity)}</td>
                    <td className="num">{formatQty(material.requiredQuantity)}</td>
                    <td className="num">{formatQty(material.allocatedQuantity)}</td>
                    <td>{material.lot || "-"}</td>
                    {showMethod ? <td className="center">{material.inspectionMethodLabel || "-"}</td> : null}
                    <td>{material.memo}</td>
                  </tr>
                ))}
                <BlankRows count={blankRowsFor("materials", settings)} columns={showMethod ? 8 : 7} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
    </Shell>
  );
}

export function LotSplitLayout({ data, settings }: LayoutProps<"lot-split">) {
  const showCheck = (settings as LotSplitLayoutSettings).showLotCheckbox;
  return (
    <Shell data={data} settings={settings}>
      {settings.sections.products ? (
        <Section title="제품 LOT 내역">
          {data.products.length === 0 ? (
            <EmptyRows message="제품 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>제품코드</th>
                  <th>제품명</th>
                  <th>필요수량</th>
                  <th>LOT</th>
                  <th>할당수량</th>
                  {showCheck ? <th>확인</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.products.flatMap((product) => {
                  const lots = product.lots.length > 0 ? product.lots : [{ lot: "", allocatedQuantity: 0, memo: "" }];
                  return lots.map((lot, index) => (
                    <tr key={`${product.code}-${index}`}>
                      {index === 0 ? (
                        <>
                          <td rowSpan={lots.length}>{product.code}</td>
                          <td rowSpan={lots.length}>{product.name}</td>
                          <td rowSpan={lots.length} className="num">
                            {formatQty(product.requiredQuantity)}
                          </td>
                        </>
                      ) : null}
                      <td>{lot.lot || "-"}</td>
                      <td className="num">{formatQty(lot.allocatedQuantity)}</td>
                      {showCheck ? (
                        <td className="center">
                          <span className="doc-checkbox" />
                        </td>
                      ) : null}
                    </tr>
                  ));
                })}
                <BlankRows count={blankRowsFor("products", settings)} columns={showCheck ? 6 : 5} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
      {settings.sections.materials ? (
        <Section title="부자재 LOT 내역">
          {data.materials.length === 0 ? (
            <EmptyRows message="부자재 내역이 없습니다." />
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>부자재코드</th>
                  <th>부자재명</th>
                  <th>필요수량</th>
                  <th>LOT</th>
                  <th>할당수량</th>
                  {showCheck ? <th>확인</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.materials.map((material, index) => (
                  <tr key={`${material.code}-${index}`}>
                    <td>{material.code}</td>
                    <td>{material.name}</td>
                    <td className="num">{formatQty(material.requiredQuantity)}</td>
                    <td>{material.lot || "-"}</td>
                    <td className="num">{formatQty(material.allocatedQuantity)}</td>
                    {showCheck ? (
                      <td className="center">
                        <span className="doc-checkbox" />
                      </td>
                    ) : null}
                  </tr>
                ))}
                <BlankRows count={blankRowsFor("materials", settings)} columns={showCheck ? 6 : 5} />
              </tbody>
            </table>
          )}
        </Section>
      ) : null}
    </Shell>
  );
}
