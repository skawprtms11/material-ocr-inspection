# 사용자관리 (`app/(workspace)/users`)

## 개요
전체 사용자 목록과 역할, 부서/화주 접근 권한, 사용여부를 조회하고, 사용자별 부서·화주 권한을 편집하는 화면이다. 여기서 관리되는 부서/화주 권한이 `TopFilterBar`(`components/layout/TopFilterBar.tsx`)의 필터 드롭다운 제한 기준으로 재사용된다.

## 화면 구조
- `app/(workspace)/users/page.tsx` (`UsersPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `DataTable`
- 테이블 컬럼: 이름, 이메일, 역할(`roleLabels[user.role]`, `lib/constants/status.ts`), 부서 권한(소속 부서명 join), 화주 권한(소속 화주명 join), 사용여부.
- "사용자 추가" 버튼은 `onClick` 없이 존재만 한다(미완성).
- "권한 편집" 컬럼의 "편집" 버튼 → `PermissionModal`(같은 파일 내부): 부서별 카드에 부서 체크와 소속 화주 체크를 표시한다. 부서를 체크해야 그 부서 화주를 고를 수 있고, 부서 체크를 해제하면 소속 화주 권한도 함께 해제된다. 저장 후 목록 재조회(상단 필터는 페이지 새로고침 후 반영).
- 사용자 등록/수정/삭제 모달은 없다("사용자 추가"는 여전히 미구현).

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

## 권한 저장 API
- `PATCH /api/users` body `{ userId, departmentIds: string[], shipperIds: string[] }` → `{ source, userId, departmentIds, shipperIds }`.
- 검증: userId·각 id UUID 형식(400), 사용자 존재(404), 부서·화주 존재(400), 화주는 선택된 부서 소속만 허용(400).
- 반영 방식: 기존 권한과 비교해 추가분 insert → 제거분 delete(전체 삭제 후 재삽입하지 않음 — 중간 실패 시 권한 전체 유실 방지, 유지되는 행은 그대로).
- mock 모드는 `lib/mock/data.ts`의 `users` 항목을 메모리에서 갱신.
- 부서마스터·화주마스터에서 새로 추가한 부서·화주는 여기서 권한을 부여해야 상단 필터(`TopFilterBar`)에 나타난다.
- 인증이 없어 누구나 호출할 수 있다(전체 앱 공통 과제).

