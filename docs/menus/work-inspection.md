# 작업검수 (`app/(workspace)/work-inspection`)

## 개요
현장(모바일)에서 진행한 OCR/비전 검수 이력을 표로 확인하고, 관리자가 "검수완료" 처리 또는 현장에서 올라온 OCR/비전 불일치 확인 요청(조정확인)을 승인/재검수요청/미승인 처리하는 화면이다.

## 화면 구조
`app/(workspace)/work-inspection/page.tsx`(클라이언트 컴포넌트) 구성:
- `PageHeader` — 제목/설명만, 별도 액션 버튼 없음
- 데이터 소스 배지 바(`supabase`/`mock`/연결 확인 중/연결 오류) — 연결 오류 시 "다시 시도" 버튼으로 `loadRows` 재호출
- `CuteCard` 목록 테이블 — 등록일자/작업구분/문서번호/완성품코드·명/작업수량/검수단계/검수처리/조정확인. "검수대상" 건수 배지 표시
  - 검수단계 배지 색상은 `getStepClassName`(문자열 포함 여부로 분기: 완료/승인→초록, 대상→보라, 보류/취소→회색, 요청→주황, 불일치/재검수→빨강, 진행/모바일→하늘)
  - 검수처리 컬럼: `CloudButton`으로 "검수완료" 처리(`work.status`가 `canceled`/`completed`면 비활성화)
  - 조정확인 컬럼: `row.request`가 있으면 상태 배지 버튼(`adjustmentLabels`: requested/approved/rejected/retry_requested)으로 `AdjustmentReviewModal` 오픈, 없으면 "요청없음" 배지
