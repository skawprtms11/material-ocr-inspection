# 작업현황 (`app/(workspace)/work-status`)

## 개요
등록된 전체 작업을 월 단위로 조회하고, 각 행의 상태 배지를 클릭해 작업 상태(대기/진행/보류/취소/완료)를 직접 변경할 수 있는 화면이다. 상단에는 완료율과 상태별 건수 요약 카드를, 상세필터 팝업에서는 작업구분/문서번호/완성품코드·명/LOT 조건 검색을 제공한다.

## 화면 구조
`app/(workspace)/work-status/page.tsx`(클라이언트 컴포넌트) 구성:
- `PageHeader` action 영역 — 년도/월 `select` + "상세필터" `CloudButton`(상세필터 적용 중이면 `tone="warning"`)
- 상세필터 적용 중 요약 배지 바(적용된 조건 chip 표시)
- 데이터 소스 배지 바(`supabase`/`mock`/연결 확인 중)
- `CuteCard` 요약 영역 — 완료율 게이지 + 전체/대기/진행/보류/취소/완료 카드 6종
- `CuteCard` 목록 테이블 — 작업상태(상태 변경 드롭다운 버튼)/작업구분/문서번호/완성품코드·명/LOT/작업수량/비고
- `DetailFilterModal` — 년도/월/작업구분/문서번호/완성품코드/완성품명/LOT 검색 폼(초기화/취소/검색 버튼)
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`

## 데이터 흐름
- 페이지 로드/재조회(`loadRows`): `GET /api/work-status?department_id=&shipper_id=` 호출
  - 응답(`WorkStatusDataResponse`)의 `rows`/`dataSource`를 상태로 반영
- 상태 변경: `PATCH /api/work-status` (body: `{ workId, status }`) 호출
  - 성공 시 클라이언트 `rows` 상태를 낙관적으로 갱신(`work.status`, `displayStatus` 재계산)

`app/api/work-status/route.ts`:
- GET mock 분기
  - `appRepository.listWorks`/`listWorkMasters`를 `toMockScopeIds`로 스코프 매핑해 사용
- GET Supabase 분기 처리 순서
  1. `resolveScopeIds`로 부서/화주 UUID 보정
  2. `fetchWorkMasterData`(`@/lib/repositories/work-master-supabase-repository`)로 작업마스터 조회
  3. `.from("works")`를 `department_id`/`shipper_id`로 필터 후 `work_date` 내림차순 조회
- PATCH mock 분기
  - DB 변경 없이 `{ source: "mock", workId, status }`만 반환
- PATCH Supabase 분기
  - `.from("works")`를 `status`, `latest_inspected_at`으로 update
- 두 핸들러 모두 예외 시 `mockData(...)`(GET) 또는 500 에러(PATCH)로 폴백

## 상태·필터
- `useFilterStore`(zustand)에서 `departmentId`/`shipperId`를 읽어 `FilterScope`로 사용
  - 값이 바뀌면 `loadRows`가 재실행(useCallback 의존성)
  - `components/layout/TopFilterBar.tsx`가 `lib/mobile/mobile-scope-storage.ts`(`localStorage` 키 `harness.mobile-scope.v1`)를 재사용해 스코프를 영속화한다. 최초 로드 시 저장된 스코프가 현재 사용자 권한·`is_active` 기준으로 유효하면 그 값을 적용하고, 무효하거나 없으면 기존처럼 첫 허용 부서/화주로 폴백한다. 사용자가 상단 select로 부서/화주를 바꾸면 즉시 저장되어 모바일(`/mobile/settings`)과 같은 브라우저에서 스코프가 동기화된다(웹 `useFilterStore` 자체에는 persist를 붙이지 않음)
- 화면 내부 필터(`WorkStatusFilter`: year/month/workType/documentNo/productCode/productName/lot)
  - 클라이언트 메모(`filteredRows`)로만 적용되며 서버에 재요청하지 않는다
  - 기본 연/월(`defaultYearMonth`)과 연/월 일치 판정은 `lib/utils/date.ts`의 `getCurrentYearMonth`/`isYearMonthMatch`를 사용하며, `app/mobile/status/page.tsx`(모바일 작업현황 연/월 select)와 공유한다
- 작업 상태(`WorkStatus`) 전이 규칙(`getSelectableWorkStatus`)
  - 드롭다운에서 선택 가능한 값은 `dashboardWorkStatusOptions`(registered/in_progress/on_hold/canceled/completed) 5종뿐
  - 현재 상태가 `inspection_failed`/`admin_review_requested`이면 선택 표시상 `on_hold`로 매핑
  - 현재 상태가 `passed`이면 선택 표시상 `completed`로 매핑
  - 실제 PATCH는 사용자가 클릭한 옵션 값 그대로 전송된다
- 화면 표시 상태(`DisplayStatus`, `getDisplayStatus`)
  - `getDisplayStatus`는 `lib/constants/status.ts`에 정의되어 `work-status/page.tsx`와 `app/api/work-status/route.ts`가 공유 import한다(중복 정의 아님)
  - `registered → waiting`
  - `in_progress → progress`
  - `on_hold`/`inspection_failed`/`admin_review_requested` → `hold`
  - `canceled → cancel`
  - 그 외(`passed`/`completed`) → `complete`

## 주요 타입
- `lib/types/work-status-api.ts`
  - `DisplayWorkStatusDto`
  - `WorkStatusRowDto`: work + displayStatus + workType/productCode/productName/lot/quantity
  - `WorkStatusDataResponse`: GET 응답
  - `UpdateWorkStatusResponse`: PATCH 응답
- `lib/types/domain.ts`: `Work`, `WorkStatus`
- `lib/state/work-flow-store.ts`: `dashboardWorkStatusOptions`(상태 드롭다운 옵션 목록)

## 주의사항
- mock 모드의 `PATCH /api/work-status`는 DB를 갱신하지 않으므로, mock 데이터에서는 새로고침하면 상태 변경이 초기화된다.
- `lot`, `quantity`, `workType` 값은 Supabase 조회 시 `works` 테이블에 `finished_product_lot`/`quantity`/`work_type` 컬럼이 없으면 `getFallbackFinishedProductLot`(work_date 기반 생성값)과 `workTypeOptions` 순환 인덱스로 대체된다(실제 저장값이 아닐 수 있음).
- 상세필터의 문서번호/완성품코드/완성품명/LOT 검색은 대소문자 무시 부분일치(`includesText`)로, 서버 쿼리가 아닌 클라이언트 필터링이다.
