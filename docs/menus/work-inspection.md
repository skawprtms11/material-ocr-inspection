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
- `AdjustmentReviewModal` — 작업 기본정보(`InfoItem` 4종) + 현장 확인 요청 사유 + 검수방식/판정상태/OCR·비전 결과/요약 표(`row.inspections`) + 검수 이미지 미리보기(현재는 플레이스홀더 박스, `image?.storage_path` 텍스트만 표시) + 조정승인/재검수 요청/조정 미승인 버튼
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`

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
- 실DB 모드에서 GET 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다(mock 폴백은 mock 모드에서만 동작). 화면은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전 목록 유지).
- PATCH `complete`
  - `.from("works")`를 `status: "in_progress"`, `latest_inspected_at`으로 update
- PATCH `adjustment` 처리 순서
  1. `.from("admin_review_requests")`를 `status`/`processed_at`/`admin_comment`로 update
     - `requestId`가 `"virtual-"`로 시작하면 이 update는 건너뜀(DB에 실제 요청 행이 없는 가상 요청이므로)
  2. `.from("work_inspections")`에서 `work_id` + `status = "admin_requested"` 조건으로 `admin_approved`/`retrying`/`failed`로 update
  3. `.from("works")`를 `status`(approved→in_progress, retry_requested/rejected→inspection_failed)와 `latest_inspected_at`으로 update

**OCR/비전 검수 패널과 검수 영역(region) 편집 로직**: `components/inspection/OcrInspectionPanel.tsx`, `components/inspection/VisionInspectionPanel.tsx`, `components/inspection/InspectionRegionEditor.tsx`, `components/admin/AdminReviewPanel.tsx`가 저장소에 존재하지만, 실제 코드 검색(`grep -rn` 전체 리포지토리) 결과 이 4개 컴포넌트는 `app/(workspace)/work-inspection/page.tsx`를 포함해 **`app/` 전체 어디에서도 import되지 않는 미사용(고아) 컴포넌트**다. `InspectionRegionEditor`만 `app/(workspace)/material-master/page.tsx`(자재마스터 화면, region 등록용)에서 `mode="OCR"`/`mode="VISION"`으로 사용된다. 즉 작업검수 화면 자체는 이 패널들 대신 표 + `AdjustmentReviewModal`(검수방식/판정상태/OCR결과·비전유사도/요약을 텍스트 표로만 표시)로 검수 결과를 노출한다.

OCR 실제 호출은 `app/api/ocr/route.ts`(POST, `runtime = "nodejs"`)에서 이루어진다: `image`(File)/`expectedText`/`roi`/`originalRoi`/`isCropped`/`imageWidth`/`imageHeight`를 `FormData`로 받아, `process.env.OCR_PROVIDER === "google-vision"`이고 `GOOGLE_CLOUD_PROJECT_ID`/`GOOGLE_CLOUD_CLIENT_EMAIL`/`GOOGLE_CLOUD_PRIVATE_KEY`가 모두 있으면 서비스 계정 JWT로 OAuth 토큰을 발급받아 **Google Cloud Vision API**(`https://vision.googleapis.com/v1/images:annotate`, `TEXT_DETECTION` 기본)를 호출한다. `isCropped`가 아니면 `getRoiText()`로 전체 이미지 OCR 결과 중 ROI(%기준 좌표) 영역과 겹치는 단어만 필터링해 텍스트를 합성한다. 환경변수가 없으면 `mockOcr()`로 `provider: "mock"`, `matched: false`, `canVerify: false`를 반환한다. 이 라우트는 work-inspection 화면이 아니라 material-master의 검수 영역(ROI) 등록/검증 흐름에서 호출되는 것으로 보인다(work-inspection 관련 파일에서 `/api/ocr` 호출 코드는 발견되지 않음).

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
  - `InspectionTableRowDto`: work + registeredAt/workType/finishedProductCode·Name/quantity/inspectionStep/request?/inspections/images/adjustmentStatus?/inspectionCompleted
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
