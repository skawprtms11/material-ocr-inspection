# 작업등록 (`app/(workspace)/work-register`)

> 변경 이력(2026-10-18, 문서관리팀): 검수 행 생성 규칙(OCR/VISION/PHOTO + 제품 PHOTO)·생성 실패 시 롤백·assign의 status 비변경·작업 수정 PATCH의 reconcile 동작을 코드 기준으로 정리하고 구버전 서술(BOTH 분기, 폴백 payload)을 정정함.

## 개요
작업등록 화면은 완성품/구성품 정보를 입력해 새 작업을 등록하고, 등록된 작업 중 담당자가 아직 할당되지 않은 건("할당대기")을 목록으로 관리한다. 목록에서 담당자를 지정하면 해당 작업은 할당대기 목록에서 사라지고 검수 단계로 넘어간다. **검수완료(작업에 연결된 `work_inspections`가 1건 이상이고 전부 `passed`/`admin_approved`)로 판정된 작업은 이 화면의 할당대기 목록에 노출되지 않고 작업현황(`docs/menus/work-status.md`) 화면에서만 조회된다.**

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
  4. 위 행들의 `work_id in (...)`로 `.from("work_inspections")`를 `work_id`/`status`만 조회해 `getInspectionAggregateStatus`(`lib/server/inspection-status.ts`, work-status API와 공유하는 판정 함수)로 작업별 검수 집계 상태를 계산하고, **검수완료(`completed`)인 작업은 목록에서 제외**한다(검수완료 작업은 작업현황 화면에서만 조회됨). mock 분기(`mockPendingWorks`)도 `appRepository.listInspections(work.id)`로 동일 규칙을 적용해 검수완료 작업을 제외한다.
  5. `.from("work_components")`에서 남은 work_id들의 구성품 조회
- POST 처리 순서
  1. `.from("work_masters")`에서 단건 조회
  2. `.from("works")`에 insert (컬럼이 모두 존재하므로 축소 payload 재시도 폴백은 제거됨, 아래 변경 이력)
  3. `body.componentRows`가 있으면 `.from("work_components")`에 insert
  4. **검수 행 자동 생성**(`setupWorkInspections`, `lib/server/inspection-setup.ts`, stage=start): `work_components` 저장 이후 작업 `work_master_id`로 호출한다. 생성 규칙(부자재는 마스터 `inspection_method` 기준 OCR/VISION/PHOTO, 제품은 구성 행별 PHOTO)은 `docs/menus/work-inspection.md`의 "사진검수 + 작업승인 코어 규칙"이 기준이다. `failed`면 성공으로 보지 않고 구성품/검수행/works를 롤백한 뒤 502를 반환한다(아래 변경 이력).
- 응답(`CreateWorkRegistrationResponse`)에는 `work`와 함께 `inspectionSetup`(`"created" | "skipped_existing" | "skipped_no_master" | "skipped_no_materials" | "failed"`)이 포함된다. mock 분기에는 `inspectionSetup`이 없다. 응답의 `inspectionSetup`이 `failed`인 경우는 없다(실패는 롤백 후 502).
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(POST 저장 실패도 502 — 아래 변경 이력). mock 폴백은 mock 모드에서만 동작한다.

`app/api/work-register/[workId]/assign/route.ts`(PATCH):
- mock 분기: `{ source: "mock", workId, assignedTo }`만 반환(DB 미변경)
- Supabase 분기 처리 순서
  1. 스코프 확인(`assertWorkInScope`) 후 `assigneeId`가 UUID가 아니면 `.from("app_users")`에서 이름으로 재조회(찾지 못하면 400)
  2. 배정 전 값을 읽어둔 뒤 `.from("works")`를 `assigned_to`/`assigned_to_name`/`assigned_at`/`worker_name`으로 update한다(`status`는 덮어쓰지 않음, 응답에 `work_master_id`도 함께 select). 작업이 없으면 404.
  3. **검수 행 자동 생성**(`setupWorkInspections`, stage=start 공유 함수): 배정 성공 직후 호출한다. 해당 `work_id`·stage에 검수 행이 이미 있으면 스킵(`skipped_existing`, 재배정 시 진행 상황 보존을 위한 멱등 처리). 생성 규칙은 `docs/menus/work-inspection.md` 참고. 작업마스터 미연결/생성할 행 없음은 각각 `"skipped_no_master"`/`"skipped_no_materials"`. 조회·insert 중 예외로 `"failed"`가 되면 **배정을 이전 값으로 되돌리고 502**를 반환한다(변경 이력 참고).
