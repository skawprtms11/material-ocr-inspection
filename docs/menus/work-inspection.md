# 작업검수 (`app/(workspace)/work-inspection`)

> 변경 이력(2026-10-18, 문서관리팀): 사진검수(PHOTO)·관리자 작업승인/반려 코드 반영에 맞춰 검수 행 생성·`complete`/`adjustment` 동작·진입 조건·상태 전이·타입·DB 스키마 변경 이력을 코드 기준으로 정리함(팀별 중복·구버전 서술 정리).

## 개요
현장(모바일)에서 진행한 OCR/비전/사진 검수 이력을 표로 확인하고, 관리자가 제출된 제품·부자재 사진을 승인/반려(작업승인·완료승인)하거나 현장 확인요청(조정확인)을 승인/재검수요청/미승인 처리하는 화면이다. (2026-10: 기존 "검수완료" 버튼은 "완료승인"(사진 승인 플로우)으로 대체)

## 화면 구조
`app/(workspace)/work-inspection/page.tsx`(클라이언트 컴포넌트) 구성:
- `PageHeader` — 제목/설명만, 별도 액션 버튼 없음
- **사진 승인대기 섹션**(`photoApprovalQueue.length > 0`일 때 확인요청 섹션 아래에 표시) — `row.photoReview[stage].submittedPhotos > 0`인 (작업, 단계) 쌍을 문서번호/단계(작업승인대기·완료승인대기)/제출 n/m/반려 k/사진 외 미완료/제출시각으로 나열하고 "사진 확인" 버튼으로 `PhotoApprovalModal`을 연다.
- 데이터 소스 배지 바(`supabase`/`mock`/연결 확인 중/연결 오류) — 연결 오류 시 "다시 시도" 버튼으로 `loadRows` 재호출
- **확인요청 섹션**(`pendingReviewRequests.length > 0`일 때만 목록 최상단에 표시) — 미처리(`admin_review_requests.status === "requested"`) 확인요청을 검수 항목 단위(문서번호/부자재(또는 제품)명/검수방식/요청사유/요청시각)로 나열하는 별도 `CuteCard` 표. 각 행에 버튼 2개:
  - **검수승인**: `PATCH /api/work-inspection`(`action: { type: "adjustment", requestId, status: "approved", inspectionId }`) 호출. 해당 검수 항목만 `admin_approved`로 좁혀 처리한다(아래 "PATCH `adjustment`" 참고).
  - **재검수**: 같은 API를 `status: "retry_requested"`로 호출. 해당 검수 항목만 `retrying`(모바일에서 다시 검수 가능한 기존 재검수 상태)으로 되돌린다.
  - 두 버튼 모두 처리 중에는 `processingRequestId`로 해당 행만 비활성화하고, 성공 시 `loadRows()`로 섹션과 표를 함께 갱신한다.
- `CuteCard` 목록 테이블 — 등록일자/작업구분/문서번호/완성품코드·명/작업수량/검수단계/사진검수·승인/조정확인. "검수대상" 건수 배지 표시
  - 검수단계 배지 색상은 `getStepClassName`(문자열 포함 여부로 분기: 반려→빨강, 승인대기→남색, 완료/승인→초록, 대상→보라, 보류/취소→회색, 요청→주황, 불일치/재검수→빨강, 진행/모바일→하늘)
  - 사진검수/승인 컬럼: "사진 확인" 버튼(기본 단계 = 승인대기 사진이 있는 단계(시작·완료 모두 있으면 시작 우선), 없으면 `work.status === "in_progress"`면 complete·그 외 start) + "완료승인" 버튼(완료단계 `PhotoApprovalModal` 진입). "완료승인"은 완료단계 승인대기 사진이 없거나 `work.status`가 `canceled`/`on_hold`/`completed`/`passed`면 비활성, 완료 처리된 작업은 "완료됨" 표시. 기존 "검수완료" 버튼은 제거됐고 웹에서 `complete` 액션을 호출하는 곳은 없다(API는 남아 있으며 동작은 아래 "PATCH `complete`" 참고).
  - 조정확인 컬럼: `row.request`가 있으면 상태 배지 버튼(`adjustmentLabels`: requested/approved/rejected/retry_requested)으로 `AdjustmentReviewModal` 오픈, 없으면 "요청없음" 배지
- **`PhotoApprovalModal`**(`app/(workspace)/work-inspection/PhotoApprovalModal.tsx`, 신규) — 작업 단위 사진 승인 팝업
  - 단계 탭(작업전(시작)/완료). 탭 전환·열릴 때마다 `GET /api/work-inspection/photo?work_id=&department_id=&shipper_id=&stage=&include_history=true`로 조회(`cancelled` 플래그로 경합 방지, 실패 시 "연결 오류" 배지 + "다시 시도")
  - 레이아웃: 헤더 + 작업 요약 카드(`WorkSummaryCard`: 문서번호·작업유형·완성품(코드·명)·작업수량·완성품 LOT·작업일/납기, 응답 `work`) + 단계 탭은 고정, 본문만 스크롤하고 하단 버튼 영역(작업승인/완료승인/작업 반려/선택 저장·비활성 사유)은 고정(sticky). 본문은 "제품 정보 / 사진" → "부자재 정보 / 사진" 섹션 순
  - 항목 카드(`PhotoItemCard`): 구분 배지·항목명·상태 배지 → **기대 정보 표**(제품: 제품코드·제품명·LOT·단위수량·필요수량·할당수량·비고 / 부자재: 부자재코드·명·LOT·단위·필요·할당수량·검수방식·비고, 응답 `expected`; 없으면 코드·명·LOT만) → 그 아래 **제출 사진**(크게, 클릭 시 해당 단계 전체 사진을 좌우(버튼·방향키)로 넘기는 라이트박스, Esc 닫기) + 부자재마스터 기준 이미지가 있으면 옆에 작게 "기준"(클릭 시 확대, 응답 `referenceImageUrl`) → 반려 사유(`reviewComment`)·"이전 제출 이력 n건"(펼치면 이전 사진·사유) → 승인/반려 토글
  - 항목별 승인/반려: 승인대기(`submitted`) 항목만 토글 가능, 반려는 사유 입력 필수(비면 저장·작업승인 불가). "선택 저장"은 선택분을 모아 `photo_review` 1회 호출
  - 하단: "작업승인"(start)/"완료승인"(complete) — `readiness.canApproveWork`가 true이고 저장하지 않은 선택이 없을 때만 활성, 비활성 사유(미제출/반려 대기/OCR·비전·완료제품사진 미완료/확인요청/승인대기 없음/미저장 선택)를 문구로 표시. "작업 반려"는 사유 입력(필수) 후 해당 단계 승인대기 전부 반려(`photo_reject_work`)
  - 모든 요청에 `departmentId`/`shipperId`(`useFilterStore`) 포함. 성공 시 모달은 데이터를 재조회하고 부모는 `loadRows()`로 목록을 갱신
  - 계약(`PATCH /api/work-inspection` action): `{ type: "photo_review", decisions: [{ inspectionId, decision: "approved"|"rejected", reason? }] }` / `{ type: "photo_approve_work", stage }` / `{ type: "photo_reject_work", stage, reason }`
