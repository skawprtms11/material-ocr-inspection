"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { PhotoReviewCard } from "@/components/mobile/PhotoReviewCard";
import { useMobileScope } from "@/lib/mobile/mobile-api";
import { cn } from "@/lib/utils/cn";
import type { InspectionWithVerificationDto, PhotoReviewItemDto } from "@/lib/types/work-inspection-api";

type ProductRow = {
  id: string;
  productCode: string;
  productName: string;
  lot?: string;
  unitQuantity?: number;
  usedQuantity?: number;
};

type WorkDetailResponse = {
  products?: ProductRow[];
  error?: string;
};

function quantityText(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "-";
}

// 제품내역(작업전검수·완료검수 화면 상단 공통): 제품코드/제품명/LOT/단위수량/사용수량을 보여준다.
// 제품 사진검수 항목(photoInspections, 제품 구성 행당 PHOTO 1행)이 있으면 제품 사진 제출이 곧 제품 확인이므로
// 로컬 체크박스는 없애고 제품별 사진 카드(PhotoReviewCard)를 아래에 붙인다. 항목이 없는 과거 작업만 기존
// 확인용 체크리스트(서버 저장 없음)로 동작한다.
export function ProductChecklist({
  workId,
  stageLabel = "",
  photoInspections = [],
  photoItems,
  locked = false,
  onSubmitted
}: {
  workId: string;
  stageLabel?: string;
  photoInspections?: InspectionWithVerificationDto[];
  photoItems?: Map<string, PhotoReviewItemDto>;
  locked?: boolean;
  onSubmitted?: () => Promise<unknown> | void;
}) {
  const hasPhotoCards = photoInspections.length > 0;
  const scope = useMobileScope();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setChecked({});

    fetch(`/api/work-status/detail?${new URLSearchParams({ work_id: workId, department_id: scope.departmentId, shipper_id: scope.shipperId }).toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: WorkDetailResponse) => {
        if (cancelled) return;
        if (payload.error) throw new Error(payload.error);
        setProducts(payload.products ?? []);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "제품내역을 불러오지 못했습니다.");
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workId, scope.departmentId, scope.shipperId]);

  const photoCards = hasPhotoCards && (
    <>
      {photoInspections.map((inspection, index) => (
        <PhotoReviewCard
          key={inspection.id}
          workId={workId}
          inspection={inspection}
          item={photoItems?.get(inspection.id)}
          eyebrow={`${stageLabel ? `${stageLabel} · ` : ""}제품 사진검수`}
          title={`제품 ${index + 1} · ${inspection.product_name || inspection.product_code || "-"}`}
          codeText={inspection.product_code}
          lotText={inspection.product_lot}
          locked={locked}
          onSubmitted={onSubmitted ?? (() => undefined)}
        />
      ))}
    </>
  );

  if (loading) {
    return (
      <>
        <CuteCard className="p-4 text-center text-xs text-muted-foreground">제품내역을 불러오는 중입니다.</CuteCard>
        {photoCards}
      </>
    );
  }

  if (error) {
    return (
      <>
        <CuteCard className="p-4 text-center text-xs font-medium text-red-700">{error}</CuteCard>
        {photoCards}
      </>
    );
  }

  if (products.length === 0) return photoCards || null;

  const checkedCount = products.filter((product) => checked[product.id]).length;

  return (
    <>
    <CuteCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageSearch className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">제품내역</h3>
        </div>
        {!hasPhotoCards && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            검수 {checkedCount}/{products.length}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {products.map((product) => {
          const isChecked = Boolean(checked[product.id]);

          return (
            <label
              key={product.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm font-medium ring-1 transition-colors",
                hasPhotoCards ? "bg-card text-foreground ring-border" : isChecked ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-card text-foreground ring-border"
              )}
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-muted-foreground">{product.productCode}</span>
                <span className="block truncate">{product.productName}</span>
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  LOT {product.lot || "-"} · 단위수량 {quantityText(product.unitQuantity)} · 사용수량{" "}
                  {quantityText(product.usedQuantity)}
                </span>
              </span>
              {!hasPhotoCards && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => setChecked((current) => ({ ...current, [product.id]: event.target.checked }))}
                  className="size-6 shrink-0 accent-emerald-600"
                  aria-label={`${product.productName} 검수여부`}
                />
              )}
            </label>
          );
        })}
      </div>
    </CuteCard>
    {photoCards}
    </>
  );
}
