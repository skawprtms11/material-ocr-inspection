"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { cn } from "@/lib/utils/cn";

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

// 제품내역(작업전검수·완료검수 화면 상단 공통): 제품코드/제품명/LOT/단위수량/사용수량을 보여주고 작업자가
// 검수여부 체크박스로 확인한다. 서버 저장 없이 화면 진행 중에만 유지되는 확인용 체크리스트이며, 실제
// 합격/완료 판정은 work_inspections 기반 부자재 검수 결과로만 이뤄진다.
export function ProductChecklist({ workId }: { workId: string }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setChecked({});

    fetch(`/api/work-status/detail?work_id=${workId}`, { cache: "no-store" })
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
  }, [workId]);

  if (loading) {
    return <CuteCard className="p-4 text-center text-xs font-bold text-slate-400">제품내역을 불러오는 중이에요.</CuteCard>;
  }

  if (error) {
    return <CuteCard className="p-4 text-center text-xs font-bold text-rose-600">{error}</CuteCard>;
  }

  if (products.length === 0) return null;

  const checkedCount = products.filter((product) => checked[product.id]).length;

  return (
    <CuteCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageSearch className="size-4 text-sky-500" />
          <h3 className="text-sm font-black text-slate-800">제품내역</h3>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
          검수 {checkedCount}/{products.length}
        </span>
      </div>
      <div className="space-y-2">
        {products.map((product) => {
          const isChecked = Boolean(checked[product.id]);

          return (
            <label
              key={product.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold ring-1 transition",
                isChecked ? "bg-emerald-50 text-emerald-800 ring-emerald-100" : "bg-white text-slate-700 ring-sky-100"
              )}
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-black text-slate-400">{product.productCode}</span>
                <span className="block truncate">{product.productName}</span>
                <span className="mt-1 block text-[11px] font-bold text-slate-400">
                  LOT {product.lot || "-"} · 단위수량 {quantityText(product.unitQuantity)} · 사용수량{" "}
                  {quantityText(product.usedQuantity)}
                </span>
              </span>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(event) => setChecked((current) => ({ ...current, [product.id]: event.target.checked }))}
                className="size-5 shrink-0 accent-emerald-500"
                aria-label={`${product.productName} 검수여부`}
              />
            </label>
          );
        })}
      </div>
    </CuteCard>
  );
}