- `AdjustmentReviewModal` — 작업 기본정보(`InfoItem` 4종) + 현장 확인 요청 사유 + 검수방식/판정상태/OCR·비전 결과/**검증값(기대값)**/요약 표(`row.inspections`) + 검수 이미지 미리보기(현재는 플레이스홀더 박스, `image?.storage_path` 텍스트만 표시) + 조정승인/재검수 요청/조정 미승인 버튼
  - (2026-10-18 OCR 일치율) "검증값(기대값)" 열은 "기준 텍스트"(OCR은 서버 해석값+출처 작업등록/마스터, 판정 스냅샷 우선)로, "일치율" 열(오른쪽 정렬)을 추가했고, 미처리 OCR 확인요청의 비교 블록(`components/inspection/OcrTextCompare.tsx`: 일치율·등록 텍스트·스캔 텍스트·정규화 차이 글자 강조)과 촬영 사진(서명 URL, 있을 때 플레이스홀더 대체)을 표시한다.
  - **검증값(기대값) 컬럼**: 검수 항목의 `material_id`로 연결된 부자재의 `material_masters.verification_value`(모바일 OCR 등록 검수값)를 참고용으로 보여준다. 값이 없으면 "-". 판정 로직에는 관여하지 않는 순수 표시용 컬럼이다.
  - 이 모달은 work 단위(기존 `row.request`, `requestByWork` 맵)로 동작하며, 위 확인요청 섹션(검수 항목 단위)과는 별개의 진입점이다. 둘 다 같은 PATCH `adjustment` 액션을 쓰지만 모달 쪽은 `inspectionId`를 넘기지 않아 기존처럼 work의 `admin_requested` 검수 항목 전체를 대상으로 처리한다.
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`

## 검수 행(`work_inspections`) 생성 출처
이 화면과 모바일이 읽는 `work_inspections` 행은 `lib/server/inspection-setup.ts`가 만든다. 생성·재판정 규칙의 기준은 아래 "사진검수 + 작업승인 코어 규칙" 절이다. `setupWorkInspections(supabase, workId, workMasterId, stage="start")`가 단계(stage)별로 멱등하게 부자재 행(마스터 `inspection_method`로 OCR/VISION/PHOTO 결정, `status: "pending"`, `attempt_count: 0`) + 제품 구성 행별 PHOTO 행을 만들고(완료검수는 완료제품사진 1행 추가), 해당 `work_id`·`stage`에 검수 행이 이미 있으면 다시 만들지 않는다. `reconcileInspectionPlan`은 이미 행이 있을 때 손대지 않은 행만 현재 마스터·제품 구성에 맞게 재판정한다. 작업마스터가 연결되지 않은 작업은 `skipped_no_master`, 생성할 행이 하나도 없으면(시작검수에서 부자재·제품 구성이 모두 없음) `skipped_no_materials`(`inspectionSetup`)이다.

생성·재판정 함수는 네 지점에서 호출된다(`setupWorkInspections`는 stage별 멱등이라 어느 순서로 호출돼도 결과는 동일):
1. **작업등록 시**(`app/api/work-register/route.ts` POST) — 작업 insert 성공 직후. 신규 작업은 이 시점에 바로 검수 행이 생긴다(제품 PHOTO 행이 `work_components`를 읽으므로 구성품 저장 이후 호출). `failed`면 작업등록 전체를 롤백한다.
2. **담당자 배정 시**(`app/api/work-register/[workId]/assign/route.ts` PATCH) — 배정 update 성공 직후. 1번에서 이미 생성됐다면 `skipped_existing`. `failed`면 배정을 되돌리고 502.
3. **모바일 검수 화면 진입 시 lazy 생성·재판정**(`app/api/work-inspection/setup/route.ts` POST, body `{ workId, stage? }`) — 내부에서 `setupWorkInspections` 대신 `reconcileInspectionPlan`을 호출한다(행이 없으면 생성, 있으면 마스터 체크·제품 구성 변경분 중 손대지 않은 행만 반영, 제출 이력 행 동결). 단 현재 모바일 화면(`app/mobile/pre/[workId]`·`complete/[workId]`)은 해당 stage 검수 행이 0건일 때만 이 API를 호출하므로, 이미 행이 있는 작업의 재판정은 모바일 진입으로 일어나지 않는다. work가 존재하지 않으면 `404`.
4. **작업 수정 시**(`app/api/work-register/[workId]/route.ts` PATCH) — 작업마스터가 바뀌면 pending 검수 행을 삭제한 뒤, 항상 `reconcileInspectionPlan`(stage=start)으로 제품 구성·부자재 방식 변경분을 반영한다. `failed`면 502.

상세는 `docs/menus/work-register.md`의 POST/PATCH 설명 참고.

## 데이터 흐름
- 페이지 로드/재조회(`loadRows`): `GET /api/work-inspection?department_id=&shipper_id=` 호출
  - 응답(`WorkInspectionDataResponse`)의 `rows`/`pendingReviewRequests`/`source`를 `tableRows`/`pendingReviewRequests`/`dataSource`로 반영
- 사진 승인/반려: `PATCH /api/work-inspection` (body: `{ departmentId, shipperId, workId, action: photo_review | photo_approve_work | photo_reject_work }`) — 위 `PhotoApprovalModal` 참고. (구 "검수완료" `complete` 호출은 웹에서 제거)
- 조정 처리(기존 `AdjustmentReviewModal`, work 단위): `PATCH /api/work-inspection` (body: `{ workId, action: { type: "adjustment", requestId, status } }`)
  - 성공 시 `loadRows()` 재호출
- **확인요청 섹션 처리(검수 항목 단위)**: 같은 `adjustment` 액션에 `inspectionId`를 추가로 실어 `PATCH /api/work-inspection` 호출(body: `{ workId, action: { type: "adjustment", requestId, status: "approved" | "retry_requested", inspectionId } }`)
  - 성공 시 `loadRows()` 재호출(섹션 목록과 표를 함께 갱신)

`app/api/work-inspection/route.ts`:
- GET mock 분기
  - `appRepository.listWorks`/`listWorkMasters`/`listAdminReviewRequests`/`listInspections`/`listInspectionImages` 조합
- GET Supabase 분기 처리 순서
  1. `resolveScopeIds`로 부서/화주 UUID 보정
  2. `fetchWorkMasterData`로 작업마스터 조회
  3. `.from("works")`를 department/shipper로 필터 조회
  4. `.from("work_inspections")`, `.from("inspection_images")`, `.from("admin_review_requests")`를 각각 `work_id in (...)`로 조회
  5. `getInspectionStep()`으로 표시용 검수단계 문자열 계산(취소 → 보류 → [사진 승인대기만 걸린 `admin_review_requested`면 "작업승인대기"/"완료승인대기"] → 조정승인 → 재검수 필요 → 재검수 요청 → 검수완료 → 검수대상/검수대기 → 확인요청 → 사진반려 → 불일치·재검수 → 검수완료(완료·합격 상태) → 검수진행 → 모바일 검수중 순으로 우선순위 판정). 사진 승인대기 요약은 GET 응답 행의 `photoReview`(단계별 `PhotoReviewSummaryDto`)로 내려준다.
- **검증값 연계**: `fetchWorkMasterData`가 조회한 `masterData.materials`(부서/화주 스코프의 `material_masters` 전체, `verification_value` 포함)로 `materialById` 맵을 만들고, `withVerificationValue()`가 각 `work_inspections` 행에 `materialVerificationValue`(해당 `material_id`의 `verification_value`, 없으면 `undefined`)를 붙여 `InspectionWithVerificationDto`로 확장한다. mock 모드도 동일하게 `appRepository.listMaterials({})`로 맵을 만들어 같은 필드를 붙인다. `lib/types/work-inspection-api.ts`의 `InspectionTableRowDto.inspections`는 이제 `InspectionWithVerificationDto[]` 타입이다.
- **확인요청 목록 연계**: `buildPendingReviewRequests()`가 `admin_review_requests`(`status === "requested"`인 실제 행만) 각각을 `inspection_id`로 `work_inspections`, `material_id`로 `material_masters`, `work_id`로 `works`와 조인해 `PendingReviewRequestDto`(`requestId`/`workId`/`documentNo`/`materialName`/`method`/`inspectionId`/`reason`/`requestedAt`)로 변환한다. `requestedAt`은 `admin_review_requests.created_at`(DB 컬럼은 존재하지만 `lib/types/domain.ts`의 `AdminReviewRequest`에는 선택 필드로만 있었고 이번에 `created_at?: string`으로 추가했다). 기존 `row.request`(work당 1건, `AdjustmentReviewModal`용)와 달리 이 목록은 work당 여러 건이 동시에 잡힐 수 있다(항목별 확인요청이므로). GET 응답 상단(work.status가 `admin_review_requested`인데 실제 요청 행이 없는) "virtual-" 가상 요청은 이 목록에 포함되지 않는다(기존 `AdjustmentReviewModal`에서만 계속 노출). 가상 요청은 확인요청 항목(`admin_requested`)이 있거나 사진 승인대기(`submitted`)가 없을 때만 만들며, 사진 승인대기만으로 `admin_review_requested`가 된 작업은 확인요청 상세가 없는 것이 정상이라 만들지 않는다.
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작). 화면은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전 목록 유지).
- PATCH `complete`(웹 UI에서는 호출하지 않는 API 유지분)
  - 현재 `works.status`를 먼저 조회해 `canceled`/`on_hold`/`completed`/`passed`면 `409`, 작업이 없으면 `404`
  - 완료검수 항목이 없거나 하나라도 합격(승인 포함)이 아니면 `409`(메시지에 전체/합격/승인대기/불합격·반려/확인요청/미진행 건수 포함 — `loadInspectionSnapshot`·`isStageDone`)
  - 상태를 강제로 바꾸지 않고 `maybeAdvanceWorkStatus()`에 맡긴다. 판정 오류(`null`)는 `502`, 결과가 `completed`가 아니면(시작검수 미완료) `409`. 성공 응답에 `workStatus`가 포함된다.
- PATCH `adjustment` 처리 순서 — body에 `inspectionId`(선택)가 추가됐다: `{ workId, action: { type: "adjustment", requestId, status, inspectionId? } }`
  1. `.from("admin_review_requests")`를 `status`/`processed_at`/`admin_comment`로 update
     - `requestId`가 `"virtual-"`로 시작하면 이 update는 건너뜀(DB에 실제 요청 행이 없는 가상 요청이므로)
  2. `.from("work_inspections")`에서 `work_id` + `status = "admin_requested"` 조건으로 `admin_approved`/`retrying`/`failed`로 update — `inspectionId`가 있으면 `.eq("id", inspectionId)`를 추가로 걸어 **해당 검수 항목 1건만** 처리한다(확인요청 섹션 용도). 없으면 기존처럼 work의 `admin_requested` 검수 항목 전체가 대상이다(`AdjustmentReviewModal` 기존 동작 유지).
  3. 같은 work에 아직 처리되지 않은 `admin_requested` 검수 항목이 남아있는지 `count`로 다시 확인한다. **남아있으면 상태 판정을 건너뛴다**(work 상태는 `admin_review_requested` 유지). 남은 항목이 없으면 `approved`/`retry_requested`/`rejected` 모두 `maybeAdvanceWorkStatus(supabase, workId)`(`lib/server/work-auto-status.ts`)로 최신 검수 집계를 다시 판정해 반영한다(시작검수 미완료면 `registered`, 완료검수 단계면 `in_progress`, 불합격·반려 항목이 남으면 `inspection_failed`, 사진 승인대기가 남으면 승인대기 유지, 전부 합격이면 `completed`). 예전의 승인 시 무조건 `in_progress` 강제, `registered` 강제복귀, 재검수·미승인 시 `works`의 `inspection_failed` 직접 update는 모두 제거됐다. 판정 오류(`null`)는 `502`("조정은 저장되었으나…")이고, 응답에는 판정된 `workStatus`가 포함된다(남은 확인요청이 있어 판정을 건너뛰면 생략).
- PATCH `adjustment`/`request_review` 공통 가드: body `inspectionId`가 가리키는 항목이 `PHOTO`(사진검수)면 `409`(사진검수 항목은 확인요청 체계와 분리되며 승인/반려는 `photo_*` 액션으로만 처리 — `checkNotPhotoInspection`). `inspectionId` 없이 호출하는 `adjustment`는 이 가드를 거치지 않지만 대상이 `admin_requested` 항목뿐이라 PHOTO 항목에는 영향이 없다.
- PATCH `request_review`(모바일 검수 진행 중 특이사항 확인요청. 실패 후 "검수 취소"도 이 액션의 한 형태다) — body: `{ workId, action: { type: "request_review", inspectionId, reason?, label? } }`. 호출 주체는 모바일 검수 화면(`/mobile/pre`·`/mobile/complete`)의 `OcrInspectionCard`("확인요청"/"검수 취소" 버튼, 기준 사진 미등록이면 "관리자 확인요청 (기준 미등록)" 버튼 — `label: "기준 미등록 확인요청"`)이며, 관리자 웹 화면에는 이 액션을 직접 호출하는 UI가 없다(생성된 요청은 확인요청 섹션 또는 기존 `AdjustmentReviewModal`의 승인/재검수/거부 흐름으로 처리된다).
  1. 저장되는 사유의 접두 라벨은 `label`(선택, 기본값 `"현장 검수 취소 요청"`)이다. `reason`이 있으면 `"{label} - {reason}"`, 없으면 `label` 그대로를 최종 사유로 만든다. 모바일의 일반 "확인요청" 버튼은 `label: "현장 확인요청"`을, 실패 상태의 "검수 취소" 버튼은 `label`을 생략해(기본값) 기존과 동일한 문구를 유지한다.
  2. 멱등 처리: `.from("admin_review_requests")`에서 `inspection_id` + `status = "requested"` 조건으로 기존 미처리 요청을 조회하고, 있으면 재사용(중복 insert 안 함)하고 없으면 `work_id`/`inspection_id`/`reason`/`status: "requested"`로 새로 insert한다(`requester_id`는 uuid 컬럼이라 모바일에서 특정 사용자를 알 수 없는 경우 비워둔다 = `NULL`).
  3. `.from("work_inspections")`를 `status: "admin_requested"`/`result_summary`(=사유)/`updated_at`으로 update한다.
  4. `.from("works")`를 `status: "admin_review_requested"`/`latest_inspected_at`으로 update한다.
  5. 응답: `{ source: "supabase", workId, requestId }`. `inspectionId` 누락 시 `400`.

**OCR/비전 검수 패널과 검수 영역(region) 편집 로직**: `components/inspection/OcrInspectionPanel.tsx`, `components/inspection/VisionInspectionPanel.tsx`, `components/inspection/InspectionRegionEditor.tsx`, `components/admin/AdminReviewPanel.tsx`가 저장소에 존재하지만, 실제 코드 검색(`grep -rn` 전체 리포지토리) 결과 이 4개 컴포넌트는 `app/(workspace)/work-inspection/page.tsx`를 포함해 **`app/` 전체 어디에서도 import되지 않는 미사용(고아) 컴포넌트**다. `InspectionRegionEditor`만 `app/(workspace)/material-master/page.tsx`(자재마스터 화면, region 등록용)에서 `mode="OCR"`/`mode="VISION"`으로 사용된다. 즉 작업검수 화면 자체는 이 패널들 대신 표 + `AdjustmentReviewModal`(검수방식/판정상태/OCR결과·비전유사도/요약을 텍스트 표로만 표시)로 검수 결과를 노출한다.

OCR 실제 호출 로직은 `lib/server/ocr.ts`의 `runOcr()`에 있다(Google Cloud Vision `TEXT_DETECTION` 호출, 서비스 계정 JWT 발급, ROI 단어 필터링 `getRoiText()` 등). `app/api/ocr/route.ts`(POST, `runtime = "nodejs"`)와 아래 "OCR 검수 제출 API"(`app/api/work-inspection/ocr/route.ts`) 두 라우트가 이 함수를 공유한다. `process.env.OCR_PROVIDER === "google-vision"`이고 `GOOGLE_CLOUD_PROJECT_ID`/`GOOGLE_CLOUD_CLIENT_EMAIL`/`GOOGLE_CLOUD_PRIVATE_KEY`가 모두 있어야 실제 호출하며, 하나라도 없으면 `canVerify: false`인 mock 결과를 반환한다.
- `/api/ocr`는 material-master의 검수 영역(ROI) 등록/검증 흐름(`/mobile/material-photo`)에서 호출된다. `image`(File)/`expectedText`/`roi`/`originalRoi`/`isCropped`/`imageWidth`/`imageHeight`를 FormData로 받아 `runOcr()` 결과에 자체 `isMatched()`(부분 포함 비교)로 계산한 `matched`를 더해 응답한다.
- `/api/work-inspection/ocr`는 아래 "OCR 검수 제출 API"에서 설명하는 모바일 작업검수 전용 라우트다.

### OCR 검수 제출 API (`app/api/work-inspection/ocr/route.ts`)
- `POST`, multipart FormData: `inspectionId`, `workId`, `image`(ROI로 크롭된 촬영본), `roi`(JSON 문자열). 호출 주체는 모바일 홈(`/mobile`)의 `OcrInspectionCard`(`components/mobile/OcrInspectionCard.tsx`)이며, 관리자 웹 `work-inspection` 화면 자체는 이 라우트를 호출하지 않는다(결과를 표로 조회만 한다).
- 처리 순서(mock 모드가 아닐 때):
  1. `work_inspections`에서 `id`(=inspectionId) + `work_id`(=workId)로 검수 대상을 조회한다. 없으면 `404`.
  2. 기준 텍스트를 `lib/server/ocr-expected-text.ts` `resolveOcrExpectedText()`로 해석한다: 작업의 `work_components.ocr_expected_text`(work_id + 부자재 + 부자재코드 매칭) → 없으면 `material_masters.verification_value`(기존 작업 하위호환) → 둘 다 없으면 `409`("작업등록에서 OCR 검수 텍스트를 지정하거나…", 카드는 관리자 확인요청 안내). 응답 `expectedValue`/`expectedSource`(work|master|none)로 내려준다.
  3. `lib/server/ocr.ts`의 `runOcr()`을 `isCropped: true`로 호출한다(클라이언트가 이미 ROI로 크롭해서 보내므로 서버에서는 전체 크롭본을 그대로 읽는다).
  4. `canVerify`가 `false`(OCR 환경변수 미설정 등)이면 **DB를 전혀 변경하지 않고** 현재 `status`를 그대로 반환한다(`{ status: 기존값, recognizedText: "", expectedValue, expectedSource, threshold, matched: false, canVerify: false, saved: false, evidenceSaved: false }`).
  5. `canVerify`가 `true`이면 `lib/inspection/ocr-match.ts`의 `matchOcrText()`로 **공백 무시 일치율**을 계산한다: NFKC → 하이픈 변형(U+2010~2015·2212 등) `-` 통일 → 대문자 → 공백·줄바꿈 전부 제거 → Levenshtein 유사도(%) 소수 1자리 **내림**. 합격 기준은 서버 env `OCR_MATCH_PASS_THRESHOLD`(50~100, 기본 90). **숫자 일치 조건은 두지 않는다**(대표님 결정 — 12자 LOT의 끝자리 1개 차이는 91.6%라 자동 합격될 수 있음에 유의). 일치율 ≥ 기준이면 `matched: true`.
  6. **기준 미만(`judgement: "below_threshold"`)** — 사진(스토리지+`inspection_images` `ocr_capture`, metadata에 `matchRate`/`threshold`/`judgement`/`expectedSource`)·`ocr_result_text`·`ocr_expected_text`(판정 당시 기준 스냅샷)·`ocr_match_rate`를 저장하고 `attempt_count`를 +1 한다. **`status`는 바꾸지 않고**(합격 처리 안 함) `maybeAdvanceWorkStatus`도 호출하지 않는다. 이전 사진은 prune(최근 1장 유지). 응답 `saved: false, evidenceSaved: true`. 현장은 [재촬영] 또는 [관리자 확인요청](`request_review`) 중 선택한다. `attempt_count`>0이면 작업 수정이 잠긴다(work-register PATCH 409).
  7. **합격(일치율 ≥ 기준)**: 위와 같은 저장에 `status: "passed"`, `result_summary`=`OCR 일치 92.3% (기준 90%, 작업등록 텍스트|부자재마스터 검증값)`를 반영하고 `maybeAdvanceWorkStatus`를 호출한다. 응답 `saved: true, evidenceSaved: false`. 응답에는 항상 `matchRate`/`threshold`/`judgement`가 포함된다.
  8. 업로드 후 `work_inspections`/`inspection_images` 저장이 실패하면 `material-master/registration` 라우트와 동일한 보상 패턴으로 업로드된 파일을 스토리지에서 제거한 뒤 원래 에러를 반환한다.
- **저장 가드(`lib/server/inspection-guard.ts`)**: OCR 판정 전에 ①검수 항목 `method`가 `OCR`이 아니면 `409` ②항목 상태가 `admin_requested`(확인요청 처리 대기)면 `409`, 이미 `passed`/`admin_approved`여도 `409`(합격 덮어쓰기·`attempt_count` 중복 증가 방지) ③작업상태가 `on_hold`/`canceled`/`completed`/`passed`면 `409`. 제품검수(`/product`)는 OCR 항목을 거부(VISION/PRODUCT만 허용)하고 같은 상태 가드를 적용하며, 완료/비전 사진(`/completion-photo`)은 OCR·PHOTO 항목을 거부(409)하고 합격 후 사진 추가(완료제품 사진)는 허용하되 확인요청 대기·작업상태 가드는 동일하다(DELETE 포함). 비전 사진 저장 결과 문구는 stage에 따라 "시작검수 사진 저장(비전)"/"완료검수 사진 저장(비전)"으로 나뉜다.
- **저장 순서**: 스토리지 업로드 → `inspection_images` insert → `work_inspections` 합격 update 순서다. 이미지 insert가 실패하면 합격 상태가 반영되지 않고, 상태 update가 실패하면 방금 넣은 이미지 행을 삭제하며 스토리지 파일도 정리한다(OCR·제품검수 공통).
- 응답: `{ status, recognizedText, expectedValue, matched, canVerify, saved }` (+ `source: "supabase" | "mock"`). `saved`는 합격해서 실제로 서버에 저장됐는지 여부다(불합격/`canVerify: false`는 항상 `false`).
- mock 모드(`NEXT_PUBLIC_USE_MOCK_DATA !== "false"` 또는 Supabase 미설정)에서는 DB를 건드리지 않고 `appRepository`의 mock 검수/부자재 데이터로 그럴듯한 성공 응답(`source: "mock"`, `saved: canVerify`)만 반환한다.
- 필수값(`inspectionId`/`workId`/`image`/`roi`) 누락 시 `400`을 반환한다.
- **정책**: 불합격 판정 결과(사진 포함)는 서버에 저장되지 않는다(재검수 전제). 합격한 검수 데이터·사진만 서버에 보존된다.

### 제품검수 제출 API (`app/api/work-inspection/product/route.ts`, 작업검수 8단계 스펙 ②) — 현재 모바일 UI 미사용
**이 절 전체는 코드가 남아있지만 더 이상 어떤 화면에서도 호출되지 않는 orphan API다.** 부자재 비전 항목은 아래 "완료검수" 절에서 설명하는 `CompletionPhotoCard`(체크리스트 없이 비전 참고 사진 표시 + 촬영·압축·저장, `POST /api/work-inspection/completion-photo` 호출)로 대체됐다(제품코드/명/LOT 확인은 이제 부자재 단위가 아니라 작업 단위 "제품목록" 체크리스트가 담당). `ProductCheckCard`(구 컴포넌트)는 삭제했다. 라우트 자체는 외부 계약(작업검수 8단계 스펙)일 가능성이 있어 보존만 해뒀다.
- `POST`, multipart FormData: `inspectionId`, `workId`, `checks`(JSON 문자열, `{ productCode, productName, lot }` 3개 모두 `true`여야 함), `image`(촬영 사진). 호출 주체는 모바일 홈(`/mobile`)의 `method`가 `OCR`이 아닌(비전 등) 제품검수 카드다.
- 처리 순서(mock 모드가 아닐 때):
  1. `checks`의 3개 항목이 모두 `true`가 아니면 `400`.
  2. `work_inspections`에서 `id`(=inspectionId) + `work_id`(=workId)로 검수 대상을 조회한다. 없으면 `404`.
  3. 스토리지 버킷 `inspection-images`(OCR 검수 제출 API와 동일한 ensure 패턴으로 없으면 자동 생성)에 `{workId}/{inspectionId}/{timestamp}-product.jpg` 경로로 촬영 사진을 업로드한다.
  4. `work_inspections`를 `status: "passed"`/`result_summary: "제품검수 수동 합격 (코드/명/LOT 확인)"`/`attempt_count`(+1)/`updated_at`으로 update한 뒤 `inspection_images`에 `image_type: "product"` 행을 insert한다(`metadata.checks`에 체크 결과 저장). insert 직후 `pruneStaleInspectionImages()`를 호출해 같은 검수 항목의 이전 사진을 정리한다(OCR 검수 제출 API와 동일, "검증 통과 사진 1장만 유지" 정책).
  5. 업로드 후 DB 저장이 실패하면 OCR 검수 제출 API와 동일한 보상 패턴으로 업로드된 파일을 스토리지에서 제거한 뒤 원래 에러를 반환한다.
- 응답: `{ source: "supabase" | "mock", status: "passed", resultSummary }`.
- mock 모드에서는 DB를 건드리지 않고 동일한 형태의 성공 응답만 반환한다.
- 필수값(`inspectionId`/`workId`/`checks`/`image`) 누락 또는 `checks` 미충족 시 `400`을 반환한다.

### 검수 대상 lazy 생성·재판정 API (`app/api/work-inspection/setup/route.ts`)
- `POST`, JSON body: `{ departmentId, shipperId, workId, stage? }`. 호출 주체는 모바일 작업전 검수(`app/mobile/pre/[workId]/page.tsx`, `stage` 생략 = 시작검수)와 완료검수(`app/mobile/complete/[workId]/page.tsx`, `stage: "complete"`)이며, 두 화면 모두 현재는 해당 stage의 검수 행이 0건일 때만 호출한다(홈 `/mobile`은 호출하지 않는다).
- 처리 순서(mock 모드가 아닐 때): 스코프 확인 + `works` 존재 확인(없으면 `404`) → `stage === "complete"`이면 시작검수 완료 사전 판정(아래 "서버 방어"; PHOTO 항목은 관리자 작업승인 후에야 `admin_approved`가 되므로 승인 전에는 완료검수를 준비할 수 없다) → `work_master_id`로 `reconcileInspectionPlan(supabase, workId, workMasterId, stage)` 호출(`setupWorkInspections` 대신 사용 — 제출 이력 행 동결).
- 응답: `{ source: "supabase", workId, inspectionSetup }`(`created`/`skipped_existing`/`skipped_no_master`/`skipped_no_materials`/`failed`). mock 모드는 DB를 건드리지 않고 `{ source: "mock", workId, inspectionSetup: "skipped_existing" }`을 반환한다.
- `workId`·스코프 누락 `400`, 소속 불일치 `403`, DB 오류 `502`.

## 완료검수(작업완료 시 검수, 신규)
"작업시작할 때 검수"(위 전체 내용, 이하 시작검수)와 별개로 시작검수가 끝났지만 작업상태가 아직 완료가 아닌 작업을 대상으로 모바일에서 수행하는 완료검수를 같은 테이블/로직 위에 얹어 구현했다. 신규 테이블 없이 `work_inspections.stage`(`'start' | 'complete'`, 신규 컬럼)로 두 흐름을 구분한다. **완료검수 화면 구성은 완료제품 사진등록(1~3장)이 추가된다는 점만 빼면 작업전 검수와 완전히 동일하다**(상단 제품내역 + 하단 부자재 검수, `ProductChecklist`/`MaterialInspectionList`/`OcrInspectionCard`/`CompletionPhotoCard`를 그대로 공유).

- **완료제품 사진등록**(필수, 작업전 검수에는 없는 유일한 추가 항목): `work_inspections` 행 1건을 `material_id: null`, `method: "PRODUCT"`, `stage: "complete"`로 만들어 표현하고, 그 한 행에 사진을 **최소 1장 ~ 최대 3장** 연결한다(`inspection_images` 다중 행). 제품코드/명/LOT 체크리스트는 없다. 전용 컴포넌트 `components/mobile/CompletionProductPhotoCard.tsx`가 3열 썸네일 그리드 + 촬영 타일 + 개별 삭제 버튼을 렌더링한다.
  - `POST /api/work-inspection/completion-photo` (FormData: `inspectionId`/`workId`/`image`) — 버킷 `inspection-images`, 경로 `{workId}/{inspectionId}/{timestamp}-completion.jpg`, 클라이언트에서 `browser-image-compression`으로 압축(0.8MB / 1600px / 품질 0.82)해 전송. **`method === "PRODUCT"`이면 저장 전에 기존 사진 수를 확인해 3장 이상이면 `409`로 거부하고, 통과하면 `pruneStaleInspectionImages()`를 호출하지 않고 누적 저장한다.** 그 외(부자재 비전)는 기존대로 prune해 최신 1장만 유지한다. `inspection_images.image_type: "completion_photo"`. 응답에 `photos`(`{ id, url }[]`, PRODUCT일 때만) 포함.
  - `GET /api/work-inspection/completion-photo?inspection_id=&work_id=` — 저장된 사진 목록(서명 URL 1시간)을 반환. 완료검수 화면 진입 시 호출한다.
  - `DELETE /api/work-inspection/completion-photo` (JSON: `inspectionId`/`workId`/`imageId`) — 사진 1장을 스토리지+DB에서 제거한 뒤 남은 장수로 검수 상태를 재판정한다(`syncInspectionStatusByPhotoCount`: 1장 이상이면 `passed`, 0장이면 `pending`). 이후 `maybeAdvanceWorkStatus()`를 다시 호출한다(단, 이미 `completed`가 된 작업의 상태는 되돌리지 않는다).
  - 부자재 비전 항목은 계속 `components/mobile/CompletionPhotoCard.tsx`가 담당한다(`materialId` prop이 있으면 `GET /api/material-master/registration?material_id=`로 비전 참고 사진을 먼저 표시). `eyebrow` prop으로 카드 상단 라벨을 호출부가 지정하므로 작업전 검수 화면에 "완료검수"가 잘못 표시되지 않는다.
- **부자재 목록 번호 공유(반복 표시 방지)**: 같은 부자재가 OCR+비전을 모두 요구하면 `work_inspections` 행이 2개(검수 방식별)라 목록에 2번 나타난다. 모바일 화면은 부자재 단위로 번호를 미리 계산해(`MaterialInspectionList`의 `indexById`) OCR·비전 카드에 **같은 번호**를 부여한다("부자재 2 · OCR 검수" / "부자재 2 · 비전 검수"처럼 표시). 카드 자체는 여전히 2장이지만 같은 부자재의 서로 다른 검수 방식임이 분명해진다.
- **부자재 OCR 완료검수**: 시작검수와 **완전히 동일한** `components/mobile/OcrInspectionCard.tsx`와 `POST /api/work-inspection/ocr`를 그대로 재사용한다(해당 항목의 `id`가 `stage: "complete"` 행을 가리키므로 별도 서버 분기 불필요).
- **부자재 비전 완료검수**: 시작검수와 **완전히 동일한** `components/mobile/CompletionPhotoCard.tsx`(`materialId` prop 전달, 체크리스트 없이 비전 참고 사진 표시 + 촬영·압축·저장, `POST /api/work-inspection/completion-photo`)를 그대로 재사용한다(`inspectionId` 단위로 동작해 stage를 구분할 필요가 없다). 제품코드/명/LOT 확인은 부자재 단위가 아니라 아래 "제품목록"이 담당한다.
- **제품내역(화면 상단 고정)**: `components/mobile/ProductChecklist.tsx`가 `GET /api/work-status/detail?work_id=`의 `products`(**제품코드 / 제품명 / LOT / 단위수량 / 사용수량**)를 조회해 검수여부 체크박스 목록으로 보여준다. 작업전 검수/완료검수 화면 모두 이 컴포넌트를 화면 최상단에 공유한다. 체크 상태는 화면 로컬 상태일 뿐 서버에 저장되지 않는다(제품 단위 검수 개념이 없어 확인용 UI로만 존재, `work_inspections`에 영향 없음).
- **부자재 검수 목록(화면 하단 고정)**: `components/mobile/MaterialInspectionList.tsx`가 부자재 행(`target_type='material'`, 사진검수 `PHOTO` 포함)을 렌더링한다(OCR→`OcrInspectionCard`, PHOTO→`PhotoReviewCard`, 그 외 비전→`CompletionPhotoCard`). **부자재 마스터 검수방식으로 현재 계획된 방식만 표시한다** — `lib/mobile/inspection-visibility.ts`의 `getVisibleMaterialInspections`가 `planMaterialMethods(material_masters.inspection_method)`(BOTH=OCR+VISION, OCR, VISION, NONE·이상값=PHOTO)에 포함되는 방식의 행만 남기며, 마스터를 찾지 못한 항목은 검수 누락을 막기 위해 숨기지 않는다. 제품 PHOTO 행은 `getProductPhotoInspections`로 따로 추출해 상단 `ProductChecklist`에 붙고 항상 표시된다. 화면의 완료 판정(`getActiveInspections` = 보이는 부자재 + 제품 PHOTO + 완료제품사진)도 이 필터를 통과한 항목만 대상으로 하므로, 마스터 체크가 바뀐 뒤 남아있는 과거 검수 행 때문에 완료가 영원히 막히지 않는다.
- **검수 대상 생성**: `setupWorkInspections(supabase, workId, workMasterId, "complete")`가 부자재별 행(OCR/VISION/PHOTO) + 제품 구성 행별 PHOTO 행 + 완료제품사진 1행을 함께 만든다(부자재·제품 구성이 없어도 완료제품사진 행은 항상 생성). 시작검수(`stage` 인자 생략, 기본값 `"start"`)는 완료제품사진 행을 만들지 않는다. 멱등 체크(기존 행 존재 확인)와 유니크 인덱스(`work_id, material_id, method, stage` + 제품 PHOTO·완료제품사진 부분 인덱스) 모두 `stage`를 포함해, 시작검수 setup 호출이 완료검수 행을 "이미 있음"으로 오판(또는 그 반대)하지 않는다.
- **서버 방어(중요)**: `POST /api/work-inspection/setup`은 `stage: "complete"` 요청 시 재판정 전에 시작검수 완료 여부(`loadInspectionSnapshot`의 `startStatuses` → `getInspectionAggregateStatus === "completed"`, 마스터 가시성 규칙 적용)를 확인해 아니면 `409`(한국어 에러 메시지)로 거부한다(행이 없거나 미통과 포함). 클라이언트 가드(`/mobile/complete/[workId]`의 `canEnterCompletion`, 아래 "검수 화면 진입 조건" 참고)를 우회해 URL을 직접 열어도 서버에서 재검증되므로 시작검수 없이 완료검수 행이 만들어질 수 없다.
- **확인요청 중 작업현황 표시**: 확인요청이 걸리면 `works.status`는 `admin_review_requested` 하나지만, 작업현황 화면은 확인요청이 걸린 검수 행의 `stage`를 보고 **"검수확인중"(작업전 검수) / "완료확인중"(완료검수)**으로 나눠 표시한다(상세는 `docs/menus/work-status.md`의 "확인요청 단계 표시" 참고). 처리 후에는 `maybeAdvanceWorkStatus`가 검수 집계로 상태를 다시 판정한다(전이 조건을 못 채우면 단계에 따라 대기/진행, 불합격·반려가 있으면 불합격, 사진 승인대기가 남으면 승인대기 — 강제로 대기로 되돌리지 않는다). 사진 승인대기 기인 라벨은 `reviewKind`로 구분한다.
- **확인요청/관리자승인 재사용**: 완료검수 항목도 시작검수와 동일하게 `PATCH /api/work-inspection`(`request_review`/`adjustment`)을 그대로 쓴다 — 두 액션 모두 `inspectionId` 단위로 동작해 stage를 구분할 필요가 없다. 확인요청 섹션(`pendingReviewRequests`)은 **stage 무관하게 시작·완료검수 확인요청을 한 곳에서 함께 승인 처리**한다(관리자 웹 화면에 별도 완료검수 탭을 만들지 않고 기존 섹션을 재사용). 완료제품사진(`material_id` 없음, `method: "PRODUCT"`) 항목은 부자재명 대신 "완료제품사진" 고정 라벨로 표시된다(`buildPendingReviewRequests`).
- **완료 처리(자동)**: 완료검수 마지막 항목이 `passed`/`admin_approved`가 되는 시점에 그 저장/승인 API(자동 합격 저장 API, 관리자 확인요청 승인, 사진 완료승인 `photo_approve_work`)가 `maybeAdvanceWorkStatus()`를 호출해 작업상태를 "완료"로 자동 전이한다(`completed_at` 함께 기록, `docs/menus/work-status.md`의 "자동 상태 전이" 참고). 모바일 완료검수 화면의 "완료 확인하고 나가기" 버튼은 더 이상 직접 상태를 바꾸지 않고(수동 `completed` PATCH는 서버가 거부한다) 목록을 다시 불러온 뒤 안내만 하고 `/mobile/status`로 이동한다.
- **GET 조회(`app/api/work-inspection/route.ts`)**: `stage` 쿼리 파라미터로 표/모바일 카드용 `rows`의 기준을 고른다. 생략 시 기본값 `"start"`(웹 작업검수 화면, `useMobileInspectionRows()`), `stage=complete`면 완료검수만(`useMobileCompletionInspectionRows()`, 신규). `work_inspections`는 한 번만 조회한 뒤 서버에서 stage로 나눠 `rows`(요청한 stage만)와 `pendingReviewRequests`(항상 두 stage 전체, 위 참고)를 각각 만든다. `inspection_images`도 `rows`에 포함되는 stage의 검수 항목에 연결된 사진만 `images` 필드에 담는다.

### 검수 화면 진입 조건(문서번호 스캔 시 자동 분기)
모바일 홈(`/mobile`, `app/mobile/page.tsx`)은 문서번호 스캔 전용 화면이며, 매칭된 작업의 **`work.status` 하나만 보고** 곧바로 라우팅한다(버튼을 한 번 더 누르는 단계 없음).

| `work.status` | 작업현황 표시 | 이동 |
|---|---|---|
| `registered` | 대기 | `/mobile/pre/{workId}` — 작업전 검수 |
| `in_progress` | 진행 | `/mobile/complete/{workId}` — 완료검수 |
| `inspection_failed` | 불합격(반려·재검수 필요) | 시작검수 집계(가시성 규칙 적용)가 `completed`가 아니면 `/mobile/pre/{workId}`, 맞으면 `/mobile/complete/{workId}` — 반려·불합격 항목 재촬영/재검수 |
| `admin_review_requested` + 확인요청(`admin_requested`) 항목 없음 | 작업승인대기/완료승인대기(사진 승인대기) | 같은 시작검수 집계 규칙으로 pre 또는 complete에 **읽기 전용**(`locked`, 촬영 잠금)으로 진입 |
| `admin_review_requested` + 확인요청 항목 있음 | 검수확인중/완료확인중 | 이동 없음, 안내 문구만 표시 |
| 그 외(`on_hold`/`canceled`/`completed`/`passed`) | 보류·취소·완료 | 이동 없음, 스캔 화면에 안내 문구만 표시 |

각 검수 화면도 URL 직접 진입을 방어한다.
- `/mobile/pre/[workId]`: `canceled`/`on_hold`/`completed`/`passed` 작업은 안내만 표시하고 검수 UI와 lazy setup 호출을 막는다. `inspection_failed`(재촬영)와 `admin_review_requested`(읽기 전용 `locked`)는 진입을 허용한다.
- `/mobile/complete/[workId]`: `work.status === "in_progress"`이거나, `inspection_failed`·`admin_review_requested`이면서 완료검수 행이 이미 있을 때만 진입한다(`canEnterCompletion`). 그 외엔 안내만 표시한다(`registered`이면 "작업전 검수로 이동" 버튼 제공).
- 서버도 동일 조건을 재검증한다(위 "서버 방어" 참고) — 시작검수가 끝나지 않은 작업의 `stage: "complete"` setup 요청은 `409`로 거부된다. 새 상태 모델에서 `in_progress`는 시작검수 완료 시 시스템이 자동으로만 설정하므로 두 조건은 사실상 같은 의미다.

### 정책: 시작검수 전용 조회들
아래는 완료검수 도입 이후에도 **시작검수(`stage="start"`)만** 집계·표시하도록 필터를 추가했다(기존 동작 100% 보존, "검수 집계 상태"는 시작검수 전용 개념이므로).
- `app/api/work-status/route.ts` GET의 "검수" 배지/작업시작 컬럼(`inspectionStatus`/`workStartedAt`)
- `app/api/work-status/detail/route.ts` GET의 상세 팝업 "부자재 내역" 표 검수상태·검수사진
- `app/api/work-register/route.ts` GET의 "검수완료 작업 제외" 판정

완료검수 결과(사진 포함)는 상세 팝업의 별도 "작업완료사진" 구역(`completionPhotos`)에서 노출한다. 상세는 `docs/menus/work-status.md`의 `WorkDetailModal`/`completionPhotos` 설명 참고.

## 상태·필터
- `useFilterStore`(zustand)에서 `departmentId`/`shipperId`를 읽어 `FilterScope`로 사용
  - 값이 바뀌면 `loadRows`가 재실행
- 이 화면 자체에는 별도 클라이언트 필터 UI가 없다(검색/기간 필터 없음)
- 작업 상태(`WorkStatus`) 전이
  - 모든 전이는 서버 `judgeNextStatus`(순수 함수, `maybeAdvanceWorkStatus`가 호출)가 검수 집계로 판정한다(아래 "사진검수 + 작업승인 코어 규칙"). 작업승인(`photo_approve_work`, start) → `in_progress` / 완료승인(complete) → `completed`, 작업 반려·항목 처리 후 승인대기 0 + 불합격·반려 ≥1 → `inspection_failed`
  - 확인요청 조정(`adjustment`): 남은 `admin_requested` 항목이 0건일 때 승인/재검수 요청/미승인 모두 `maybeAdvanceWorkStatus`로 재판정한다(승인 시 `in_progress` 강제·`registered` 강제복귀·재검수/미승인 시 `inspection_failed` 직접 update는 없음).
  - 재검수 요청(`retrying`)·미승인(`failed`) 항목이 남으면 판정 결과가 `inspection_failed`가 된다. 모바일은 이 상태의 작업을 스캔해 시작검수가 끝나지 않았으면 작업전 검수, 끝났으면 완료검수 화면으로 재진입시키고, 재검수 합격 후 `maybeAdvanceWorkStatus`가 상태를 다시 전이시킨다.

## 주요 타입
- `lib/types/work-inspection-api.ts`
  - `AdjustmentStatusDto`: requested/approved/rejected/retry_requested
  - `InspectionWithVerificationDto`: `WorkInspection & { materialVerificationValue?: string }` — `material_masters.verification_value`를 검수 항목에 참고용으로 붙인 확장 타입
  - `InspectionTableRowDto`: work + registeredAt/workType/finishedProductCode·Name/quantity/inspectionStep/request?/inspections(`InspectionWithVerificationDto[]`)/images/adjustmentStatus?/inspectionCompleted
  - `PendingReviewRequestDto`: 확인요청 섹션 1행 — `requestId`/`workId`/`documentNo`/`materialName`/`method`/`inspectionId`/`reason`/`requestedAt?`
  - `WorkInspectionDataResponse`: GET 응답. `rows`에 더해 `pendingReviewRequests: PendingReviewRequestDto[]`를 포함한다.
  - `WorkInspectionAction`: complete | adjustment(`requestId`/`status`/`inspectionId?` — `inspectionId`가 있으면 검수 항목 1건만 처리) | request_review(모바일 검수 진행 중 확인요청. 실패 후 검수 취소도 포함. `inspectionId`/`reason?`/`label?`) | photo_review(`decisions[]`) | photo_approve_work(`stage`) | photo_reject_work(`stage`, `reason`)
  - `WorkInspectionActionResponse`: PATCH 응답(사진 승인/반려·`complete`·`adjustment` 후 판정된 `workStatus?` 포함)
  - 사진검수 API 계약: `PhotoReviewItemDto`/`PhotoReviewReadinessDto`/`PhotoReviewResponse`/`PhotoSubmitResponse`/`PhotoReviewDecision`/`PhotoReviewSummaryDto`. `InspectionTableRowDto.photoReview?`는 단계(start/complete)별 `PhotoReviewSummaryDto`
- `lib/types/domain.ts`
  - `Work`
  - `WorkInspectionStage`: `"start" | "complete"`(신규). 마이그레이션 전 행에는 DB 값이 없어 `WorkInspection.stage`는 옵셔널이며 미지정 시 `"start"`로 취급한다.
  - `MaterialInspectionMethod`(= `InspectionMethod`): `"OCR" | "VISION" | "BOTH" | "NONE"`(부자재마스터 체크 값, NONE = 사진검수)
  - `WorkInspectionMethod`: `"OCR" | "VISION" | "PRODUCT" | "PHOTO"`(검수 행 단위). `InspectionTargetType`: `"material" | "product" | "completion"`
  - `WorkInspection`: method(`WorkInspectionMethod`, `PRODUCT`=완료제품사진, `PHOTO`=사진검수)/status(`submitted`=승인대기·`rejected`=반려 추가)/stage?/target_type?/product_code·product_name·product_lot?(제품 PHOTO 행 스냅샷, material_id는 ""로 매핑)/review_comment?/submitted_at?/reviewed_at?/ocr_result_text/vision_similarity/result_summary/attempt_count
  - `InspectionImage`: `image_type`은 `ocr_capture` | `vision_capture` | `admin_review` | `product`(제품검수 제출 API가 저장) | `completion_photo`(완료검수 사진 제출 API가 저장) | `photo_review`(사진검수 제출 사진, 반려 사진은 이력으로 보존)
  - `AdminReviewRequest`: `created_at?: string` 필드 추가(DB 컬럼은 원래 있었으나 타입에는 없었다. 확인요청 섹션의 요청시각 표시용)

## 주의사항
- OCR/비전 검수 패널 4종(`OcrInspectionPanel`/`VisionInspectionPanel`/`AdminReviewPanel`, 그리고 `WorkProgressTimeline`)은 저장소에 존재하지만 `app/` 어디서도 렌더링되지 않는 미사용 코드다. `AdminReviewPanel`은(사진 승인 UI는 이를 재사용하지 않고 `PhotoApprovalModal`로 별도 구현했다) 내부적으로 "TODO: admin_approved 업데이트" 등 미구현 버튼(toast만 호출)을 포함하고 있어, 실제 조정 처리 로직은 이 컴포넌트가 아니라 `app/api/work-inspection/route.ts`의 PATCH 핸들러에 구현되어 있다.
- `AdjustmentReviewModal`의 "검수 이미지" 영역은 플레이스홀더 박스와 `storage_path` 텍스트만 표시하며 실제 이미지(Supabase Storage) 렌더링 코드는 없다.
  - (2026-10-18 OCR 일치율) "검증값(기대값)" 열은 "기준 텍스트"(OCR은 서버 해석값+출처 작업등록/마스터, 판정 스냅샷 우선)로, "일치율" 열(오른쪽 정렬)을 추가했고, 미처리 OCR 확인요청의 비교 블록(`components/inspection/OcrTextCompare.tsx`: 일치율·등록 텍스트·스캔 텍스트·정규화 차이 글자 강조)과 촬영 사진(서명 URL, 있을 때 플레이스홀더 대체)을 표시한다.
- PATCH `adjustment`에서 `requestId`가 `"virtual-"`로 시작하는 경우는 GET 핸들러가 `work.status === "admin_review_requested"`인데 `admin_review_requests` 테이블에 실제 행이 없을 때 만들어내는 가상 요청이며, 이 경우 `admin_review_requests` update는 스킵되고 `works`/`work_inspections`만 갱신된다. 확인요청 섹션은 실제 요청 행만 다루므로 이 가상 요청을 만나지 않는다.
- PATCH `request_review`로 모바일에서 생성한 요청은 `admin_review_requests`에 실제 행이 insert되므로(`requester_id`는 uuid 컬럼이라 항상 `NULL`로 저장) 위 "virtual-" 가상 요청과 달리 정식 `requestId`를 가지며, 확인요청 섹션(검수 항목 단위) 또는 기존 `AdjustmentReviewModal`(work 단위)로 처리된다.
- PATCH `adjustment`에 `inspectionId`를 넘겨 항목 1건만 처리한 경우, 같은 work에 다른 확인요청이 아직 남아있으면 `works.status` update를 건너뛴다(work 상태는 `admin_review_requested` 유지). `inspectionId` 없이 호출하는 기존 `AdjustmentReviewModal`은 한 번에 work의 `admin_requested` 검수 항목 전체를 처리하므로 이 조건에 걸리지 않는다(처리 직후 남은 항목이 0건).
- "검수승인"으로 `admin_approved`가 된 검수 항목은 `lib/server/inspection-status.ts`의 `getInspectionAggregateStatus()`(수정하지 않음, 참고만)에서 `passed`와 동일하게 합격으로 집계된다. work의 나머지 검수 항목이 모두 `passed`/`admin_approved`가 되어야 그 work의 검수 집계 상태가 `completed`가 된다(work-status/모바일 작업현황이 사용).
- `/api/ocr`가 Google Vision을 쓰려면 `OCR_PROVIDER=google-vision`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_CLIENT_EMAIL`, `GOOGLE_CLOUD_PRIVATE_KEY` 환경변수가 모두 필요하며, 하나라도 없으면 항상 mock 응답으로 폴백된다.

