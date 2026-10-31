"use client";

import { useState } from "react";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import { ShipperMappingTab } from "./ShipperMappingTab";
import { TemplateTab } from "./TemplateTab";

const TABS = [
  { key: "template", label: "문서양식등록" },
  { key: "mapping", label: "화주별양식등록" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DocumentMasterPage() {
  const { departmentId } = useFilterStore();
  const [activeTab, setActiveTab] = useState<TabKey>("template");

  if (!departmentId) {
    return <EmptyCloudState title="부서를 먼저 선택하세요." description="문서양식은 부서 단위로 관리됩니다." />;
  }

  return (
    <>
      <PageHeader title="문서마스터" description="작업지시서 양식을 등록하고 화주별로 사용할 양식을 지정합니다." />

      <div role="tablist" className="mb-4 inline-flex h-9 items-center rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`h-7 rounded-md px-3 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "template" ? <TemplateTab departmentId={departmentId} /> : <ShipperMappingTab departmentId={departmentId} />}
    </>
  );
}
