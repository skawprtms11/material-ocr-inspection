# 작업등록 (`app/(workspace)/work-register`)

> 변경 이력(2026-10-18, dev-D): "작업할당"을 **"작업지시"(작업지시서 출력 + 자동 배정)** 로 전환함. 화면은 더 이상 `assign` API를 호출하지 않으며(하위호환용으로 라우트만 유지), 목록은 검수 시작 전(`registered`) 작업을 출력 여부와 무관하게 노출하고 `미출력(기본)/출력완료/전체` 필터를 제공함. 아래 "작업지시서 출력" 절이 최신 기준이고, 본문의 "할당대기/담당자 할당/`AssignmentModal`" 서술은 이력으로 남긴 구버전임.

> 변경 이력(2026-10-18, 문서관리팀): 검수 행 생성 규칙(OCR/VISION/PHOTO + 제품 PHOTO)·생성 실패 시 롤백·assign의 status 비변경·작업 수정 PATCH의 reconcile 동작을 코드 기준으로 정리하고 구버전 서술(BOTH 분기, 폴백 payload)을 정정함.

## OCR 검수 텍스트 (2026-10-18, dev-A)
- **목적**: OCR 대상 부자재(부자재마스터 `inspection_method` = OCR 또는 BOTH)에 대해 작업별 검수 기준 텍스트(LOT·유효일자 등 자유 입력)를 등록·수정 모달에서 지정함. 모바일 OCR 판정이 마스터 `verification_value` 대신 이 값을 기준으로 씀(판정은 dev-B 범위, `docs/menus/work-inspection.md`·`mobile.md` 참고)
- **저장 위치**: `work_components.ocr_expected_text`(부자재 행만, 1~1000자 CHECK(2026-10-26 200→1000 확대, `docs/migrations/20261026_01_ocr_text_length.sql`), 제품·비대상 부자재는 NULL). 텍스트 단위 = 부자재 단위(부자재는 작업당 1행, LOT 분할 없음)
- **DTO**: `WorkComponentRowDto.ocrExpectedText?: string`(선택 필드, 기존 호출 호환). 요청(POST/PATCH `componentRows[]`)·응답(POST/PATCH `work.componentRows[]`, GET `pendingWorks[].componentRows[]`) 공통. 값이 없으면 필드 자체를 내려주지 않음
- **서버 검증**(`prepareOcrComponentRows`, `lib/server/work-register-shared.ts`; POST·PATCH 공통, 작업마스터 스코프 검증 직후·저장 전이라 롤백 불필요)
  - OCR 대상 판정은 클라이언트 행이 아니라 서버가 `work_master_materials` × `material_masters`로 다시 판단함(mock 모드는 `appRepository`)
  - 대상 부자재의 텍스트가 비었거나 요청 행에서 빠졌으면 `400 { error: "OCR 검수 텍스트를 입력하세요: CODE1, CODE2" }`, trim 후 1000자 초과면 400
  - 비대상 행(NONE/VISION 부자재, 제품)에 텍스트를 보내면 오류 없이 **무시**(NULL 저장)함. 저장 값은 trim 처리
  - 400은 작업/구성품 변경 전에 반환되므로 PATCH 거부 시 기존 값이 유지됨
- **수정 잠금 확장**: 검수행 중 `status != pending` **또는 `attempt_count > 0`**(OCR 일치율 미달 판정은 상태를 바꾸지 않고 증거만 남기므로)이면 수정 불가. PATCH는 `409`, GET은 `editLockedReason`으로 사유를 내려 수정 버튼을 비활성화하고 사유를 표시함. 사유 문구는 2종: "검수가 시작되어 수정할 수 없습니다."(상태 기준·works 상태 기준) / "검수 시도 이력(촬영·판정)이 있어 수정할 수 없습니다."(시도 이력 기준). 판정은 `inspectionEditLockReason`(shared)
- **화면(`WorkRegisterModal`)**: 구성품 표에 열 "OCR 검수 텍스트" 추가. OCR 대상 부자재 행은 구분 옆에 "OCR" 배지 + 입력란(textarea, 최대 1000자, 필수) + **"마스터값 가져오기"** 버튼. 입력란은 빈값으로 시작하며 **자동 채움 없음**(수정 모달은 저장값 프리필). 버튼은 부자재마스터 `verification_value`를 입력란에 넣고(이미 다른 값이 있으면 덮어쓰기 확인), 값이 없으면 "마스터에 등록된 검증값이 없습니다." 토스트. 제출 시 대상 행이 비어 있으면 빨간 테두리 + "필수 입력" + 토스트("OCR 검수 텍스트를 입력하세요(N건)")로 저장 중단. 작업마스터를 바꾸면 행이 재생성되어 텍스트도 초기화되고 수량 변경 시에는 보존됨. `WorkDetailModal`(읽기 전용)에도 같은 열을 표시함
- 하위호환: 기존 작업(컬럼 NULL)은 수정 시점부터 대상 부자재 텍스트가 필수가 됨. 판정 시 NULL이면 마스터 `verification_value`로 폴백(dev-B 처리)