## 스코프 가드 (2026-10 추가, `lib/server/scope-guard.ts`)
- 공통 규칙: API 라우트는 서비스롤 키로 RLS를 우회하므로, 쓰기·삭제·상태변경·리소스ID 조회 요청은 부서/화주 스코프(JSON/FormData `departmentId`·`shipperId`, 쿼리 `department_id`·`shipper_id`)를 **필수**로 받는다. 누락 `400`, 리소스 없음 `404`, 스코프 불일치 `403`, 가드 내 DB 오류 `502`. 이 검증은 mock 모드에서도 스코프 존재(400)까지 동일하게 적용된다. 호출측은 웹은 `useFilterStore`, 모바일은 `useMobileScope()`(`lib/mobile/mobile-api.ts`, 기본 스코프 폴백 포함)의 값을 보낸다. 인증(로그인 사용자 확인)은 별도 범위다.
- `PATCH /api/work-inspection` body에 `departmentId`·`shipperId` 필수. 작업 소속 확인 후, `action.inspectionId`가 있으면 그 검수 항목이, `adjustment`의 `requestId`(virtual- 제외)가 있으면 그 확인요청이 **같은 작업** 소속인지 추가로 확인한다(다른 작업 항목 조작은 403).
- `POST /api/work-inspection/ocr`·`/product`·`/completion-photo`(FormData `departmentId`·`shipperId`), `GET /api/work-inspection/completion-photo`(쿼리 `department_id`·`shipper_id`), `DELETE .../completion-photo`·`POST .../setup`(JSON body): `workId`가 스코프 소속인지 확인한 뒤 기존 검수 로직을 수행한다(`inspectionId`는 기존대로 `work_id` 일치 조회).
- `POST /api/work-inspection/setup`의 `stage: "complete"` 사전 판정은 `lib/server/work-auto-status.ts`의 `loadInspectionSnapshot()`(마스터 가시성 규칙 `getActiveInspections` 적용, 자동 전이와 동일 판정)의 `startStatuses`를 사용한다. 마스터에서 체크 해제된 방식의 과거 행이 남아 있어도 화면·자동 전이와 판정이 어긋나지 않는다.

