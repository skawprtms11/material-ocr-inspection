# 작업검수 (`app/(workspace)/work-inspection`)

## 개요
현장(모바일)에서 진행한 OCR/비전 검수 이력을 표로 확인하고, 관리자가 "검수완료" 처리 또는 현장에서 올라온 검수 중 특이사항 확인요청(조정확인)을 승인/재검수요청/미승인 처리하는 화면이다.

## 화면 구조
`app/(workspace)/work-inspection/page.tsx`(클라이언트 컴포넌트) 구성:
- `PageHeader` — 제목/설명만, 별도 액션 버튼 없음
- 데이터 소스 배지 바(`supabase`/`mock`/연결 확인 중/연결 오류) — 연결 오류 시 "다시 시도" 버튼으로 `loadRows` 재호출
- **확인요청 섹션**(`pendingReviewRequests.length > 0`일 때만 목록 최상단에 표시) — 미처리(`admin_review_requests.status === "requested"`) 확인요청을 검수 항목 단위(문서번호/부자재(또는 제품)명/검수방식/요청사유/요청시각)로 나열하는 별도 `CuteCard` 표. 각 행에 버튼 2개:
  - **검수승인**: `PATCH /api/work-inspection`(`action: { type: "adjustment", requestId, status: "approved", inspectionId }`) 호출. 해당 검수 항목만 `admin_approved`로 좁혀 처리한다(아래 "PATCH `adjustment`" 참고).
  - **재검수**: 같은 API를 `status: "retry_requested"`로 호출. 해당 검수 항목만 `retrying`(모바일에서 다시 검수 가능한 기존 재검수 상태)으로 되돌린다.
  - 두 버튼 모두 처리 중에는 `processingRequestId`로 해당 행만 비활성화하고, 성공 시 `loadRows()`로 섹션과 표를 함께 갱신한다.
- `CuteCard` 목록 테이블 — 등록일자/작업구분/문서번호/완성품코드·명/작업수량/검수단계/검수처리/조정확인. "검수대상" 건수 배지 표시
  - 검수단계 배지 색상은 `getStepClassName`(문자열 포함 여부로 분기: 완료/승인→초록, 대상→보라, 보류/취소→회색, 요청→주황, 불일치/재검수→빨강, 진행/모바일→하늘)
  - 검수처리 컬럼: `CloudButton`으로 "검수완료" 처리(`work.status`가 `canceled`/`completed`면 비활성화)
  - 조정확인 컬럼: `row.request`가 있으면 상태 배지 버튼(`adjustmentLabels`: requested/approved/rejected/retry_requested)으로 `AdjustmentReviewModal` 오픈, 없으면 "요청없음" 배지