- `AdjustmentReviewModal` — 작업 기본정보(`InfoItem` 4종) + 현장 확인 요청 사유 + 검수방식/판정상태/OCR·비전 결과/**검증값(기대값)**/요약 표(`row.inspections`) + 검수 이미지 미리보기(현재는 플레이스홀더 박스, `image?.storage_path` 텍스트만 표시) + 조정승인/재검수 요청/조정 미승인 버튼
  - **검증값(기대값) 컬럼**: 검수 항목의 `material_id`로 연결된 부자재의 `material_masters.verification_value`(모바일 OCR 등록 검수값)를 참고용으로 보여준다. 값이 없으면 "-". 판정 로직에는 관여하지 않는 순수 표시용 컬럼이다.
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`

## 검수 행(`work_inspections`) 생성 출처
이 화면과 모바일이 읽는 `work_inspections` 행은 **작업등록(work-register) 화면의 담당자 배정 시점**에 자동 생성된다. `app/api/work-register/[workId]/assign/route.ts`의 PATCH가 배정 update 성공 직후 `work_master_materials`(해당 작업의 `work_master_id` 기준, `inspection_order` 순)를 조회해 부자재별로 `material_masters.inspection_method`에 따라 검수 행을 만든다: `OCR`/`VISION`은 1건, `BOTH`는 `OCR`·`VISION` 각 1건(`status: "pending"`, `attempt_count: 0`). 이미 해당 `work_id`에 검수 행이 있으면(재배정 포함) 다시 만들지 않는다(멱등). 작업마스터에 부자재 구성이 없거나 작업마스터가 연결되지 않은 작업은 검수 행이 생기지 않는다. 상세는 `docs/menus/work-register.md`의 PATCH 설명 참고.

## 데이터 흐름
- 페이지 로드/재조회(`loadRows`): `GET /api/work-inspection?department_id=&shipper_id=` 호출
  - 응답(`WorkInspectionDataResponse`)의 `rows`/`source`를 `tableRows`/`dataSource`로 반영
- 검수완료: `PATCH /api/work-inspection` (body: `{ workId, action: { type: "complete" } }`)
  - 성공 시 `loadRows()` 재호출
- 조정 처리: `PATCH /api/work-inspection` (body: `{ workId, action: { type: "adjustment", requestId, status } }`)
  - 성공 시 `loadRows()` 재호출

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
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작). 화면은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전 목록 유지).
- PATCH `complete`
  - `.from("works")`를 `status: "in_progress"`, `latest_inspected_at`으로 update
- PATCH `adjustment` 처리 순서
  1. `.from("admin_review_requests")`를 `status`/`processed_at`/`admin_comment`로 update
     - `requestId`가 `"virtual-"`로 시작하면 이 update는 건너뜀(DB에 실제 요청 행이 없는 가상 요청이므로)
  2. `.from("work_inspections")`에서 `work_id` + `status = "admin_requested"` 조건으로 `admin_approved`/`retrying`/`failed`로 update
  3. `.from("works")`를 `status`(approved→in_progress, retry_requested/rejected→inspection_failed)와 `latest_inspected_at`으로 update

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
  4. `canVerify`가 `false`(OCR 환경변수 미설정 등)이면 **DB를 전혀 변경하지 않고** 현재 `status`를 그대로 반환한다(`{ status: 기존값, recognizedText: "", expectedValue, matched: false, canVerify: false }`).
  5. `canVerify`가 `true`이면 인식 텍스트와 `expectedValue`를 각각 trim 후 대소문자 무시 비교(`normalize(a) === normalize(b)`)하여 일치하면 `status: "passed"`, 불일치하면 `status: "failed"`로 판정한다.
  6. 판정 후 스토리지 버킷 `inspection-images`(없으면 `material-images`와 동일한 패턴으로 자동 생성, `public: false`, 8MB 제한, jpeg/png/webp만 허용)에 `{workId}/{inspectionId}/{timestamp}-ocr.jpg` 경로로 크롭본을 업로드하고, `work_inspections`를 `status`/`ocr_result_text`(인식 텍스트)/`result_summary`(예: `"OCR 일치 (기대값: xxx)"`)/`attempt_count`(+1)/`updated_at`으로 update한 뒤 `inspection_images`에 `image_type: "ocr_capture"` 행을 insert한다(`metadata`에 `roi`/`expectedValue`/`recognizedText`/`matched` 저장).
  7. 업로드 후 `work_inspections`/`inspection_images` 저장이 실패하면 `material-master/registration` 라우트와 동일한 보상 패턴으로 업로드된 파일을 스토리지에서 제거한 뒤 원래 에러를 반환한다.
- 응답: `{ status, recognizedText, expectedValue, matched, canVerify }` (+ `source: "supabase" | "mock"`).
- mock 모드(`NEXT_PUBLIC_USE_MOCK_DATA !== "false"` 또는 Supabase 미설정)에서는 DB를 건드리지 않고 `appRepository`의 mock 검수/부자재 데이터로 그럴듯한 성공 응답(`source: "mock"`)만 반환한다.
- 필수값(`inspectionId`/`workId`/`image`/`roi`) 누락 시 `400`을 반환한다.

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
  - `WorkInspectionDataResponse`: GET 응답
  - `WorkInspectionAction`: complete | adjustment
  - `WorkInspectionActionResponse`: PATCH 응답
- `lib/types/domain.ts`
  - `Work`
  - `WorkInspection`: method/status/ocr_result_text/vision_similarity/result_summary/attempt_count
  - `InspectionImage`
  - `AdminReviewRequest`

## 주의사항
- OCR/비전 검수 패널 4종(`OcrInspectionPanel`/`VisionInspectionPanel`/`AdminReviewPanel`, 그리고 `WorkProgressTimeline`)은 저장소에 존재하지만 `app/` 어디서도 렌더링되지 않는 미사용 코드다. `AdminReviewPanel`은 내부적으로 "TODO: admin_approved 업데이트" 등 미구현 버튼(toast만 호출)을 포함하고 있어, 실제 조정 처리 로직은 이 컴포넌트가 아니라 `app/api/work-inspection/route.ts`의 PATCH 핸들러에 구현되어 있다.
- `AdjustmentReviewModal`의 "검수 이미지" 영역은 플레이스홀더 박스와 `storage_path` 텍스트만 표시하며 실제 이미지(Supabase Storage) 렌더링 코드는 없다.
- PATCH `adjustment`에서 `requestId`가 `"virtual-"`로 시작하는 경우는 GET 핸들러가 `work.status === "admin_review_requested"`인데 `admin_review_requests` 테이블에 실제 행이 없을 때 만들어내는 가상 요청이며, 이 경우 `admin_review_requests` update는 스킵되고 `works`/`work_inspections`만 갱신된다.
- `/api/ocr`가 Google Vision을 쓰려면 `OCR_PROVIDER=google-vision`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_CLIENT_EMAIL`, `GOOGLE_CLOUD_PRIVATE_KEY` 환경변수가 모두 필요하며, 하나라도 없으면 항상 mock 응답으로 폴백된다.