## 사진검수 + 작업승인 코어 규칙 (2026-10)

- 구현 코어: `lib/inspection/method-plan.ts`(판정·집계 순수 함수), `lib/server/inspection-setup.ts`, `lib/server/work-auto-status.ts`, `lib/server/inspection-guard.ts`, `lib/server/inspection-images.ts`, `lib/mobile/inspection-visibility.ts`, `lib/constants/status.ts`. 라우트·화면 연결은 아래 "사진검수 + 작업승인 API" 절 참고(이 절은 코어 규칙).
- 판정 기준 = 부자재마스터 `inspection_method` 체크 여부(`planMaterialMethods`): BOTH=OCR+VISION, OCR, VISION, NONE/NULL/이상값=PHOTO. 기준이미지·ROI 등록 여부는 판정에 쓰지 않음(검수 방식 판정은 마스터 체크만 본다). 다만 체크한 방식의 기준이 비어 있으면 부자재·작업마스터 화면이 "기준 미등록" 경고 배지(`missing_reference`)를 표시한다(`docs/menus/material-master.md` 참고). 제품은 항상 PHOTO
- 제품: 모든 작업·시작/완료검수 각 단계마다 제품 구성 행(work_components 제품, 없으면 work_master_products)별 PHOTO 1행(`target_type='product'`, `product_code/name/lot` 스냅샷, material_id 없음)
- 완료검수: 완료제품사진(`method=PRODUCT`, `target_type='completion'`, 1~3장 자동 합격) 현행 유지. OCR/VISION 체크 부자재는 사진으로 대체 불가
- 항목 상태(PHOTO): pending → submitted(승인대기, 제출 후 잠금·제출 전 교체 허용) → admin_approved(승인) / rejected(반려, `review_comment`) → 재촬영 → submitted. 반려 사진은 이력 보존(`inspection_images.image_type='photo_review'`, metadata.reviewStatus)
- 단계별 집계 분류: 합격(passed·admin_approved) / 승인대기(submitted) / 불합격(failed·retrying·rejected) / 확인요청(admin_requested) / 미진행(pending)
- 작업 상태 전이(`judgeNextStatus`, 순수 함수) — 조건 R = 활성 단계 미진행·불합격·확인요청 0 + 승인대기 1건 이상
  1. 시작·완료 전부 합격 → completed
  2. 활성 단계 = 시작검수 미완료면 start, 아니면 complete
  3. 활성 단계 확인요청 ≥1 → admin_review_requested
  4. 불합격·반려 ≥1 + 승인대기 0 → inspection_failed
  5. 조건 R 충족, 또는 검토 중(현재 admin_review_requested)이면서 **미진행 0·확인요청 0**인데 승인대기 잔존 → admin_review_requested(미진행이 남았으면 검토 중으로 보지 않음 — 확인요청 조정승인 뒤 사진·OCR이 남은 작업이 승인대기에 고착되던 결함 수정)(표시: start "작업승인대기" / complete "완료승인대기", 확인요청 기인은 "검수확인중"/"완료확인중")
  6. 반려가 남은 채 inspection_failed/admin_review_requested에서 넘어오면 inspection_failed, 그 외 start 활성 registered / complete 활성 in_progress
  - OCR/VISION이 남아 있으면 사진을 모두 제출해도 진행 단계 유지, 모두 끝난 순간 승인대기. `releaseWorkHold`도 같은 함수(release 모드) 사용
