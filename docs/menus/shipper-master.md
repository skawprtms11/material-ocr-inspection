# 화주마스터 (`app/(workspace)/shipper-master`)

## 개요
선택된 부서에 소속된 화주 목록을 조회하고, 화주별 작업조장(crew leader)을 다중 선택으로 등록하는 화면이다. 화주 등록/수정 자체는 UI 버튼만 있고 실제 저장 로직은 없으며, 실질적으로 동작하는 것은 작업조장 등록(PATCH) 기능이다.

## 화면 구조
- `app/(workspace)/shipper-master/page.tsx` (`ShipperMasterPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `DataTable`, `EmptyCloudState`(`components/common/EmptyCloudState.tsx`)
- `departmentId`가 없으면 `EmptyCloudState`("화주가 소속될 부서를 먼저 골라주세요.")를 렌더링하고 조회를 하지 않는다.
- 테이블 컬럼: 화주코드, 화주명, 작업반장(`foreman_name`), 작업조장(인원수 배지 버튼), 사용여부.
- "작업조장" 버튼 클릭 시 `CrewLeaderModal`(같은 파일 내부 컴포넌트) 팝업이 열리며, `workerCandidates`(활성 + role이 worker/manager/admin인 사용자) 중에서 체크박스로 다중 선택 후 저장한다.

## 데이터 흐름
- 조회: `GET /api/shipper-master?department_id=...` (`useFilterStore().departmentId` 변경 시 재조회)
  - API(`app/api/shipper-master/route.ts`): mock 조건이면 `appRepository.listShippers({departmentId})` + `appRepository.listUsers()`.
  - Supabase 분기: `resolveScopeIds`로 department_id를 UUID로 보정 후 `.from("shippers").select("*").eq("department_id", ...)`, `.from("app_users").select("*")`, `.from("user_department_permissions").select("user_id, department_id")`, `.from("user_shipper_permissions").select("user_id, shipper_id")`를 병렬 조회하여 사용자별 권한 배열을 조립.
- 저장(작업조장): `PATCH /api/shipper-master` body `{ shipperId, crewLeaderIds }`
  - mock이면 그대로 echo, Supabase면 `.from("shippers").update({ crew_leader_ids }).eq("id", shipperId)`.
- 확인된 Supabase 테이블: `shippers`, `app_users`, `user_department_permissions`, `user_shipper_permissions`.

## 상태·필터
- `useFilterStore()`(`lib/state/filter-store.ts`)에서 `departmentId`만 구독한다(shipperId는 사용 안 함).
- `departmentId`가 빈 문자열이면 `useEffect`가 조회를 건너뛴다.
- `workerCandidates`는 `useMemo`로 계산: `dataSource === "supabase"`이면 부서 필터를 건너뛰고(=서버에서 이미 전체 조회), mock이면 `user.department_ids.includes(departmentId)`로 클라이언트 필터링. 즉 데이터 소스에 따라 필터링 로직이 달라진다.

## 주요 타입
- `Shipper`(`lib/types/domain.ts`): `id`, `department_id`, `code`, `name`, `foreman_name`, `crew_leader_ids: string[]`, `is_active`, `created_at`, `updated_at`.
- `AppUser`: `id`, `name`, `email`, `role`, `is_active`, `department_ids: string[]`, `shipper_ids: string[]`.

## 주의사항
- "화주 추가" `CloudButton`은 `onClick` 핸들러가 없다(미완성).
- 화주 수정/삭제 API가 없다. `route.ts`에는 GET/PATCH만 존재.
- `workerCandidates` 필터가 `dataSource`에 따라 분기하는 부분은 화주 소속 판별 기준이 mock/Supabase 간 다르다는 점을 인지해야 한다(서버가 이미 부서로 필터링했다는 전제).
