import type { ReactNode } from "react";

// 사이드바·필터바가 없는 인쇄 전용 레이아웃(워크스페이스 AppShell 밖)
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-stone-200 print:bg-white">{children}</div>;
}