- `AdjustmentReviewModal` — 작업 기본정보(`InfoItem` 4종) + 현장 확인 요청 사유 + 검수방식/판정상태/OCR·비전 결과/**검증값(기대값)**/요약 표(`row.inspections`) + 검수 이미지 미리보기(현재는 플레이스홀더 박스, `image?.storage_path` 텍스트만 표시) + 조정승인/재검수 요청/조정 미승인 버튼
  - **검증값(기대값) 컬럼**: 검수 항목의 `material_id`로 연결된 부자재의 `material_masters.verification_value`(모바일 OCR 등록 검수값)를 참고용으로 보여준다. 값이 없으면 "-". 판정 로직에는 관여하지 않는 순수 표시용 컬럼이다.
  - 이 모달은 work 단위(기존 `row.request`, `requestByWork` 맵)로 동작하며, 위 확인요청 섹션(검수 항목 단위)과는 별개의 진입점이다. 둘 다 같은 PATCH `adjustment` 액션을 쓰지만 모달 쪽은 `inspectionId`를 넘기지 않아 기존처럼 work의 `admin_requested` 검수 항목 전체를 대상으로 처리한다.
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`

## 검수 행(`work_inspections`) 생성 출처
이 화면과 모바일이 읽는 `work_inspections` 행은 `lib/server/inspection-setup.ts`의 공유 함수 `setupWorkInspections(supabase, workId, workMasterId)`가 만든다. 이 함수는 `work_master_materials`(해당 작업의 `work_master_id` 기준, `inspection_order` 순)를 조회해 부자재별로 `material_masters.inspection_method`에 따라 검수 행을 만든다: `OCR`/`VISION`은 1건, `BOTH`는 `OCR`·`VISION` 각 1건(`status: "pending"`, `attempt_count: 0`). 이미 해당 `work_id`에 검수 행이 있으면 다시 만들지 않는다(멱등). 작업마스터에 부자재 구성이 없거나 작업마스터가 연결되지 않은 작업은 검수 행이 생기지 않는다(`inspectionSetup: "skipped_no_master" | "skipped_no_materials"`).

이 함수는 세 지점에서 호출된다(어느 순서로 호출돼도 멱등이라 결과는 동일):
1. **작업등록 시**(`app/api/work-register/route.ts` POST) — 작업 insert 성공 직후. 신규 작업은 이 시점에 바로 검수 행이 생긴다.
2. **담당자 배정 시**(`app/api/work-register/[workId]/assign/route.ts` PATCH) — 배정 update 성공 직후. 1번에서 이미 생성됐다면 `skipped_existing`.
3. **모바일 스캔 시 lazy 생성**(`app/api/work-inspection/setup/route.ts` POST, body `{ workId }`) — 위 두 지점 이전에 만들어진 기존 작업처럼 검수 행이 아직 없는 작업을 모바일에서 문서 스캔할 때 자동으로 채워준다. `app/mobile/page.tsx`가 스캔 매칭된 작업의 `inspections`가 0건이면 이 API를 호출하고 성공 시 `refetch()`로 목록을 갱신한다(상세는 `docs/menus/mobile.md` 참고). work가 존재하지 않으면 `404`.

상세는 `docs/menus/work-register.md`의 POST/PATCH 설명 참고.

## 데이터 흐름
- 페이지 로드/재조회(`loadRows`): `GET /api/work-inspection?department_id=&shipper_id=` 호출
  - 응답(`WorkInspectionDataResponse`)의 `rows`/`pendingReviewRequests`/`source`를 `tableRows`/`pendingReviewRequests`/`dataSource`로 반영
- 검수완료: `PATCH /api/work-inspection` (body: `{ workId, action: { type: "complete" } }`)
  - 성공 시 `loadRows()` 재호출
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
  5. `getInspectionStep()`으로 표시용 검수단계 문자열 계산(취소 → 보류 → 조정승인 → 재검수 필요 → 재검수 요청 → 검수완료 → 검수대상/검수대기 → 확인요청 → 불일치·재검수 → 검수진행 → 모바일 검수중 순으로 우선순위 판정)
- **검증값 연계**: `fetchWorkMasterData`가 조회한 `masterData.materials`(부서/화주 스코프의 `material_masters` 전체, `verification_value` 포함)로 `materialById` 맵을 만들고, `withVerificationValue()`가 각 `work_inspections` 행에 `materialVerificationValue`(해당 `material_id`의 `verification_value`, 없으면 `undefined`)를 붙여 `InspectionWithVerificationDto`로 확장한다. mock 모드도 동일하게 `appRepository.listMaterials({})`로 맵을 만들어 같은 필드를 붙인다. `lib/types/work-inspection-api.ts`의 `InspectionTableRowDto.inspections`는 이제 `InspectionWithVerificationDto[]` 타입이다.
- **확인요청 목록 연계**: `buildPendingReviewRequests()`가 `admin_review_requests`(`status === "requested"`인 실제 행만) 각각을 `inspection_id`로 `work_inspections`, `material_id`로 `material_masters`, `work_id`로 `works`와 조인해 `PendingReviewRequestDto`(`requestId`/`workId`/`documentNo`/`materialName`/`method`/`inspectionId`/`reason`/`requestedAt`)로 변환한다. `requestedAt`은 `admin_review_requests.created_at`(DB 컬럼은 존재하지만 `lib/types/domain.ts`의 `AdminReviewRequest`에는 선택 필드로만 있었고 이번에 `created_at?: string`으로 추가했다). 기존 `row.request`(work당 1건, `AdjustmentReviewModal`용)와 달리 이 목록은 work당 여러 건이 동시에 잡힐 수 있다(항목별 확인요청이므로). GET 응답 상단(work.status가 `admin_review_requested`인데 실제 요청 행이 없는) "virtual-" 가상 요청은 이 목록에 포함되지 않는다(기존 `AdjustmentReviewModal`에서만 계속 노출).
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작). 화면은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전 목록 유지).
- PATCH `complete`
  - `.from("works")`를 `status: "in_progress"`, `latest_inspected_at`으로 update
- PATCH `adjustment` 처리 순서 — body에 `inspectionId`(선택)가 추가됐다: `{ workId, action: { type: "adjustment", requestId, status, inspectionId? } }`
  1. `.from("admin_review_requests")`를 `status`/`processed_at`/`admin_comment`로 update
     - `requestId`가 `"virtual-"`로 시작하면 이 update는 건너뜀(DB에 실제 요청 행이 없는 가상 요청이므로)
  2. `.from("work_inspections")`에서 `work_id` + `status = "admin_requested"` 조건으로 `admin_approved`/`retrying`/`failed`로 update — `inspectionId`가 있으면 `.eq("id", inspectionId)`를 추가로 걸어 **해당 검수 항목 1건만** 처리한다(확인요청 섹션 용도). 없으면 기존처럼 work의 `admin_requested` 검수 항목 전체가 대상이다(`AdjustmentReviewModal` 기존 동작 유지).
  3. 같은 work에 아직 처리되지 않은 `admin_requested` 검수 항목이 남아있는지 `count`로 다시 확인한다. **남아있으면 `works` update를 건너뛴다**(다른 확인요청 처리와 상태 충돌 방지, work 상태는 `admin_review_requested` 유지). 남은 항목이 없으면: `approved`는 `maybeAdvanceWorkStatus(supabase, workId)`(`lib/server/work-auto-status.ts`, 신규 상태 모델의 자동 전이 공유 함수)를 호출해 실제 검수 집계를 다시 확인한 뒤 진행/완료로 전이한다(다른 항목이 아직 안 끝났으면 상태를 그대로 둔다 — 예전에는 이 경로가 검수 집계와 무관하게 무조건 `in_progress`로 강제했었다). `retry_requested`/`rejected`는 기존처럼 `.from("works")`를 `status: "inspection_failed"`/`latest_inspected_at`으로 update한다.
- PATCH `request_review`(모바일 검수 진행 중 특이사항 확인요청. 실패 후 "검수 취소"도 이 액션의 한 형태다) — body: `{ workId, action: { type: "request_review", inspectionId, reason?, label? } }`. 호출 주체는 모바일 홈의 `OcrInspectionCard`("확인요청"/"검수 취소" 버튼)와 제품검수 카드("확인요청" 버튼)이며, 관리자 웹 화면에는 이 액션을 직접 호출하는 UI가 없다(생성된 요청은 확인요청 섹션 또는 기존 `AdjustmentReviewModal`의 승인/재검수/거부 흐름으로 처리된다).
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
  2. `material_masters.verification_value`를 `material_id`로 조회해 기대값(`expectedValue`)으로 사용한다.
  3. `lib/server/ocr.ts`의 `runOcr()`을 `isCropped: true`로 호출한다(클라이언트가 이미 ROI로 크롭해서 보내므로 서버에서는 전체 크롭본을 그대로 읽는다).
  4. `canVerify`가 `false`(OCR 환경변수 미설정 등)이면 **DB를 전혀 변경하지 않고** 현재 `status`를 그대로 반환한다(`{ status: 기존값, recognizedText: "", expectedValue, matched: false, canVerify: false, saved: false }`).
  5. `canVerify`가 `true`이면 인식 텍스트와 `expectedValue`를 각각 trim 후 대소문자 무시 비교(`normalize(a) === normalize(b)`)하여 일치 여부(`matched`)를 판정한다.
  6. **불합격(`matched: false`)이면 여기서 끝난다** — 스토리지 업로드도, `work_inspections`/`inspection_images` 갱신도 전혀 하지 않고(`attempt_count`도 증가하지 않음) 현재 `status`를 그대로 담아 판정 결과만 응답한다(`{ status: 기존값, recognizedText, expectedValue, matched: false, canVerify: true, saved: false }`). 불합격은 재검수(재촬영)가 전제이므로 서버에 판정 이력이나 사진을 남기지 않는다.
  7. **합격(`matched: true`)일 때만** 스토리지 버킷 `inspection-images`(없으면 `material-images`와 동일한 패턴으로 자동 생성, `public: false`, 8MB 제한, jpeg/png/webp만 허용)에 `{workId}/{inspectionId}/{timestamp}-ocr.jpg` 경로로 크롭본을 업로드하고, `work_inspections`를 `status: "passed"`/`ocr_result_text`(인식 텍스트)/`result_summary`(`"OCR 일치 (기대값: xxx)"`)/`attempt_count`(+1)/`updated_at`으로 update한 뒤 `inspection_images`에 `image_type: "ocr_capture"` 행을 insert한다(`metadata`에 `roi`/`expectedValue`/`recognizedText`/`matched` 저장). insert 직후 `pruneStaleInspectionImages()`(`lib/server/inspection-images.ts`, 신규 공유 함수)를 호출해 같은 `inspection_id`의 이전 사진(스토리지 파일 + `inspection_images` 행)을 모두 정리한다 — **검수 항목당 검증을 통과한 사진 1장만 유지**된다(재검수로 여러 번 성공 저장돼도 누적되지 않음). 정리 실패는 로그만 남기고 새로 저장된 사진에는 영향을 주지 않는다. 응답은 `saved: true`를 포함한다.
  8. 업로드 후 `work_inspections`/`inspection_images` 저장이 실패하면 `material-master/registration` 라우트와 동일한 보상 패턴으로 업로드된 파일을 스토리지에서 제거한 뒤 원래 에러를 반환한다.
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

### 검수 대상 lazy 생성 API (`app/api/work-inspection/setup/route.ts`)
- `POST`, JSON body: `{ workId, stage? }`. 호출 주체는 모바일 홈(`/mobile`)의 문서 스캔 매칭 로직(`app/mobile/page.tsx`의 `handleScan`, `stage` 생략 = 기존 시작검수)과 모바일 완료검수 화면(`app/mobile/complete/[workId]/page.tsx`, `stage: "complete"`)이다. 시작검수는 매칭된 작업의 `inspections`가 0건일 때만, 완료검수는 진입 시 항상(해당 stage 행이 없으면) 호출된다.
- 처리 순서(mock 모드가 아닐 때): `.from("works")`에서 `id`(=workId)로 존재 확인(없으면 `404`) → `work_master_id`로 위 "검수 행 생성 출처"의 `setupWorkInspections`를 `stage`와 함께 호출.
- 응답: `{ source: "supabase", workId, inspectionSetup }`. mock 모드는 DB를 건드리지 않고 `{ source: "mock", workId, inspectionSetup: "skipped_existing" }`을 반환한다.
- `workId` 누락 시 `400`.

## 완료검수(작업완료 시 검수, 신규)
"작업시작할 때 검수"(위 전체 내용, 이하 시작검수)와 별개로 시작검수가 끝났지만 작업상태가 아직 완료가 아닌 작업을 대상으로 모바일에서 수행하는 완료검수를 같은 테이블/로직 위에 얹어 구현했다. 신규 테이블 없이 `work_inspections.stage`(`'start' | 'complete'`, 신규 컬럼)로 두 흐름을 구분한다. **완료검수 프로세스는 완료제품사진 항목 1개가 추가된다는 점만 빼면 시작검수와 완전히 동일하다**(부자재 OCR/제품검수 컴포넌트를 그대로 재사용).

- **완료제품사진**(신규, 필수, 시작검수에는 없는 유일한 추가 항목): `work_inspections` 행 1건을 `material_id: null`, `method: "PRODUCT"`, `stage: "complete"`로 만들어 표현한다. 제품코드/명/LOT 체크리스트는 없고, 사진 1장을 촬영(압축 후 저장)하면 무조건 합격 처리한다. 전용 API `POST /api/work-inspection/completion-photo`(FormData: `inspectionId`/`workId`/`image`, `components/mobile/CompletionPhotoCard.tsx`가 호출)가 담당한다 — `product/route.ts`와 동일한 업로드 패턴(버킷 `inspection-images`, 경로 `{workId}/{inspectionId}/{timestamp}-completion.jpg`, `browser-image-compression`으로 클라이언트 압축)이지만 `checks` 검증이 없고 항상 `status: "passed"`로 저장한다. `inspection_images.image_type: "completion_photo"`. 이 API도 insert 직후 `pruneStaleInspectionImages()`를 호출해 사진 1장만 유지한다. `CompletionPhotoCard`는 `materialId` prop이 있으면(부자재 비전 항목) `GET /api/material-master/registration?material_id=`로 등록된 비전 참고 사진(method="VISION")을 먼저 보여준다(자동 판정에는 쓰지 않는 참고용 표시). 완료제품사진 항목은 `materialId`가 없어 참고 사진 없이 촬영 버튼만 보인다.
- **부자재 목록 번호 공유(반복 표시 방지)**: 같은 부자재가 OCR+비전을 모두 요구하면 `work_inspections` 행이 2개(검수 방식별)라 목록에 2번 나타난다. 모바일 화면은 부자재 단위로 번호를 미리 계산해(`materialIndexById`/`materialIndexByTargetId`) OCR·비전 카드에 **같은 번호**를 부여한다("부자재 2 · OCR 검수" / "부자재 2 · 비전 검수"처럼 표시). 카드 자체는 여전히 2장이지만 같은 부자재의 서로 다른 검수 방식임이 분명해진다.
- **부자재 OCR 완료검수**: 시작검수와 **완전히 동일한** `components/mobile/OcrInspectionCard.tsx`와 `POST /api/work-inspection/ocr`를 그대로 재사용한다(해당 항목의 `id`가 `stage: "complete"` 행을 가리키므로 별도 서버 분기 불필요).
- **부자재 비전 완료검수**: 시작검수와 **완전히 동일한** `components/mobile/CompletionPhotoCard.tsx`(`materialId` prop 전달, 체크리스트 없이 비전 참고 사진 표시 + 촬영·압축·저장, `POST /api/work-inspection/completion-photo`)를 그대로 재사용한다(`inspectionId` 단위로 동작해 stage를 구분할 필요가 없다). 제품코드/명/LOT 확인은 부자재 단위가 아니라 아래 "제품목록"이 담당한다.
- **제품목록(신규)**: `components/mobile/ProductChecklist.tsx`가 `GET /api/work-status/detail?work_id=`의 `products`(코드/제품명/LOT/사용수량)를 조회해 체크박스 목록으로 보여준다. 시작검수/완료검수 화면 모두 이 컴포넌트를 공유한다. 체크 상태는 화면 로컬 상태일 뿐 서버에 저장되지 않는다(제품 단위 검수 개념이 없어 확인용 UI로만 존재, `work_inspections`에 영향 없음).
- **검수 대상 생성**: `setupWorkInspections(supabase, workId, workMasterId, "complete")`가 부자재별 OCR/VISION 행 + 완료제품사진 1행을 함께 만든다(부자재 구성이 없어도 완료제품사진 행은 항상 생성). 시작검수(`stage` 인자 생략, 기본값 `"start"`)는 완료검수 행을 만들지 않는다. 멱등 체크(기존 행 존재 확인)와 유니크 제약(`work_id, material_id, method, stage`) 모두 `stage`를 포함해, 시작검수 setup 호출이 완료검수 행을 "이미 있음"으로 오판(또는 그 반대)하지 않는다.
- **서버 방어(중요)**: `POST /api/work-inspection/setup`은 `stage: "complete"` 요청 시 `setupWorkInspections` 호출 전에 해당 work의 시작검수(`stage="start"`) 행을 조회해 `getInspectionAggregateStatus`가 `completed`가 아니면(행이 없거나 미통과 포함) `409`(한국어 에러 메시지)로 거부한다. 클라이언트 가드(`/mobile/complete/[workId]`의 `startInspectionDone`, 아래 참고)를 우회해 URL을 직접 열어도 서버에서 재검증되므로 시작검수 없이 완료검수 행이 만들어질 수 없다.
- **확인요청/관리자승인 재사용**: 완료검수 항목도 시작검수와 동일하게 `PATCH /api/work-inspection`(`request_review`/`adjustment`)을 그대로 쓴다 — 두 액션 모두 `inspectionId` 단위로 동작해 stage를 구분할 필요가 없다. 확인요청 섹션(`pendingReviewRequests`)은 **stage 무관하게 시작·완료검수 확인요청을 한 곳에서 함께 승인 처리**한다(관리자 웹 화면에 별도 완료검수 탭을 만들지 않고 기존 섹션을 재사용). 완료제품사진(`material_id` 없음, `method: "PRODUCT"`) 항목은 부자재명 대신 "완료제품사진" 고정 라벨로 표시된다(`buildPendingReviewRequests`).
- **완료 처리(자동)**: 완료검수 마지막 항목이 `passed`/`admin_approved`가 되는 시점에 그 저장/승인 API가 `maybeAdvanceWorkStatus()`를 호출해 작업상태를 "완료"로 자동 전이한다(`completed_at` 함께 기록, `docs/menus/work-status.md`의 "자동 상태 전이" 참고). 모바일 완료검수 화면의 "완료 확인하고 나가기" 버튼은 더 이상 직접 상태를 바꾸지 않고(수동 `completed` PATCH는 서버가 거부한다) 목록을 다시 불러온 뒤 안내만 하고 `/mobile/status`로 이동한다.
- **GET 조회(`app/api/work-inspection/route.ts`)**: `stage` 쿼리 파라미터로 표/모바일 카드용 `rows`의 기준을 고른다. 생략 시 기본값 `"start"`(웹 작업검수 화면, `useMobileInspectionRows()`), `stage=complete`면 완료검수만(`useMobileCompletionInspectionRows()`, 신규). `work_inspections`는 한 번만 조회한 뒤 서버에서 stage로 나눠 `rows`(요청한 stage만)와 `pendingReviewRequests`(항상 두 stage 전체, 위 참고)를 각각 만든다. `inspection_images`도 `rows`에 포함되는 stage의 검수 항목에 연결된 사진만 `images` 필드에 담는다.

### 완료검수 진입 조건
모바일 홈(`/mobile`)에서 문서번호를 스캔했을 때, 해당 작업이 **① 시작검수 집계 상태가 `completed`**(`getInspectionAggregateStatus`, stage="start" 기준)이고 **② 작업상태가 완료 그룹이 아닌 경우**(`getDisplayStatus(work.status) !== "complete"`, 즉 `passed`/`completed`가 아닌 모든 상태 — `registered`/`in_progress`/`on_hold` 등 포함)에만 "검수시작" 버튼이 "완료검수"로 바뀌고, 클릭 시 `/mobile/complete/{workId}`로 이동한다(`startInspectionDone`, `app/mobile/page.tsx`).
완료검수 화면(`app/mobile/complete/[workId]/page.tsx`)은 URL을 직접 열어 들어오는 경로(홈/현황 버튼을 거치지 않는 진입)까지 방어하기 위해 **자체적으로도 두 조건을 모두 재검증**한다: `useMobileInspectionRows()`(stage=start 기본값)를 별도로 조회해 `startInspectionDone`을 다시 계산하고, `workNotCompleted`와 함께 `canEnterCompletion`으로 묶어 가드한다. 작업상태가 이미 완료 그룹이면 "이미 완료 처리된 작업이라 완료검수할 수 없어요", 시작검수가 아직 안 끝났으면 "시작검수를 먼저 완료해주세요" 안내만 표시하고 검수 UI/lazy setup 호출을 막는다. 서버도 동일 조건을 재검증한다(바로 위 "서버 방어" 참고) — 클라이언트 가드를 우회해도 `setup` API가 `409`로 거부한다.

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
  - "검수완료" 클릭 시 서버에서 `→ in_progress`로 변경
  - 조정승인(`approved`) 시 `→ in_progress`로 변경
  - 재검수 요청(`retry_requested`)/조정 미승인(`rejected`) 시 둘 다 `→ inspection_failed`로 변경(코드상 두 상태를 구분하는 별도 분기 없음)

## 주요 타입
- `lib/types/work-inspection-api.ts`
  - `AdjustmentStatusDto`: requested/approved/rejected/retry_requested
  - `InspectionWithVerificationDto`: `WorkInspection & { materialVerificationValue?: string }` — `material_masters.verification_value`를 검수 항목에 참고용으로 붙인 확장 타입
  - `InspectionTableRowDto`: work + registeredAt/workType/finishedProductCode·Name/quantity/inspectionStep/request?/inspections(`InspectionWithVerificationDto[]`)/images/adjustmentStatus?/inspectionCompleted
  - `PendingReviewRequestDto`: 확인요청 섹션 1행 — `requestId`/`workId`/`documentNo`/`materialName`/`method`/`inspectionId`/`reason`/`requestedAt?`
  - `WorkInspectionDataResponse`: GET 응답. `rows`에 더해 `pendingReviewRequests: PendingReviewRequestDto[]`를 포함한다.
  - `WorkInspectionAction`: complete | adjustment(`requestId`/`status`/`inspectionId?` — `inspectionId`가 있으면 검수 항목 1건만 처리) | request_review(모바일 검수 진행 중 확인요청. 실패 후 검수 취소도 포함. `inspectionId`/`reason?`/`label?`)
  - `WorkInspectionActionResponse`: PATCH 응답
- `lib/types/domain.ts`
  - `Work`
  - `WorkInspectionStage`: `"start" | "complete"`(신규). 마이그레이션 전 행에는 DB 값이 없어 `WorkInspection.stage`는 옵셔널이며 미지정 시 `"start"`로 취급한다.
  - `WorkInspection`: method(`"OCR" | "VISION" | "PRODUCT"`, `PRODUCT`는 완료제품사진 전용 신규 값)/status/stage?/ocr_result_text/vision_similarity/result_summary/attempt_count
  - `InspectionImage`: `image_type`은 `ocr_capture` | `vision_capture` | `admin_review` | `product`(제품검수 제출 API가 저장) | `completion_photo`(완료검수 사진 제출 API가 저장, 신규)
  - `AdminReviewRequest`: `created_at?: string` 필드 추가(DB 컬럼은 원래 있었으나 타입에는 없었다. 확인요청 섹션의 요청시각 표시용)

## 주의사항
- OCR/비전 검수 패널 4종(`OcrInspectionPanel`/`VisionInspectionPanel`/`AdminReviewPanel`, 그리고 `WorkProgressTimeline`)은 저장소에 존재하지만 `app/` 어디서도 렌더링되지 않는 미사용 코드다. `AdminReviewPanel`은 내부적으로 "TODO: admin_approved 업데이트" 등 미구현 버튼(toast만 호출)을 포함하고 있어, 실제 조정 처리 로직은 이 컴포넌트가 아니라 `app/api/work-inspection/route.ts`의 PATCH 핸들러에 구현되어 있다.
- `AdjustmentReviewModal`의 "검수 이미지" 영역은 플레이스홀더 박스와 `storage_path` 텍스트만 표시하며 실제 이미지(Supabase Storage) 렌더링 코드는 없다.
- PATCH `adjustment`에서 `requestId`가 `"virtual-"`로 시작하는 경우는 GET 핸들러가 `work.status === "admin_review_requested"`인데 `admin_review_requests` 테이블에 실제 행이 없을 때 만들어내는 가상 요청이며, 이 경우 `admin_review_requests` update는 스킵되고 `works`/`work_inspections`만 갱신된다. 확인요청 섹션은 실제 요청 행만 다루므로 이 가상 요청을 만나지 않는다.
- PATCH `request_review`로 모바일에서 생성한 요청은 `admin_review_requests`에 실제 행이 insert되므로(`requester_id`는 uuid 컬럼이라 항상 `NULL`로 저장) 위 "virtual-" 가상 요청과 달리 정식 `requestId`를 가지며, 확인요청 섹션(검수 항목 단위) 또는 기존 `AdjustmentReviewModal`(work 단위)로 처리된다.
- PATCH `adjustment`에 `inspectionId`를 넘겨 항목 1건만 처리한 경우, 같은 work에 다른 확인요청이 아직 남아있으면 `works.status` update를 건너뛴다(work 상태는 `admin_review_requested` 유지). `inspectionId` 없이 호출하는 기존 `AdjustmentReviewModal`은 한 번에 work의 `admin_requested` 검수 항목 전체를 처리하므로 이 조건에 걸리지 않는다(처리 직후 남은 항목이 0건).
- "검수승인"으로 `admin_approved`가 된 검수 항목은 `lib/server/inspection-status.ts`의 `getInspectionAggregateStatus()`(수정하지 않음, 참고만)에서 `passed`와 동일하게 합격으로 집계된다. work의 나머지 검수 항목이 모두 `passed`/`admin_approved`가 되어야 그 work의 검수 집계 상태가 `completed`가 된다(work-status/모바일 작업현황이 사용).
- `/api/ocr`가 Google Vision을 쓰려면 `OCR_PROVIDER=google-vision`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_CLIENT_EMAIL`, `GOOGLE_CLOUD_PRIVATE_KEY` 환경변수가 모두 필요하며, 하나라도 없으면 항상 mock 응답으로 폴백된다.
