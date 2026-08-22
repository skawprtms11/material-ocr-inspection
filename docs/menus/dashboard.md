# 대시보드 (`app/(workspace)/dashboard`)

## 개요
`/dashboard` 경로는 별도의 화면 없이 `/work-register`로 즉시 리다이렉트하는 진입점이다. 관리자 워크스페이스의 첫 메뉴 자리로 남아 있지만 실제 콘텐츠는 작업등록 화면이 대신한다.

## 화면 구조
`app/(workspace)/dashboard/page.tsx`는 서버 컴포넌트이며 전체 코드가 다음과 같다.

```tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/work-register");
}
```

- 렌더링되는 UI, 컴포넌트, 모달, 폼이 없다.
- `next/navigation`의 `redirect()`만 호출한다.
- 상위 레이아웃은 `app/(workspace)/layout.tsx` → `AppShell`(`@/components/layout/AppShell`)이며, 사이드바는 `components/layout/Sidebar.tsx`가 담당한다.
- `Sidebar.tsx`의 `menuItems` 배열에는 `/dashboard` 항목 자체가 없다. 즉, "대시보드"라는 이름의 사이드바 메뉴 링크는 존재하지 않는다.
- 다만 `Sidebar.tsx`는 `pathname === "/dashboard" && item.href === "/work-register"` 조건으로 `/dashboard`에 진입했을 때 "작업등록" 메뉴 항목을 활성(active) 상태로 표시하도록 방어 처리해 두었다.

## 데이터 흐름
- 호출하는 API 엔드포인트가 없다.
- 호출하는 repository 함수가 없다.
- 참조하는 Supabase 테이블이 없다.
- `redirect("/work-register")`가 실행되는 즉시 브라우저는 작업등록 페이지로 이동한다.
- 실제 데이터 로딩(`GET /api/work-register` 호출 등)은 이동한 `/work-register` 페이지(`docs/menus/work-register.md` 참고)에서 처리된다.

## 상태·필터
- zustand 스토어(`useFilterStore`)를 사용하지 않는다.
- `FilterScope`(부서/화주) 적용 로직이 이 페이지에는 없다.
- 작업 상태(`WorkStatus`) 전이도 이 페이지에서는 발생하지 않는다.
- 리다이렉트 이후 `/work-register`에서 `useFilterStore`가 사용되므로, 필터 상태는 이동한 페이지 기준으로 이어진다.

## 주요 타입
- 사용하는 타입이 없다.
- `lib/types/`의 타입을 import하지 않는다.

## 주의사항
- 이 파일은 리다이렉트 전용이며, 코드/문서 어디에도 대시보드 전용 위젯(요약 카드, 차트 등)이 구현되어 있지 않다.
- "대시보드"라는 메뉴명과 달리 실제 콘텐츠는 작업등록 화면이다.
- 사이드바(`components/layout/Sidebar.tsx`)의 `menuItems`에는 `/dashboard` 링크가 없어, 사용자가 사이드바를 통해 이 경로로 직접 진입할 방법이 없다(북마크/직접 URL 입력 등으로만 도달 가능).
- `redirect()`는 Next.js App Router의 서버 사이드 리다이렉트이므로 `/dashboard`로 진입 시 클라이언트에서 별도 로딩 상태 없이 바로 `/work-register`로 전환된다.
