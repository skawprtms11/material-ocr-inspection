// 모바일 전용 부서/화주 스코프 영속화. 웹과 공유되는 filter-store 자체에는 persist를 붙이지 않는다.
const storageKey = "harness.mobile-scope.v1";

export type MobileScope = {
  departmentId: string;
  shipperId: string;
};

function isValidScope(value: unknown): value is MobileScope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.departmentId === "string" && candidate.departmentId.length > 0 && typeof candidate.shipperId === "string" && candidate.shipperId.length > 0;
}

export function loadMobileScope(): MobileScope | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidScope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMobileScope(scope: MobileScope) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(scope));
  } catch {
    // 프라이빗 모드 등에서 저장에 실패해도 화면 동작은 계속되어야 한다.
  }
}