## 작업지시서 출력 (2026-10-18, 최신 기준)
- 목록 컬럼 "작업할당" → **"작업지시"**, 버튼 "할당" → **"작업지시서"**. 행에는 출력 이력 요약(`출력 N회 · 최근 일시` / `미출력`)을 표시
- 클릭 → `WorkOrderModal`(`app/(workspace)/work-register/WorkOrderModal.tsx`): 작업 화주에 매핑된 **활성 양식만** 라디오 목록(기본 양식 선택 상태) + 선택 양식 미리보기(`DocumentPreviewFrame` + 실제 작업 데이터) + 출력 이력(순번·일시·양식·구분) + **출력**(미배정이면 "출력(자동배정)", 배정됨이면 "재출력") 버튼. 양식이 없으면 "문서마스터 > 화주별양식등록에서 양식을 등록하세요" 안내와 출력 비활성
- 팝업 차단 대응: 출력 클릭 시 `window.open("about:blank")`로 빈 탭을 먼저 열고(차단되면 API 호출 없이 안내), POST 성공 후 그 탭을 `printUrl`로 이동. 실패하면 탭을 닫고 오류 토스트
- 인쇄 라우트 `app/print/work-order/[workId]/page.tsx`(`app/print/layout.tsx`, 워크스페이스 레이아웃 밖 — 사이드바·필터바 없음): 쿼리 `department_id`·`shipper_id`·`issue_id`(또는 `template_id`)·`autoprint=1`. `issue_id`가 있으면 출력 당시 양식 스냅샷(`settings_snapshot`)으로 렌더. `DocumentRenderer mode="print"`, 툴바(인쇄/닫기)는 `print:hidden`, `autoprint=1`이면 QR 준비(`[data-code-ready="false"]` 0건, 최대 5초) 후 `window.print()`. 페이지 GET은 부작용이 없다(새로고침해도 이력 중복 없음)
- 목록 노출: 필터 `status="registered"` + 검수완료 제외만 유지하고 `assigned_to/assigned_at` 조건은 제거. 필터 `미출력(이력 0건, 기본)/출력완료(이력 1건 이상)/전체`는 클라이언트에서 `workOrder.issueCount`로 분리. 수정 버튼·잠금 규칙(검수 시작 시 수정 불가)은 그대로이며, 수정 PATCH 응답에는 출력 요약이 없어 화면이 기존 `assignedAt`/`workOrder`를 유지함
- GET 응답 `pendingWorks[]`에 `assignedAt`, `workOrder: { issueCount, lastIssuedAt, lastTemplateName } | null`(`work_order_issues` 1쿼리 집계) 추가

### API (`app/api/work-register/[workId]/work-order/**`, 공통 규칙: 스코프 누락 400 / 비UUID 400 / 없음 404 / 스코프·부서 불일치 403 / 충돌 409 / 실DB 오류 502, mock 폴백 없음)
| # | 경로 | 요청 | 응답·오류 |
|---|---|---|---|
| 9 | GET `.../work-order` | `department_id`, `shipper_id` | `{source, work:{id, documentNo, status, assignedAt}, templates[](화주 매핑·활성·레이아웃형, 기본 우선→sort_order), issues[](최근 10건, seq=작업별 출력 순번)}` |
| 10 | GET `.../work-order/print-data` | 스코프 + `template_id` 또는 `issue_id` | `{source, template:{id, templateType, layoutKey, settings}, data: WorkOrderPrintDto}`. `issue_id`: 출력 당시 스냅샷 settings, 다른 작업의 이력이면 404. `template_id`: 화주 미매핑·비활성 409. `data.codeValue` = `works.document_no` 그대로(모바일 문서번호 매칭 키) |
| 11 | POST `.../work-order` | `{departmentId, shipperId, templateId}` | `{source, workId, assigned, assignedAt, inspectionSetup?, issue:{id, issuedAt, issueKind, seq}, printUrl}` |