- 검수 행 생성/재판정: `setupWorkInspections`(stage별 멱등, 제품 PHOTO·NONE 부자재 PHOTO·완료제품사진 생성) / `reconcileInspectionPlan`(진입 시 재판정 — pending·사진 0장 행만 계획과 다르면 교체, 제출·합격·반려 이력 행은 동결)
- ID 형식·정렬·검사 순서: PATCH `/api/work-inspection`·`/photo`의 workId/inspectionId/requestId는 `scope-guard.assertUuid`로 UUID 형식을 먼저 검사해 비UUID는 400(이전 502). 사진 GET 항목은 제품 → 부자재, 같은 타입 안에서는 코드 → LOT → 항목ID 순. `photo_review`는 타 작업 항목 소속(403)을 작업 상태(409)보다 먼저 본다. 웹 조정승인 토스트는 응답 `workStatus` 라벨("작업 상태: …")을 표시한다.
- 가시성(`inspection-visibility.ts`): `planMaterialMethods` 기반, 제품 PHOTO·완료제품사진은 항상 표시, 계획에서 빠진 과거 부자재 행은 숨겨 완료 판정을 막지 않음
- DDL 의존: `work_inspections.target_type/product_*/review_comment/submitted_at/reviewed_at`, method·status CHECK, `material_masters.inspection_method` NONE — 2026-10-18 실DB 적용 완료(아래 "데이터 모델·DB 스키마 변경 이력")

