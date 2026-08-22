# 부서마스터 (`app/(workspace)/department-master`)

## 개요
부서 목록을 조회하고, 부서별 소속 화주 수·사용자 수를 함께 보여주는 읽기 중심 화면이다. 별도 부서 필터 없이 전체 부서를 한 번에 조회한다. "부서 추가" 버튼은 UI에만 존재하며 클릭 핸들러는 연결되어 있지 않다.

## 화면 구조
- `app/(workspace)/department-master/page.tsx` (`DepartmentMasterPage`)
- 사용 컴포넌트: `PageHeader`(`components/common/PageHeader.tsx`), `CloudButton`(`components/common/CloudButton.tsx`), `CuteCard`(`components/common/CuteCard.tsx`), `DataTable`(`components/common/DataTable.tsx`)
- 상단에 로딩 상태 문구와 `dataSource`(Supabase/Mock/연결 오류) 배지를 보여주는 안내 바가 있다. 연결 오류 시 "다시 시도" 버튼으로 `loadDepartments`를 재호출한다(직전 목록은 유지).
- 테이블 컬럼: 정렬, 부서명, 화주 수, 사용자 수, 사용여부. 화주 수/사용자 수는 `shipperCounts`/`userCounts` 맵에서 부서 id로 조회.
- 등록/수정/삭제 모달은 없다(조회 전용).

## 데이터 흐름
1. `useEffect`에서 `GET /api/department-master` 1회 호출 (필터 파라미터 없음).
2. API(`app/api/department-master/route.ts`):
   - `NEXT_PUBLIC_USE_MOCK_DATA !== "false"`이거나 Supabase 클라이언트가 없으면 `mockData()` 반환 (`appRepository.listDepartments()`, `listShippers`, `listUsers` 기반 카운트 계산).
   - Supabase 분기: `.from("departments").select("*").order("sort_order")` → `.from("shippers").select("department_id").in("department_id", ...)` → `.from("user_department_permissions").select("department_id").in(...)` 로 각각 화주 수/사용자 수 집계.
   - 실DB 모드에서 조회 중 오류가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작).
3. 확인된 Supabase 테이블: `departments`, `shippers`, `user_department_permissions`.

## 상태·필터
- zustand `useFilterStore`를 사용하지 않는다(부서/화주 스코프 필터 미적용). 전체 부서를 한 번에 조회하는 전역 마스터 화면이다.
- 로컬 `useState`로 `departments`, `shipperCounts`, `userCounts`, `isLoading`, `dataSource`, `loadError`만 관리.

## 주요 타입
- `Department`(`lib/types/domain.ts`): `id`, `name`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- API 응답 타입은 인라인으로 `{ source, warning?, departments, shipperCounts, userCounts }` 형태로 선언(별도 dto 파일 없음).

## 주의사항
- "부서 추가" `CloudButton`은 `onClick`이 없어 클릭해도 아무 동작이 없다(TODO성 미완성 기능).
- 부서 수정/삭제 API가 없다. POST/PATCH/DELETE 핸들러는 `route.ts`에 구현되어 있지 않고 GET만 존재한다.
- Supabase 분기에서 `user_department_permissions` 조회가 실패하면 `userCounts`는 조용히 `{}`로 처리되고 전체 응답은 실패하지 않는다(에러를 던지지 않음).