- 응답: `{ source: "supabase", workId, assignedTo, assignedAt, inspectionSetup }` — `inspectionSetup`은 `"created" | "skipped_existing" | "skipped_no_master" | "skipped_no_materials" | "failed"` 중 하나(`failed`는 502로 처리되어 응답에 나타나지 않는다).
- mock 분기(`{ source: "mock", ... }`)에는 `inspectionSetup`이 없다(검수 행 생성 로직 자체가 실DB 모드 전용).
- **생성 시점이 배정 하나만은 아니다**: 같은 `setupWorkInspections`가 작업등록 POST(위 참고)에서도 호출되고, 모바일 검수 화면 진입 시 `app/api/work-inspection/setup/route.ts`(검수 행 0건일 때 lazy 생성, 내부는 `reconcileInspectionPlan`)와 작업 수정 PATCH(`reconcileInspectionPlan`)가 재판정·생성한다. `setupWorkInspections`는 stage별 멱등이라 호출 순서와 무관하게 검수 행은 한 번만 생성된다.

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

## 변경 이력 (2026-10, 결함 수정 + 작업 수정 기능)
- **work_components 실컬럼**: `component_type`/`component_code`/`component_name`/`unit_quantity`/`required_quantity`/`lot`/`allocated_quantity`/`memo` (`group_id`·`sort_order` 없음 → 읽을 때 `groupId`=코드, 제품→부자재→created_at 순 정렬). 구 컬럼명(`component_kind`/`item_code`/`item_name`) 폴백 제거. 공용 헬퍼는 `lib/server/work-register-shared.ts`.
- **POST**: 검증(필수값, `quantity` 양의 정수, 실DB는 제품 구성 1건 이상 → 400), `workMasterId`가 요청 부서/화주 소속인지 검증(404/403), `works` insert 폴백 제거(컬럼 모두 존재), 구성품 insert 실패 또는 검수행 생성 `failed` 시 구성품/검수행/works 롤백 후 502. 저장 실패는 모두 502.
- **GET**: 구성품·사용자 조회 오류는 throw → 502(mock 폴백 없음). 검수 시작(모든 stage 중 pending 아닌 행 존재) 작업은 `editLockedReason`을 내려 수정 버튼을 잠근다.
- **PATCH `/api/work-register/[workId]`** (신규, body는 POST와 동일): 작업의 부서/화주 불일치 403, 없음 404, `status!=registered` 또는 pending 아닌 검수행 존재 시 409. 구성품은 백업→삭제→재삽입, 실패 시 백업 복원 후 502. 작업마스터가 바뀌면 pending 검수행을 먼저 삭제하고, 이후 항상 `reconcileInspectionPlan`(stage=start)을 호출해 제품 구성 변경분(추가·삭제)과 부자재 검수방식 변경분을 pending 행에 한해 반영한다(검수행이 0건이면 새로 생성, `failed`면 502 — 수정 내용은 저장된 상태이므로 같은 내용 재저장으로 재시도). 수량만 바뀐 경우 검수행은 부자재×방식·제품 단위라 변경이 없다.
- **assign PATCH**: `status`를 더 이상 덮어쓰지 않음, 구 컬럼 폴백 제거(`assigned_to`가 항상 기록되어 목록 재노출 없음), 담당자 미확인 400, 작업 없음 404, 검수행 생성 `failed` 시 배정을 되돌리고 502.
- **화면**: 목록 "수정" 버튼(검수 시작 작업은 비활성 + 사유 표시) → 등록 모달을 `editWork`로 재사용해 값·구성품 프리필 → PATCH. 구성품은 작업마스터 변경 시에만 재생성, 수량 변경은 필요수량만 갱신(LOT/비고/분할 보존). 실DB 모드에서 제품 구성이 없으면 하드코딩 폴백 대신 "제품 구성 미등록" 안내와 함께 저장 차단(mock 모드는 폴백 유지).
- 위 "주의사항"의 폴백 payload(POST insert·assign 축소 payload, 2026-08 스모크 관찰 포함)·`makeFallbackProductRows` 항목은 실DB 모드 기준으로 더 이상 적용되지 않는다.

## 스코프 가드 (2026-10 추가, `lib/server/scope-guard.ts`)
- 공통 규칙: API 라우트는 서비스롤 키로 RLS를 우회하므로, 쓰기·삭제·상태변경·리소스ID 조회 요청은 부서/화주 스코프(JSON/FormData `departmentId`·`shipperId`, 쿼리 `department_id`·`shipper_id`)를 **필수**로 받는다. 누락 `400`, 리소스 없음 `404`, 스코프 불일치 `403`, 가드 내 DB 오류 `502`. 이 검증은 mock 모드에서도 스코프 존재(400)까지 동일하게 적용된다. 호출측은 웹은 `useFilterStore`, 모바일은 `useMobileScope()`(`lib/mobile/mobile-api.ts`, 기본 스코프 폴백 포함)의 값을 보낸다. 인증(로그인 사용자 확인)은 별도 범위다.
- `PATCH /api/work-register/[workId]/assign` body `{ departmentId, shipperId, assigneeId, assigneeName }`: 작업이 스코프 소속인지 먼저 확인한다(`assertWorkInScope`). `PATCH /api/work-register/[workId]`의 작업 소속 검증도 같은 `assertWorkInScope`를 쓴다(작업마스터 검증은 기존 `fetchScopedWorkMaster`).
