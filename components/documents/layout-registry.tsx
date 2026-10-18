import type { ComponentType } from "react";
import {
  BomDetailLayout,
  LotSplitLayout,
  StandardLayout,
  type LayoutProps
} from "@/components/documents/layouts";
import type { LayoutKey } from "@/lib/types/document-template";

type LayoutComponent = ComponentType<LayoutProps>;

// 새 레이아웃은 lib/documents/layout-meta.ts(LAYOUT_META)와 여기 두 곳에만 추가한다.
export const layoutRegistry: Record<LayoutKey, LayoutComponent> = {
  standard: StandardLayout as LayoutComponent,
  "bom-detail": BomDetailLayout as LayoutComponent,
  "lot-split": LotSplitLayout as LayoutComponent
};
