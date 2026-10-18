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
    return <EmptyCloudState title="양식이 소속될 부서를 먼저 골라주세요." description="문서양식은 반드시 부서에 소속되어야 해요." />;
  }

  return (
    <>
      <PageHeader title="문서마스터" description="작업지시서 양식을 등록하고 화주별로 사용할 양식을 지정합니다." />

      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-full bg-white/70 p-1 ring-1 ring-white/80">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-5 py-2 text-sm font-extrabold transition ${
              activeTab === tab.key ? "bg-sky-500 text-white shadow-md shadow-sky-100" : "text-slate-500 hover:bg-white hover:text-sky-600"
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