## 사진검수 + 작업승인 API (2026-10)

### `POST /api/work-inspection/photo` (multipart: departmentId, shipperId, workId, inspectionId, image)
- 항목당 현재 사진 1장. jpeg/png/webp 8MB 이하(위반 400). 스코프 누락 400 / 타스코프·타작업 항목 403 / 없음 404
- 가드(`checkPhotoSubmittable`): PHOTO 아님·승인 항목·작업 `admin_review_requested`(검토 중)·단계별 허용 상태 외 → 409
- 처리: 업로드 → `inspection_images(photo_review, metadata{submissionNo,reviewStatus})` → 항목 `submitted`(이전 상태 조건부 update, 경합 409) → 검토 전 교체분 삭제(반려 사진은 이력 보존) → `maybeAdvanceWorkStatus`(null=502). 실패 시 스토리지·이미지 행 정리
- 응답: `{ source, status:"submitted", photo:{id,url}, workStatus }` / mock: 200 간이 응답

### `GET /api/work-inspection/photo?work_id&department_id&shipper_id&stage=start|complete&include_history=true`
- 응답 `PhotoReviewResponse`: `work`(작업 요약 `PhotoReviewWorkDto`), items(제품 먼저), 항목별 현재 사진 서명URL(+history)·`expected`(기대 정보)·`referenceImageUrl`(선택), readiness(canApproveWork, pendingPhotos, rejectedPhotos, nonPhotoIncomplete(확인요청 제외), adminRequested)

