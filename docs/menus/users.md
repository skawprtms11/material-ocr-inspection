# 사용자관리 (`app/(workspace)/users`)

## 개요
전체 사용자 목록과 역할, 부서/화주 접근 권한, 사용여부를 조회하는 읽기 전용 화면이다. 여기서 관리되는 부서/화주 권한이 `TopFilterBar`(`components/layout/TopFilterBar.tsx`)의 필터 드롭다운 제한 기준으로 재사용된다.

## 화면 구조
- `app/(workspace)/users/page.tsx` (`UsersPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `DataTable`
- 테이블 컬럼: 이름, 이메일, 역할(`roleLabels[user.role]`, `lib/constants/status.ts`), 부서 권한(소속 부서명 join), 화주 권한(소속 화주명 join), 사용여부.
- "사용자 추가" 버튼은 `onClick` 없이 존재만 한다(미완성).
- 등록/수정/삭제 모달 없음(조회 전용).

## 데이터 흐름
- 조회: `GET /api/users` (필터 파라미터 없이 전체 조회)
  - `app/api/users/route.ts`: mock이면 `appRepository.listUsers()` + `appRepository.listDepartments()` + `appRepository.listAllowedShippers()`.
  - 실DB 모드에서 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다. 화면은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전 목록 유지).
  - Supabase 분기: `.from("app_users").select("*").order("name")`, `.from("departments").select("*").order("sort_order")`, `.from("shippers").select("*").order("name")`, `.from("user_department_permissions").select("user_id, department_id")`, `.from("user_shipper_permissions").select("user_id, shipper_id")`를 병렬 조회 후 사용자별 권한 배열을 조립.
- 확인된 Supabase 테이블: `app_users`, `departments`, `shippers`, `user_department_permissions`, `user_shipper_permissions`.
- 동일한 `/api/users` 엔드포인트를 `TopFilterBar`도 재사용하여 로그인 사용자(현재는 `admin@example.com` 또는 role이 admin인 사용자를 임시로 "현재 사용자"로 사용)의 부서/화주 권한에 맞춰 필터 옵션을 제한한다.

## 상태·필터
- zustand `useFilterStore`를 사용하지 않는다(전역 사용자 목록이므로 부서/화주 스코프 미적용).
- 로컬 `useState`: `users`, `departments`, `shippers`, `isLoading`, `dataSource`, `loadError`.

## 주요 타입
- `AppUser`(`lib/types/domain.ts`): `id`, `name`, `email`, `role: "admin"|"manager"|"worker"|"viewer"`, `is_active`, `department_ids: string[]`, `shipper_ids: string[]`, `created_at`, `updated_at`.
- `Department`, `Shipper`(같은 파일) — 표시용 참조 데이터.
- `roleLabels`(`lib/constants/status.ts`) — 역할 코드 → 한글 라벨 매핑.

## 주의사항
- "사용자 추가" 버튼은 클릭 핸들러가 없어 동작하지 않는다.
- 사용자 등록/수정/삭제/권한변경 API가 없다(`route.ts`에는 GET만 존재). 권한(`user_department_permissions`, `user_shipper_permissions`)을 바꾸는 UI/엔드포인트는 이 메뉴에 없다.
- `TopFilterBar`가 "현재 로그인 사용자"를 `email === "admin@example.com"` 우선, 없으면 `role === "admin"`, 그마저 없으면 첫 사용자로 폴백해서 결정한다 — 실제 인증 세션 기반이 아니라 목록에서 추정하는 방식이므로, 이 사용자관리 화면에서 표시되는 데이터와 실제 로그인 계정이 다를 수 있다.