POST #11 처리 순서(실DB): 스코프 해석·`assertWorkInScope` → `canceled` 409 → 양식 검증(없음 404, 타 부서 403, 비레이아웃 400, 화주 미매핑 409, 비활성 409) → `assigned_at IS NULL`이면 **작업자 없이 자동 배정**(`assigned_at=now()`만 기록, `assigned_to`/`assigned_to_name`/`worker_name`/`status` 불변, `.is("assigned_at", null)` 조건부 update로 동시 클릭 중 1건만 배정) → 배정했으면 `setupWorkInspections`(멱등, `failed`면 배정 원복 + 502) → `work_order_issues` INSERT(양식 code·name·revision_date·template_type·layout_key·`settings_snapshot` 스냅샷, `assigned_on_issue`) → 실패 시 배정 원복 + 502. 이미 배정된 작업은 works를 변경하지 않고 이력만 추가한다. `issue_kind`는 이번 호출에서 배정했거나 해당 작업의 첫 출력이면 `initial`, 그 외는 `reprint`(구 assign API로 배정된 작업의 첫 출력도 `initial`). 출력은 "출력 요청 이력"이며 인쇄 완료 여부는 브라우저가 알려주지 않아 기록하지 않는다. 출력자(`issued_by`)는 인증 미구현으로 NULL.
- 서버 헬퍼는 `lib/server/work-order.ts`(양식 매핑 검증, 이력 조회, 출력 DTO 조립). mock 모드는 `appRepository`의 문서양식/매핑을 읽어 옵션·미리보기만 제공하고 POST는 DB 변경 없이 echo한다. mock POST는 작업 상태가 `registered`(미배정)이면 `assigned:true`·`initial`, 그 외(이미 진행 중)는 `assigned:false`·`reprint`로 응답한다(mock에는 `assigned_at`이 없어 상태로 근사, 작업 없음 404/스코프 불일치 403).
- **출력 DTO BOM 폴백**: `buildWorkOrderPrintDto`는 `work_components`가 있으면 기존대로 사용하고, 제품/부자재 구성품이 0건이면 작업현황 상세(`/api/work-status/detail`)와 같은 규칙으로 작업마스터 BOM(`work_master_products`/`work_master_materials` × 작업수량)으로 폴백한다. 제품: 필요=할당=단위수량×작업수량, LOT `-`. 부자재: 필요=할당=단위수량×작업수량, LOT `-`, 검수방식 라벨은 `normalizeMaterialInspectionMethod` 기준. 조회는 공용 `lib/server/work-master-bom.ts`(`loadWorkMasterProductRows`/`loadWorkMasterMaterialRows`)를 detail 라우트와 공유하며, 미리보기·인쇄가 같은 DTO라 함께 적용된다.
- 인쇄 페이지(`/print/work-order/[workId]`)는 `issue_id`가 있어도 `template_id`를 함께 전송한다(실DB는 issue_id 우선, mock print-data는 template_id로만 양식을 찾음).
- **담당자 지정 기능 제거(2026-10, 보안점검 M4)**: `PATCH /api/work-register/[workId]/assign` 라우트와 `lib/state/work-flow-store.ts`의 `assignWorkToInspection`(+`WorkAssignmentDraft`/`AssignedUserDraft` 타입)을 삭제함(호출처 0건 확인). 작업자 없이 배정 시각만 기록하는 작업지시서 출력의 자동 배정(`POST .../work-order`)과 `works.assigned_to`/`assigned_to_name` 컬럼은 유지한다(읽기 전용 표시·구 데이터용). 아래 본문에 남은 assign 서술은 구버전 이력임.

## 개요
작업등록 화면은 완성품/구성품 정보를 입력해 새 작업을 등록하고, 검수 시작 전(`registered`) 작업을 "작업지시 대기 목록"으로 관리한다. 목록에서 작업지시서를 출력하면 작업자 지정 없이 자동 배정(`assigned_at`만 기록)되고 검수 단계로 넘어가되, 검수 시작 전까지는 목록에 남아 재출력·수정이 가능하다. **검수완료(작업에 연결된 `work_inspections`가 1건 이상이고 전부 `passed`/`admin_approved`)로 판정된 작업은 이 목록에 노출되지 않고 작업현황(`docs/menus/work-status.md`) 화면에서만 조회된다.**