- 기대 정보 출처·매칭(`lib/server/photo-review-expected.ts`): 작업지시서 조립 `buildWorkOrderPrintDto`를 재사용(`work_components` 우선, 구성품 없는 쪽은 작업마스터 BOM × 작업수량 폴백 — LOT "-", 할당=필요수량). 제품 항목은 `product_code`+`product_lot`로 매칭하되 같은 코드의 LOT 행이 있으면 그 행, 일치 LOT가 없으면 코드 전체 합계(LOT 나열·할당수량 합). 부자재 항목은 `material_id` → 자재코드로 구성품 행을 모으고 LOT 분할이 여럿이면 LOT·비고를 나열하고 할당수량을 합산(단위·필요수량은 첫 행). 검수방식 라벨은 부자재마스터 `inspection_method`. `referenceImageUrl`은 부자재마스터 `reference_image_path`→`ocr_image_path`→`vision_image_path` 순의 `material-images` 서명URL(1시간, 발급 실패 시 생략). 조회 오류는 502. 모든 필드는 추가(하위호환)이며 mock 응답에는 `work`가 없다.

### `PATCH /api/work-inspection` 액션
- `photo_review {decisions:[{inspectionId, decision:"approved"|"rejected", reason?}]}`: 반려 사유 빈값 400, submitted 아니면 409, 경합 409
- `photo_approve_work {stage}`: 조건 R(미진행·불합격·확인요청 0 + 승인대기 ≥1) 미충족 409(사유 건수 포함). 성공 시 start→`in_progress`, complete→`completed`
- `photo_reject_work {stage, reason}`: 사유 필수 400, 승인대기 사진 없으면 409 → 보통 `inspection_failed`
- 응답 `{source, workId, workStatus}`. 보류/취소/완료 작업은 409
- `complete`: 위 "PATCH `complete`" 참고(완료검수 미완료·승인대기·불합격 시 409, 판정 오류 502).
- `request_review`/`adjustment`: 대상이 PHOTO 항목이면 409(위 "PATCH `adjustment`/`request_review` 공통 가드"). `adjustment`의 상태 판정은 `maybeAdvanceWorkStatus`로 통일(위 "PATCH `adjustment`" 3단계)
- DB 오류는 502. GET 목록 행에 `photoReview`(단계별 요약) 포함, `inspectionStep`에 "작업승인대기/완료승인대기/사진반려" 추가, 사진 승인대기만으로는 가상 확인요청을 만들지 않음

