# 작업등록 (`app/(workspace)/work-register`)

## 개요
작업등록 화면은 완성품/구성품 정보를 입력해 새 작업을 등록하고, 등록된 작업 중 담당자가 아직 할당되지 않은 건("할당대기")을 목록으로 관리한다. 목록에서 담당자를 지정하면 해당 작업은 할당대기 목록에서 사라지고 검수 단계로 넘어간다.

## 화면 구조
`app/(workspace)/work-register/page.tsx`(클라이언트 컴포넌트)는 다음 섹션으로 구성된다.
- `PageHeader`(`@/components/common/PageHeader`) — 제목/설명 + "작업 등록" 버튼(`CloudButton`)
- 데이터 소스 배지 바 — `dataSource`가 `supabase`/`mock`/`null`인지 표시. 조회 실패(`loadError`) 시 "연결 오류" 배지 + "다시 시도" 버튼으로 `loadWorkRegister` 재호출
- `CuteCard`(`@/components/common/CuteCard`) 안의 "할당 대기중인 작업 목록" 테이블 — 등록일자/작업구분/문서번호/완성품코드·명/LOT/작업수량/완료요청일/비고/작업할당 컬럼
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`(`@/components/common/EmptyCloudState`)를 렌더링

모달 3종(같은 파일 내부에 함수 컴포넌트로 정의):
- `WorkRegisterModal` — 완성품정보(작업구분/문서번호/완성품코드(작업마스터 선택)/완성품명/LOT/작업수량/완료요청일/비고) 표 입력 + 구성품 정보(제품/부자재) 표. 제품은 LOT 분할("행추가"/"삭제") 가능하며 `productAllocationErrors`로 할당수량 합계와 필요수량 불일치를 검증
- `AssignmentModal` — 담당자 선택 + 메모(비저장) 폼, 제출 시 `handleAssign` 호출
- `WorkDetailModal` — 할당대기 행의 완성품/구성품 상세 조회 전용(읽기 전용)

## 데이터 흐름
- 페이지 로드: `GET /api/work-register?department_id=&shipper_id=` 호출
  - 응답(`WorkRegisterDataResponse`)을 `applyData`로 받아 `pendingWorks`/`workMasters`/`materials`/`users`/`materialRowsByWork`/`productRowsByWork`/`dataSource` 상태에 반영
- 작업 등록: `POST /api/work-register` (body: `CreateWorkRegistrationRequest`)
  - 성공 시 `pendingWorks`에 신규 항목을 prepend
- 담당자 할당: `PATCH /api/work-register/[workId]/assign` (body: `{ assigneeId, assigneeName }`)
  - 성공 시 `assignWorkToInspection(targetWork, assignee, scope)`(`@/lib/state/work-flow-store`, localStorage 기반)를 호출
  - 이후 `pendingWorks`에서 해당 작업을 제거

`app/api/work-register/route.ts`(GET/POST):
- `NEXT_PUBLIC_USE_MOCK_DATA !== "false"`이거나 Supabase 클라이언트가 없으면 `appRepository`(`@/lib/repositories/app-repository`) 기반 mock 데이터를 반환
- GET Supabase 분기 처리 순서
  1. `resolveScopeIds`로 부서/화주 UUID 보정
  2. `fetchWorkMasterData`(`@/lib/repositories/work-master-supabase-repository`)로 작업마스터/자재/제품 매핑 조회
  3. `.from("works")`에서 `status = "registered"`이고 `assigned_to`/`assigned_at`이 없는 행 조회
  4. `.from("work_components")`에서 해당 work_id들의 구성품 조회
- POST 처리 순서
  1. `.from("work_masters")`에서 단건 조회
  2. `.from("works")`에 insert (실패 시 `work_type`/`quantity`/`due_date`/`finished_product_lot` 컬럼을 제외한 축소 payload로 재시도)
  3. `body.componentRows`가 있으면 `.from("work_components")`에 insert
  4. **검수 행 자동 생성**(`setupWorkInspections`, `lib/server/inspection-setup.ts`): 작업 insert 성공 직후 `body.workMasterId`로 검수 행을 생성한다. 로직은 아래 assign PATCH와 동일(멱등 스킵/OCR·VISION·BOTH 분기)하며, 실패해도 작업 등록 자체는 성공으로 유지한다(응답에 `inspectionSetup` 필드로만 알림).
- 응답(`CreateWorkRegistrationResponse`)에는 `work`와 함께 `inspectionSetup`(`"created" | "skipped_existing" | "skipped_no_master" | "skipped_no_materials" | "failed"`)이 포함된다. mock 분기에는 `inspectionSetup`이 없다.
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(POST는 기존대로 500 에러). mock 폴백은 mock 모드에서만 동작한다.

`app/api/work-register/[workId]/assign/route.ts`(PATCH):
- mock 분기: `{ source: "mock", workId, assignedTo }`만 반환(DB 미변경)
- Supabase 분기 처리 순서
  1. `assigneeId`가 UUID가 아니면 `.from("app_users")`에서 이름으로 재조회
  2. `.from("works")`를 `assigned_to`/`assigned_to_name`/`assigned_at`/`worker_name`/`status: "registered"`로 update(응답에 `work_master_id`도 함께 select)
  3. 실패 시 `assigned_to`/`assigned_to_name`/`assigned_at`을 제외한 축소 payload로 재시도
  4. **검수 행 자동 생성**(`setupWorkInspections`, `lib/server/inspection-setup.ts`로 추출된 공유 함수): 배정 성공 직후 해당 `work_id`의 `work_inspections`를 조회해 이미 1건이라도 있으면 스킵(`inspectionSetup: "skipped_existing"`, 재배정 시 진행 상황 보존을 위한 멱등 처리). 없으면 `work_master_id`로 `work_master_materials`(`inspection_order` 오름차순)를 조회하고, 각 `material_id`의 `material_masters.inspection_method`를 확인해 `OCR`/`VISION`이면 검수 행 1개, `BOTH`면 `OCR`·`VISION` 각 1개(`status: "pending"`, `attempt_count: 0`, `result_summary: ""`)를 insert한다. 작업마스터 미연결/부자재 구성 없음은 각각 `"skipped_no_master"`/`"skipped_no_materials"`로, 조회·insert 중 예외가 나면 `"failed"`로 표시하되 **배정 자체는 롤백하지 않는다**(응답에 `inspectionSetup` 필드로만 알림).
- 응답: `{ source: "supabase", workId, assignedTo, assignedAt, inspectionSetup }` — `inspectionSetup`은 `"created" | "skipped_existing" | "skipped_no_master" | "skipped_no_materials" | "failed"` 중 하나.
- mock 분기(`{ source: "mock", ... }`)에는 `inspectionSetup`이 없다(검수 행 생성 로직 자체가 실DB 모드 전용).
- **생성 시점이 배정 하나만은 아니다**: 같은 `setupWorkInspections`가 작업등록 POST(위 참고)와 모바일 스캔 시점의 `app/api/work-inspection/setup/route.ts`(lazy 생성, `docs/menus/mobile.md` 참고)에서도 호출된다. 세 지점 모두 멱등이라 어느 순서로 호출돼도 검수 행은 한 번만 생성된다.

## 상태·필터
- `useFilterStore`(`@/lib/state/filter-store`, zustand)에서 `departmentId`/`shipperId`를 읽어 `FilterScope`로 사용
  - 둘 중 하나라도 없으면 `EmptyCloudState`를 표시
  - 둘 다 있으면 `useEffect`에서 GET 호출(값 변경 시 재조회, `AbortController`로 이전 요청 취소)
- 작업 상태 전이
  - 이 화면은 신규 작업을 항상 `status: "registered"`로 생성한다
  - 별도의 `WorkStatus` 전이 UI는 없다(전이는 작업현황/작업검수 화면에서 발생)
- `assignWorkToInspection`은 localStorage(`harness.work-flow.v1`) 기반 클라이언트 상태로 동작한다
  - 할당된 작업을 `statusOverrides`에 `"registered"`로 기록
  - `assignedWorkIds`에 해당 작업 id를 추가

## 주요 타입
- `lib/types/work-register-api.ts`
  - `WorkComponentRowDto`: rowId/groupId/kind/code/name/unitQuantity/requiredQuantity/lot/allocatedQuantity/memo
  - `PendingAssignmentWorkDto`: 할당대기 작업 1건
  - `WorkRegisterDataResponse`: GET 응답 전체
  - `CreateWorkRegistrationRequest`/`CreateWorkRegistrationResponse`: POST 요청/응답
- `lib/types/domain.ts`: `AppUser`, `MaterialMaster`, `WorkMaster`
- `lib/types/work-master-api.ts`: `ProductUsageRowDto`, `WorkMaterialRowDto`(작업마스터별 제품/부자재 구성 매핑)

## 주의사항
- `AssignmentModal`의 "할당 메모" `textarea`는 폼에 존재하지만 `handleAssign`/POST body 어디에도 값을 읽어 전송하는 코드가 없다(현재는 저장되지 않는 UI 전용 입력).
- `WorkRegisterModal`의 구성품 표는 제품(`productRowsByWork`)이 비어 있을 때 `makeFallbackProductRows`로 하드코딩된 `productTemplates`(PRD-MT-001 등)를 사용해 임의 대체 데이터를 보여준다.
- POST insert 실패 시 재시도하는 축소 payload는 `work_type`/`quantity`/`due_date`/`finished_product_lot` 컬럼이 Supabase `works` 테이블에 없을 수 있음을 전제로 한 방어 코드다.
- PATCH(할당) mock 분기는 DB에 아무것도 반영하지 않고 성공 응답만 반환하므로, mock 모드에서는 새로고침 시 할당 이력이 사라진다(클라이언트 localStorage에만 남음).
- 실DB 스모크 테스트(2026-08) 결과 `works.assigned_to`/`assigned_at` full payload update가 매번 실패해 축소 payload(`worker_name`/`status`만 반영)로 폴백되는 것이 관찰됐다(테스트 환경 컬럼 상태 문제로 추정, 이번 작업 범위 밖이라 별도 수정하지 않음). 이 경우 작업검수 화면의 `getInspectionStep`이 배정 여부(`assigned_to`/`assigned_at`)로 "검수대상"/"검수대기"를 구분하지 못해 배정 후에도 "검수대기"로 보일 수 있다. 검수 행 생성 자체(`inspectionSetup`)는 이 컬럼과 무관하게 정상 동작한다.