## 화면 구조
`app/(workspace)/work-register/page.tsx`(클라이언트 컴포넌트)는 다음 섹션으로 구성된다.
- `PageHeader`(`@/components/common/PageHeader`) — 제목/설명 + "작업 등록" 버튼(`CloudButton`)
- 데이터 소스 배지 바 — `dataSource`가 `supabase`/`mock`/`null`인지 표시. 조회 실패(`loadError`) 시 "연결 오류" 배지 + "다시 시도" 버튼으로 `loadWorkRegister` 재호출
- `CuteCard`(`@/components/common/CuteCard`) 안의 "작업지시 대기 작업 목록" 테이블 — 등록일자/작업구분/문서번호/완성품코드/완성품명/LOT/작업수량/완료요청일/비고/수정/작업지시 컬럼 + 출력 필터(미출력 기본/출력완료/전체)
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`(`@/components/common/EmptyCloudState`)를 렌더링

모달 3종(`WorkRegisterModal`·`WorkDetailModal`은 page.tsx 내부 함수 컴포넌트, `WorkOrderModal`은 별도 파일). 구버전 `AssignmentModal`은 코드에서 제거됨:
- `WorkRegisterModal` — 완성품정보(작업구분/문서번호/완성품코드(작업마스터 선택)/완성품명/LOT/작업수량/완료요청일/비고) 표 입력 + 구성품 정보(제품/부자재) 표. 제품은 LOT 분할("행추가"/"삭제") 가능하며 `productAllocationErrors`로 할당수량 합계와 필요수량 불일치를 검증
- `WorkOrderModal` — 작업지시서 양식 선택·미리보기·출력(위 "작업지시서 출력" 절)
- `WorkDetailModal` — 목록 행의 완성품/구성품 상세 조회 전용(읽기 전용)

## 데이터 흐름
- 페이지 로드: `GET /api/work-register?department_id=&shipper_id=` 호출
  - 응답(`WorkRegisterDataResponse`)을 `applyData`로 받아 `pendingWorks`/`workMasters`/`materials`/`users`/`materialRowsByWork`/`productRowsByWork`/`dataSource` 상태에 반영
- 작업 등록: `POST /api/work-register` (body: `CreateWorkRegistrationRequest`)
  - 성공 시 `pendingWorks`에 신규 항목을 prepend
- 작업지시서 출력(자동 배정): `POST /api/work-register/[workId]/work-order` (위 "작업지시서 출력" 절). 성공해도 `pendingWorks`에서 제거하지 않고 행의 `assignedAt`/`workOrder` 요약만 갱신함
  - (구버전 `PATCH .../assign` + `assignWorkToInspection` 호출 흐름은 화면·코드에서 모두 제거됨)

`app/api/work-register/route.ts`(GET/POST):
- `NEXT_PUBLIC_USE_MOCK_DATA !== "false"`이거나 Supabase 클라이언트가 없으면 `appRepository`(`@/lib/repositories/app-repository`) 기반 mock 데이터를 반환
- GET Supabase 분기 처리 순서
  1. `resolveScopeIds`로 부서/화주 UUID 보정
  2. `fetchWorkMasterData`(`@/lib/repositories/work-master-supabase-repository`)로 작업마스터/자재/제품 매핑 조회
  3. `.from("works")`에서 `status = "registered"`인 행 조회(배정 여부로 거르지 않음 — 출력 후에도 재출력 가능)
  4. 위 행들의 `work_id in (...)`로 `.from("work_inspections")`를 `work_id`/`status`만 조회해 `getInspectionAggregateStatus`(`lib/server/inspection-status.ts`, work-status API와 공유하는 판정 함수)로 작업별 검수 집계 상태를 계산하고, **검수완료(`completed`)인 작업은 목록에서 제외**한다(검수완료 작업은 작업현황 화면에서만 조회됨). mock 분기(`mockPendingWorks`)도 `appRepository.listInspections(work.id)`로 동일 규칙을 적용해 검수완료 작업을 제외한다.
  5. `.from("work_components")`에서 남은 work_id들의 구성품 조회
- POST 처리 순서
  1. `.from("work_masters")`에서 단건 조회
  2. `.from("works")`에 insert (컬럼이 모두 존재하므로 축소 payload 재시도 폴백은 제거됨, 아래 변경 이력)
  3. `body.componentRows`가 있으면 `.from("work_components")`에 insert
  4. **검수 행 자동 생성**(`setupWorkInspections`, `lib/server/inspection-setup.ts`, stage=start): `work_components` 저장 이후 작업 `work_master_id`로 호출한다. 생성 규칙(부자재는 마스터 `inspection_method` 기준 OCR/VISION/PHOTO, 제품은 구성 행별 PHOTO)은 `docs/menus/work-inspection.md`의 "사진검수 + 작업승인 코어 규칙"이 기준이다. `failed`면 성공으로 보지 않고 구성품/검수행/works를 롤백한 뒤 502를 반환한다(아래 변경 이력).
- 응답(`CreateWorkRegistrationResponse`)에는 `work`와 함께 `inspectionSetup`(`"created" | "skipped_existing" | "skipped_no_master" | "skipped_no_materials" | "failed"`)이 포함된다. mock 분기에는 `inspectionSetup`이 없다. 응답의 `inspectionSetup`이 `failed`인 경우는 없다(실패는 롤백 후 502).
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(POST 저장 실패도 502 — 아래 변경 이력). mock 폴백은 mock 모드에서만 동작한다.

## 상태·필터
- `useFilterStore`(`@/lib/state/filter-store`, zustand)에서 `departmentId`/`shipperId`를 읽어 `FilterScope`로 사용
  - 둘 중 하나라도 없으면 `EmptyCloudState`를 표시
  - 둘 다 있으면 `useEffect`에서 GET 호출(값 변경 시 재조회, `AbortController`로 이전 요청 취소)
- 작업 상태 전이
  - 이 화면은 신규 작업을 항상 `status: "registered"`로 생성한다
  - 별도의 `WorkStatus` 전이 UI는 없다(전이는 작업현황/작업검수 화면에서 발생)
- (구버전) `assignWorkToInspection`(localStorage `harness.work-flow.v1`)은 삭제됨

## 주요 타입
- `lib/types/work-register-api.ts`
  - `WorkComponentRowDto`: rowId/groupId/kind/code/name/unitQuantity/requiredQuantity/lot/allocatedQuantity/memo/ocrExpectedText?(부자재 전용, 위 "OCR 검수 텍스트" 절)
  - `PendingAssignmentWorkDto`: 할당대기 작업 1건
  - `WorkRegisterDataResponse`: GET 응답 전체
  - `CreateWorkRegistrationRequest`/`CreateWorkRegistrationResponse`: POST 요청/응답
- `lib/types/domain.ts`: `AppUser`, `MaterialMaster`, `WorkMaster`
- `lib/types/work-master-api.ts`: `ProductUsageRowDto`, `WorkMaterialRowDto`(작업마스터별 제품/부자재 구성 매핑)

## 주의사항
- (삭제됨) `AssignmentModal`의 할당 메모 입력은 모달 제거와 함께 사라짐.
- `WorkRegisterModal`의 구성품 표는 제품(`productRowsByWork`)이 비어 있을 때 `makeFallbackProductRows`로 하드코딩된 `productTemplates`(PRD-MT-001 등)를 사용해 임의 대체 데이터를 보여준다.
- POST insert 실패 시 재시도하는 축소 payload는 `work_type`/`quantity`/`due_date`/`finished_product_lot` 컬럼이 Supabase `works` 테이블에 없을 수 있음을 전제로 한 방어 코드다.
- PATCH(할당) mock 분기는 DB에 아무것도 반영하지 않고 성공 응답만 반환하므로, mock 모드에서는 새로고침 시 할당 이력이 사라진다(클라이언트 localStorage에만 남음).
- 실DB 스모크 테스트(2026-08) 결과 `works.assigned_to`/`assigned_at` full payload update가 매번 실패해 축소 payload(`worker_name`/`status`만 반영)로 폴백되는 것이 관찰됐다(테스트 환경 컬럼 상태 문제로 추정, 이번 작업 범위 밖이라 별도 수정하지 않음). 이 경우 작업검수 화면의 `getInspectionStep`이 배정 여부(`assigned_to`/`assigned_at`)로 "검수대상"/"검수대기"를 구분하지 못해 배정 후에도 "검수대기"로 보일 수 있다. 검수 행 생성 자체(`inspectionSetup`)는 이 컬럼과 무관하게 정상 동작한다.

## 변경 이력 (2026-10, 결함 수정 + 작업 수정 기능)
- **work_components 실컬럼**: `component_type`/`component_code`/`component_name`/`unit_quantity`/`required_quantity`/`lot`/`allocated_quantity`/`memo` (`group_id`·`sort_order` 없음 → 읽을 때 `groupId`=코드, 제품→부자재→created_at 순 정렬). 구 컬럼명(`component_kind`/`item_code`/`item_name`) 폴백 제거. 공용 헬퍼는 `lib/server/work-register-shared.ts`.
- **POST**: 검증(필수값, `quantity` 양의 정수, 실DB는 제품 구성 1건 이상 → 400), `workMasterId`가 요청 부서/화주 소속인지 검증(404/403), `works` insert 폴백 제거(컬럼 모두 존재), 구성품 insert 실패 또는 검수행 생성 `failed` 시 구성품/검수행/works 롤백 후 502. 저장 실패는 모두 502.
- **GET**: 구성품·사용자 조회 오류는 throw → 502(mock 폴백 없음). 검수 시작(모든 stage 중 pending 아닌 행 존재, 또는 `attempt_count > 0`) 작업은 `editLockedReason`을 내려 수정 버튼을 잠근다.
- **PATCH `/api/work-register/[workId]`** (신규, body는 POST와 동일): 작업의 부서/화주 불일치 403, 없음 404, `status!=registered` 또는 pending 아닌 검수행 존재 시 409. 구성품은 백업→삭제→재삽입, 실패 시 백업 복원 후 502. 작업마스터가 바뀌면 pending 검수행을 먼저 삭제하고, 이후 항상 `reconcileInspectionPlan`(stage=start)을 호출해 제품 구성 변경분(추가·삭제)과 부자재 검수방식 변경분을 pending 행에 한해 반영한다(검수행이 0건이면 새로 생성, `failed`면 502 — 수정 내용은 저장된 상태이므로 같은 내용 재저장으로 재시도). 수량만 바뀐 경우 검수행은 부자재×방식·제품 단위라 변경이 없다.
- **assign PATCH**: `status`를 더 이상 덮어쓰지 않음, 구 컬럼 폴백 제거(`assigned_to`가 항상 기록되어 목록 재노출 없음), 담당자 미확인 400, 작업 없음 404, 검수행 생성 `failed` 시 배정을 되돌리고 502.
- **화면**: 목록 "수정" 버튼(검수 시작 작업은 비활성 + 사유 표시) → 등록 모달을 `editWork`로 재사용해 값·구성품 프리필 → PATCH. 구성품은 작업마스터 변경 시에만 재생성, 수량 변경은 필요수량만 갱신(LOT/비고/분할 보존). 실DB 모드에서 제품 구성이 없으면 하드코딩 폴백 대신 "제품 구성 미등록" 안내와 함께 저장 차단(mock 모드는 폴백 유지).
- 위 "주의사항"의 폴백 payload(POST insert·assign 축소 payload, 2026-08 스모크 관찰 포함)·`makeFallbackProductRows` 항목은 실DB 모드 기준으로 더 이상 적용되지 않는다.

## 스코프 가드 (2026-10 추가, `lib/server/scope-guard.ts`)
- 공통 규칙: API 라우트는 서비스롤 키로 RLS를 우회하므로, 쓰기·삭제·상태변경·리소스ID 조회 요청은 부서/화주 스코프(JSON/FormData `departmentId`·`shipperId`, 쿼리 `department_id`·`shipper_id`)를 **필수**로 받는다. 누락 `400`, 리소스 없음 `404`, 스코프 불일치 `403`, 가드 내 DB 오류 `502`. 이 검증은 mock 모드에서도 스코프 존재(400)까지 동일하게 적용된다. 호출측은 웹은 `useFilterStore`, 모바일은 `useMobileScope()`(`lib/mobile/mobile-api.ts`, 기본 스코프 폴백 포함)의 값을 보낸다. 인증(로그인 사용자 확인)은 별도 범위다.
- `PATCH /api/work-register/[workId]`의 작업 소속 검증은 `assertWorkInScope`를 쓴다(구 assign 라우트는 삭제됨)(작업마스터 검증은 기존 `fetchScopedWorkMaster`).