### 기타
- `setup`: `reconcileInspectionPlan` 사용(제출 이력 행 동결), DB 오류 502(위 "검수 대상 lazy 생성·재판정 API"). `reconcileInspectionPlan`이 `failed`를 반환하면 502 `{ error }`로 응답한다(모바일 pre/complete가 기존 오류 표시를 재사용)
- `completion-photo`: 버킷 ensure 공용화, DB 오류 502(PHOTO 항목은 409로 거부)
- 작업수정 PATCH(`work-register/[workId]`): 마스터 변경 시 pending 삭제 후, 항상 reconcile로 제품 구성 변경 반영
- 공용 헬퍼: `lib/server/photo-review.ts`(단계별 활성 행·readiness·요약)
- 배치 insert 주의: 키가 다른 행이 섞이면 누락 컬럼이 NULL로 들어가므로 `target_type`을 부자재 행에도 명시

## 사진 승인 처리 결과 판정 (2026-10)
- `photo_review`/`photo_approve_work`/`photo_reject_work`는 항목별 `submitted` 조건부 update로 처리한다. 같은 요청 안에 다른 처리로 이미 상태가 바뀐 항목(경합)이 있으면 나머지는 처리·저장한 뒤 `409`(새로고침 안내)를 반환한다.
- `photo_approve_work`는 승인 저장 후 `maybeAdvanceWorkStatus` 결과가 기대 상태(start→`in_progress`, complete→`completed`)가 아니면 `409`("승인은 저장되었으나 작업상태가 … 전환되지 않았습니다")를 반환한다. `maybeAdvanceWorkStatus`가 `null`이면 `502`(처리는 저장됨).

## 데이터 모델·DB 스키마 변경 이력
> 별도 스키마/마이그레이션 기록 문서가 docs 안에 없어 이 절에 요약한다. 마이그레이션 SQL 원본·롤백 SQL은 현재 세션 `scratchpad` 임시 폴더(`migration-photo-approval.sql`, `migration-photo-approval-rollback.sql`)에만 있으므로 **프로젝트 내 영구 위치(예: `supabase/migrations`)로 보관이 필요하다**.

### 2026-10-18 사진검수(PHOTO) + 관리자 승인/반려 마이그레이션(실DB 적용 완료, 멱등 SQL)
- `work_inspections` 컬럼 7개 추가: `target_type text NOT NULL DEFAULT 'material'`, `product_code`, `product_name`, `product_lot`, `review_comment`(최근 반려 사유, 승인 시 null), `submitted_at timestamptz`, `reviewed_at timestamptz`. 기존 완료제품사진 행(`method='PRODUCT'`)은 `target_type='completion'`으로 보정.
- CHECK 제약(신규): `work_inspections_target_type_check`(material/product/completion), `work_inspections_method_check`(OCR/VISION/PRODUCT/PHOTO), `work_inspections_status_check`(pending/passed/failed/retrying/admin_requested/admin_approved/submitted/rejected), `work_inspections_target_fields_check`(product는 `product_code` 필수·`material_id` 없음, material은 `material_id` 필수), `inspection_images_image_type_check`(+`photo_review`), `material_masters_inspection_method_check`(OCR/VISION/BOTH/NONE).
- `material_masters.inspection_method`: NOT NULL 유지, 기본값 `'OCR'` → `'NONE'`(신규 부자재는 사진검수가 기본).
- 부분 유니크 인덱스: `work_inspections_product_photo_uq`(work_id, stage, product_code, coalesce(product_lot,'')) where method='PHOTO' and target_type='product', `work_inspections_completion_product_uq`(work_id, stage) where method='PRODUCT'. 부자재 PHOTO 행은 기존 `work_inspections_work_material_method_stage_key`(work_id, material_id, method, stage)가 보장한다.
- 롤백: `migration-photo-approval-rollback.sql`(scratchpad 임시 — 영구 보관 필요). 적용 전 사전 조회: 3테이블 RLS enabled·정책 0건(서비스롤만 접근), 비내부 트리거·뷰·함수 의존 0건.


### OCR 일치율 확인요청 화면 (2026-10-18)
- `GET /api/work-inspection`: OCR 검수 행에 `ocrExpectedText`/`ocrExpectedSource`/`ocrThreshold`(서버 해석값, 작업 텍스트는 `work_components`를 1쿼리로 읽어 `workId|부자재코드` 맵으로 조인)와 `ocr_expected_text`/`ocr_match_rate`를 내려준다. `pendingReviewRequests[].ocr`(OCR 항목 확인요청만): `expectedText`/`expectedSource`/`recognizedText`/`matchRate`/`threshold`/`imageUrl`(미처리 건의 최근 `ocr_capture` 서명 URL 1시간).
- 확인요청 섹션: "일치율" 열(≥기준 초록/미만 주황/없음 `-`, 오른쪽 정렬), OCR 건은 "비교" 버튼 → `OcrCompareModal`(좌 촬영 사진, 우 일치율·등록/스캔 텍스트·차이 강조) + 승인(`approved`)/재검수(`retry_requested`)/반려(`rejected`→항목 `failed`). 기존 목록 버튼(검수승인/재검수)은 유지.
