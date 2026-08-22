// 작업현황 화면(웹/모바일)이 공유하는 연/월 조회 기준. 두 화면 모두 이 기준으로 "일치"를 판정해야 한다.
export function getCurrentYearMonth() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0")
  };
}

export function isYearMonthMatch(workDate: string, year: string, month: string) {
  const target = new Date(workDate);
  return String(target.getFullYear()) === year && String(target.getMonth() + 1).padStart(2, "0") === month;
}
