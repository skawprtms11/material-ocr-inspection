# 부서마스터 (`app/(workspace)/department-master`)

## 개요
부서 목록을 조회하고, 부서별 소속 화주 수·사용자 수를 함께 보여주는 화면이다. 별도 부서 필터 없이 전체 부서를 한 번에 조회한다. "부서 추가" 버튼으로 부서를 등록할 수 있다(수정·삭제는 없음).

## 화면 구조
- `app/(workspace)/department-master/page.tsx` (`DepartmentMasterPage`)
- 사용 컴포넌트: `PageHeader`(`components/common/PageHeader.tsx`), `CloudButton`(`components/common/CloudButton.tsx`), `CuteCard`(`components/common/CuteCard.tsx`), `DataTable`(`components/common/DataTable.tsx`)
- 상단에 로딩 상태 문구와 `dataSource`(Supabase/Mock/연결 오류) 배지를 보여주는 안내 바가 있다. 연결 오류 시 "다시 시도" 버튼으로 `loadDepartments`를 재호출한다(직전 목록은 유지).
- 테이블 컬럼: 정렬, 부서명, 화주 수, 사용자 수, 사용여부. 화주 수/사용자 수는 `shipperCounts`/`userCounts` 맵에서 부서 id로 조회.
- "부서 추가" 버튼 → `AddDepartmentModal`(같은 파일 내부): 부서명(필수, 50자 이하), 정렬순서(비우면 서버가 현재 최대값 + 1, 최대 9999), 사용여부 입력. 저장 성공 시 토스트 후 목록 재조회.
- 수정/삭제 모달은 없다.

## 데이터 흐름
1. `useEffect`에서 `GET /api/department-master` 1회 호출 (필터 파라미터 없음).
2. API(`app/api/department-master/route.ts`):
   - `NEXT_PUBLIC_USE_MOCK_DATA !== "false"`이거나 Supabase 클라이언트가 없으면 `mockData()` 반환 (`appRepository.listDepartments()`, `listShippers`, `listUsers` 기반 카운트 계산).
   - Supabase 분기: `.from("departments").select("*").order("sort_order")` → `.from("shippers").select("department_id").in("department_id", ...)` → `.from("user_department_permissions").select("department_id").in(...)` 로 각각 화주 수/사용자 수 집계.
   - 실DB 모드에서 조회 중 오류가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작).
3. 추가: `POST /api/department-master` body `{ name, sortOrder?, isActive? }` → 201 `{ source, department }`.
   - 검증: 부서명 공백 제거 후 필수·50자 이하(400), 정렬순서 0~9999 정수(400), 같은 이름(대소문자 무시) 존재 시 409.
   - mock 모드는 `lib/mock/data.ts`의 `departments` 배열에 추가(서버 메모리, 재시작 시 초기화).
4. 확인된 Supabase 테이블: `departments`, `shippers`, `user_department_permissions`.

## 상태·필터
- zustand `useFilterStore`를 사용하지 않는다(부서/화주 스코프 필터 미적용). 전체 부서를 한 번에 조회하는 전역 마스터 화면이다.
- 로컬 `useState`로 `departments`, `shipperCounts`, `userCounts`, `isLoading`, `dataSource`, `loadError`만 관리.

## 주요 타입
- `Department`(`lib/types/domain.ts`): `id`, `name`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- API 응답 타입은 인라인으로 `{ source, warning?, departments, shipperCounts, userCounts }` 형태로 선언(별도 dto 파일 없음).

## 주의사항
- 부서 수정/삭제 API는 없다(GET/POST만 존재).
- 새 부서는 사용자 부서 권한(`user_department_permissions`)이 없으면 우측 상단 필터 목록에 나타나지 않는다(TopFilterBar는 현재 사용자 권한 기준으로 제한). 사용자관리(`docs/menus/users.md`)의 권한 편집에서 부여한다.
- 인증이 없어 누구나 POST를 호출할 수 있다(전체 앱 공통 과제).
- Supabase 분기에서 `user_department_permissions` 조회가 실패하면 `userCounts`는 조용히 `{}`로 처리되고 전체 응답은 실패하지 않는다(에러를 던지지 않음).
