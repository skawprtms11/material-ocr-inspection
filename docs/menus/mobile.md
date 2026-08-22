# 모바일 현장 검수 (`app/mobile`)

## 개요
`app/mobile` 하위는 현장 작업자가 스마트폰 브라우저에서 사용하는 8개 화면으로 구성된다. `app/mobile/layout.tsx`가 모든 화면을 `MobileShell`로 감싸고, `MobileShell` 내부의 `MobileScopeInitializer`가 부서/화주 스코프(`useFilterStore`)를 자동으로 세팅한 뒤 children을 렌더링한다. 헤더 우측에는 `MobileScopeBadge`가 현재 부서·화주명을 작게 표시하며(모든 모바일 화면 공통), 탭하면 설정 탭으로 이동한다. 코드상 실제로는 두 갈래의 검수 플로우가 공존한다.
- 홈(`/mobile`, `MobileInspectionWorkflowPage`): 문서 스캔 → 제품검수(체크리스트+사진, method가 `OCR`인 검수 대상은 실동작 OCR 검수 카드) 탭을 자체 내장한 단일 페이지 플로우. `method`가 `OCR`이 아닌 대상(비전 등)의 사진 저장은 여전히 storagePath 문자열만 만드는 mock 처리이며 실제 업로드 API 호출이 없다.
- `/mobile/scan` → `/mobile/inspection/[workId]` → `/mobile/sign/[workId]` → `/mobile/result/[workId]`: 바코드/문서번호로 작업을 찾은 뒤 STEP별 검수 상세, 서명, 결과 화면으로 이어지는 별도 플로우. 이 플로우의 재검수·관리자 요청·촬영 검수 버튼은 `toast`만 띄우는 mock이며 실제 저장 로직은 없다(`app/mobile/inspection/[workId]/page.tsx`).

두 플로우 모두 하단 탭바(`MobileShell`)의 "작업검수"(`/mobile`) 메뉴로는 홈 플로우만 연결되어 있고, `/mobile/scan` 이하 라우트는 `BarcodeScannerPanel` 내부 라우팅으로만 진입 가능하다(하단 탭바에는 링크가 없음).

## 화면 플로우
```
[하단 탭: 작업검수] /mobile (홈, 탭 UI: 작업문서스캔 → 제품검수 → 완료)
[하단 탭: 작업현황] /mobile/status  (읽기 전용 현황 리스트, 연/월 select로 조회)
[하단 탭: 부자재등록] /mobile/material-photo (OCR/비전 등록)
[하단 탭: 설정] /mobile/settings (현재 사용자 정보 + 부서/화주 설정)

/mobile/scan (바코드/문서번호 검색)
   └─ 매칭 성공 시 router.push
      → /mobile/inspection/[workId] (STEP별 검수 상세, mock 액션)
         └─ 전체 합격/승인 시 이동 가능
            → /mobile/sign/[workId] (서명 패드)
               └─ 저장 시 자동 이동
                  → /mobile/result/[workId] (결과 요약 + 컨페티)
                     └─ "다음 문서 검수" 버튼
                        → /mobile/scan
```
- `layout.tsx`: 모든 화면 공통 래퍼. 하단 탭 4개(`작업검수`/`작업현황`/`부자재등록`/`설정`)만 노출한다.
- `/mobile` (홈): 문서번호로 작업을 스캔하고 제품 체크리스트+사진 촬영을 진행하는 자체 완결형 화면.
- `/mobile/scan`: 문서번호 검색 전용 진입점(`BarcodeScannerPanel`).
- `/mobile/inspection/[workId]`: 부자재별 STEP 검수 카드(재검수/관리자요청 mock 버튼).
- `/mobile/sign/[workId]`: 작업자 서명 캡처.
- `/mobile/result/[workId]`: 검수 결과 요약과 다음 문서 이동.
- `/mobile/status`: 연/월 select(기본값 이번달)로 조회하는 작업 현황 요약(진행/확인필요/완료/취소 카운트 + 목록).
- `/mobile/settings`: 로그인 사용자 표시 + 부서/화주 스코프 선택(select, 즉시 적용) + 카메라 권한/알림 안내(정적).

## 화면별 상세

### 1. `app/mobile/layout.tsx`
- 컴포넌트: `MobileShell`
- 하는 일: 헤더(로고 + `/work-register`로 가는 홈 아이콘), 본문(`MobileScopeInitializer`로 스코프 초기화 후 children), 하단 탭바(4개 메뉴), `sonner`의 `Toaster`(전역 토스트 렌더러) 렌더링. `Toaster`가 없으면 `toast()` 호출이 화면에 표시되지 않으므로, 이 파일이 모바일 전체에서 `toast`가 실제로 보이게 하는 유일한 지점이다.
- 다음 화면 조건: 하단 탭 클릭 시 해당 라우트로 즉시 이동(추가 조건 없음).

### 2. `app/mobile/page.tsx` (홈, `MobileInspectionWorkflowPage`)
- 경로: `/mobile`
- 주요 컴포넌트: `CloudButton`, `CuteCard`, `OcrInspectionCard`(`components/mobile/OcrInspectionCard.tsx`), `useMobileInspectionRows`, `useMobileMaterials`
- 하는 일: `tab` 상태(`scan`/`product`/`done`)로 3단계 진행. scan 탭에서 문서번호를 입력하면 `rows`(작업검수 데이터) 중 `document_no`가 일치하는 행을 찾아 `scannedRow`로 저장. product 탭에서는 대상(`target`)별로 `scannedRow.inspections`에서 같은 id의 검수 항목을 찾아 `method`를 확인한다.
  - **`method === "OCR"`인 대상**: `OcrInspectionCard`를 렌더링해 실동작 OCR 검수를 수행한다(아래 "OCR 검수 카드" 참고). 체크리스트 3개 체크는 요구하지 않는다.
  - **그 외(비전 등)**: 기존과 동일하게 제품코드/제품명/LOT 체크 3개를 모두 체크해야(`isProductReady`) 사진 촬영 input이 활성화되고, 촬영하면 `storagePath`(예: `inspection-images/{workId}/products/{materialCode}-{fileName}`) 문자열만 로컬 상태에 채워 "서버 저장 mock 완료"로 표시한다(실제 업로드 없음, 기존 동작 유지).
- 완료 판정(`completedCount`): OCR 대상은 최신 `inspection.status`가 `passed` 또는 `admin_approved`일 때 완료로 집계하고, 그 외 대상은 기존 `isProductSaved`(체크 3개 + storagePath 존재) 기준을 그대로 사용한다.
- 다음 화면 조건: 별도 라우트 이동은 없다(같은 페이지 내 탭 전환). "검수시작" 버튼은 `scannedRow`와 `targets.length > 0`일 때 활성화되어 product 탭으로 전환. "제품검수 완료" 버튼은 `targets` 전원이 완료 상태일 때 활성화되어 done 탭으로 전환. done 탭의 "다음 작업문서 스캔"은 상태를 초기화하고 scan 탭으로 복귀.

**검수 카드가 뜨는 조건**: product 탭의 검수 대상(`target`)은 `scannedRow.inspections`(작업검수와 동일한 `work_inspections`)에서 온다. 이 행은 관리자 웹 작업등록(work-register) 화면에서 담당자를 배정할 때 자동 생성되므로(`docs/menus/work-inspection.md`의 "검수 행 생성 출처" 참고), **배정되지 않은 작업이거나 작업마스터에 부자재 구성이 없는 작업은 `inspections`가 비어 있어 product 탭에 아무 카드도 뜨지 않는다**("검수시작" 버튼도 `targets.length > 0`이 아니면 비활성화). `method === "OCR"`인 항목만 `OcrInspectionCard`(실동작)로 렌더링되고, 그 외(`VISION` 등)는 기존 체크리스트+사진 mock UI로 렌더링된다.

#### OCR 검수 카드 (`components/mobile/OcrInspectionCard.tsx`)
- 부자재마스터에 등록된 **기준 사진**을 먼저 보여준 뒤 촬영하는 실동작 카드. 마운트 시 `GET /api/material-master/registration?material_id={inspection.material_id}`를 호출해 `method === "OCR"`이고 `imageUrls.length > 0`인 region을 찾는다.
  - region이 있으면: 첫 번째 등록 이미지 위에 저장된 ROI를 퍼센트 좌표 절대배치 오버레이로 표시하고("표시된 위치가 보이도록 촬영하세요"), `material.verification_value`(없으면 `region.expected_text`)를 검증값으로 함께 보여준다.
  - region이 없거나 조회 오류면: "기준 사진 미등록 — 부자재등록에서 먼저 등록하세요" 경고만 표시하고 촬영 UI 자체를 렌더링하지 않는다(등록 없이는 촬영 불가).
- 촬영: 카메라 input(`capture="environment"`)으로 찍은 원본 사진을 등록된 ROI로 `lib/utils/image-crop.ts`의 `cropImageFile`을 사용해 즉시 캔버스 크롭 → 크롭본 미리보기 표시.
- 검수 실행: `inspectionId`/`workId`/`image`(크롭본)/`roi`(등록 ROI)를 FormData로 `POST /api/work-inspection/ocr`에 전송. 응답(`status`/`recognizedText`/`expectedValue`/`matched`/`canVerify`)을 카드 하단에 합격(초록)/불합격(빨강)/판정불가(주황, `canVerify: false`) 배지로 표시하고, 성공 시 `onSubmitted`(=`useMobileInspectionRows().refetch`)를 호출해 상단 상태 배지(대기/합격/불합격)를 최신 `work_inspections.status`로 갱신한다.
- 불합격이어도 "촬영" 버튼으로 즉시 재촬영 후 재실행할 수 있다(재실행마다 서버에서 `attempt_count`가 1씩 증가).

### 3. `app/mobile/scan/page.tsx`
- 경로: `/mobile/scan`
- 주요 컴포넌트: `BarcodeScannerPanel`
- 하는 일: `useMobileWorkStatusRows`로 작업현황 목록을 불러와, 문서번호 입력값과 `findWorkByDocumentNo`로 매칭. 카메라 바코드 스캔은 미구현(TODO 주석: `BarcodeDetector` 또는 `@zxing/browser` 연결 예정).
- 다음 화면 조건: "작업 찾기" 클릭 시 매칭된 `row.work.id`로 `router.push(/mobile/inspection/{workId})`. 매칭 실패 시 에러 메시지만 표시하고 이동하지 않는다.

### 4. `app/mobile/inspection/[workId]/page.tsx`
- 경로: `/mobile/inspection/[workId]`
- 주요 컴포넌트: `ImageUploadCard`, `StatusBadge`, `CloudButton`
- 하는 일: `findInspectionById(rows, workId)`로 해당 작업의 `inspections` 배열을 STEP 카드로 렌더링. 각 카드는 `ImageUploadCard`(파일 input만 있고 `onChange` 핸들러 없음 = 실제 업로드 로직 없는 정적 UI)와 "재검수"/"관리자 요청"/"촬영 후 mock 검수" 버튼(모두 `toast`만 호출, 실제 상태 변경 없음)을 보여준다.
- 다음 화면 조건: `allPassed`(검수 항목이 1개 이상이고 전부 `passed` 또는 `admin_approved`)일 때만 "서명 단계로 이동" 버튼이 활성화되어 `/mobile/sign/{workId}`로 이동.

### 5. `app/mobile/material-photo/page.tsx`
- 경로: `/mobile/material-photo`
- 주요 컴포넌트: 페이지 내부 정의 `OcrRegistration`, `VisionRegistration`, `TouchRegionSelector`(직접 구현한 드래그/리사이즈 ROI 선택기)
- 하는 일: 관리자웹에서 등록된 부자재(`useMobileMaterials`) 목록을 조회 필터(코드/명/LOT)와 등록상태(전체/등록/미등록)로 조회. 부자재를 선택하면 OCR 등록 또는 비전 등록 화면으로 전환된다.
  - OCR 등록: 사진 1장 촬영 → `TouchRegionSelector`로 읽을 영역(ROI) 지정 → `cropImageFile`로 캔버스 크롭 → `/api/ocr`에 FormData POST → OCR 검토(`ocrReviewed`)가 끝나면 저장 가능 여부는 **부자재코드 일치 여부와 무관**하다: 서버 검증이 가능(`canVerify: true`)하면 인식 텍스트가 비어있지 않아야 저장 가능, 서버 검증이 불가(`canVerify: false`, OCR 미설정 등)하면 검토 완료 상태에서 경고 배지와 함께 저장 가능(이 경우 인식 텍스트는 항상 빈 문자열). 부자재코드와의 일치 여부(`matched`)는 "코드와 일치"/"코드와 다름" 참고용 뱃지로만 표시하며 저장을 막지 않는다 → 저장 시 인식된 텍스트(`recognizedText`, 빈 문자열 포함)가 그대로 `/api/material-master/registration`에 POST되어 `material_masters.verification_value`(작업검수 검수 기준값)에 저장된다.
  - 비전 등록: 사진 최대 5장을 `browser-image-compression`으로 압축(0.8MB, 1600px, 품질 0.82) 후 사진별로 ROI 확정 → 5장 모두 확정되면 250ms 디바운스 후 클라이언트에서 24x32 그레이스케일 샘플 기반 유사도(`getVisionSignature`/`compareVisionSignatures`)를 계산해 화면에만 표시(서버 검증 아님) → 저장 시 `/api/material-master/registration`에 5장 모두 FormData POST.
  - 삭제: `/api/material-master/registration` DELETE 호출.
  - 검증값 표시: 목록 행과 등록 방식 선택 화면(부자재 상세)에 `material.verification_value`가 있으면 "검증값 {값}" 한 줄을 초록색 텍스트로 보여준다(읽기 전용, 이 화면에서 직접 입력하는 필드는 아니고 OCR 등록 저장 결과가 반영된 값).
- 다음 화면 조건: 별도 라우트 이동 없음. "목록으로" 버튼으로 목록 화면 복귀, 저장 성공 시 같은 화면에 "등록 저장 완료" 배지 표시.

### 6. `app/mobile/sign/[workId]/page.tsx`
- 경로: `/mobile/sign/[workId]`
- 주요 컴포넌트: `SignaturePad`
- 하는 일: `findInspectionById`로 작업을 확인 후, `SignaturePad`(canvas pointer 이벤트로 서명 그리기, 초기화 버튼)를 렌더링. 안내 문구에 "signatures bucket의 signatures/{workId}/worker-signature.png 구조로 저장됩니다"라고 명시되어 있으나, 실제 `onSave` 콜백은 `toast.success("서명 저장 mock 완료")`만 호출하고 업로드 API 호출은 없다.
- 다음 화면 조건: "저장" 버튼 클릭(`onSave`) 즉시 `/mobile/result/{workId}`로 라우팅(별도 검증 조건 없음).

### 7. `app/mobile/result/[workId]/page.tsx`
- 경로: `/mobile/result/[workId]`
- 주요 컴포넌트: `canvas-confetti`(동적 import), `CuteCard`
- 하는 일: `findInspectionById`로 작업의 `inspections`를 상태별(합격/불합격/관리자 승인)로 집계해 요약 표시. 마운트 시 `canvas-confetti`로 축하 효과를 1회 실행.
- 다음 화면 조건: "다음 문서 검수" 버튼 클릭 시 `/mobile/scan`으로 이동(조건 없음).

### 8. `app/mobile/status/page.tsx`
- 경로: `/mobile/status`
- 주요 컴포넌트: `StatusBadge`
- 하는 일: `useMobileWorkStatusRows`로 작업 목록을 불러온 뒤, 상단 년도/월 `select` 2개(기본값은 `lib/utils/date.ts`의 `getCurrentYearMonth()` = 오늘 기준 연/월, select 스타일은 `/mobile/settings`의 select 패턴을 따름)로 선택한 연/월과 `work_date`가 일치하는 작업만 클라이언트에서 필터해 표시한다. 연도 선택지는 웹 `work-status/page.tsx`와 같은 방식(조회된 rows에 등장하는 연도 + 현재 연도 합집합, 내림차순)으로 구성되고, 월은 01~12 고정이며, 연/월 일치 판정은 `lib/utils/date.ts`의 `isYearMonthMatch`를 웹과 공유해서 쓴다. 카운트 카드는 각 행의 `displayStatus`(`GET /api/work-status`가 `lib/constants/status.ts`의 `getDisplayStatus`로 계산해 내려주는 값)를 기준으로 4종 집계한다: 진행(`waiting`+`progress`) / 확인필요(`hold`) / 완료(`complete`, `passed` 포함) / 취소(`cancel`). 네 카드 합계는 선택된 연/월로 필터된 전체 건수와 같다. 읽기 전용이며 목록 항목 클릭 동작은 없다.
- 다음 화면 조건: 없음(다른 화면으로 이동하는 버튼/링크 없음).

### 9. `app/mobile/settings/page.tsx`
- 경로: `/mobile/settings`
- 하는 일: `/api/users`를 호출해 `email === "admin@example.com"` 또는 `role === "admin"`인 사용자, 없으면 첫 번째 사용자를 `pickCurrentUser`로 골라 이름/이메일을 표시. 같은 응답의 `departments`/`shippers`를 재사용해 "부서/화주 설정" 카드에서 부서·화주를 select로 고를 수 있다(별도 API 재호출 없음). 선택지는 `MobileScopeInitializer`와 동일한 기준(`is_active` + 현재 사용자의 `department_ids`/`shipper_ids` 권한, 권한 배열이 비어 있으면 전체 허용)으로 필터링하며, 화주 목록은 선택된 부서 소속만 노출한다. 부서를 바꾸면 그 부서에서 허용된 첫 화주로 자동 재설정된다. select를 바꾸면 저장 버튼 없이 즉시 `useFilterStore.setScope`로 반영되고 `lib/mobile/mobile-scope-storage.ts`의 `saveMobileScope`로 `localStorage`(`harness.mobile-scope.v1`)에 저장한 뒤 "적용되었습니다" 토스트(sonner)를 띄운다. 카메라 권한("브라우저 설정 사용")과 알림("준비중") 항목은 정적 텍스트만 있고 실제 토글 기능이 없다.
- 다음 화면 조건: 없음.

## 데이터 흐름
`lib/mobile/mobile-api.ts`는 `useFilterStore`의 `departmentId`/`shipperId`를 쿼리스트링에 실어 `fetch`하는 공통 훅 `useScopedMobileData`를 기반으로 3개의 훅을 제공한다. 응답이 `!response.ok`이거나 JSON에 `error`가 포함되면(실DB 모드에서 API가 mock 폴백 없이 `502 { error }`를 반환하는 경우 포함) `error` 상태로 노출하고 mock 데이터를 보여주지 않는다. 반환값에 `reload`/`refetch`(동일 함수의 별칭) 함수가 포함되어 있으며, 홈(`/mobile`)·작업현황(`/mobile/status`)·부자재등록(`/mobile/material-photo`) 화면은 오류 배지 옆에 "다시 시도" 버튼을 두어 이 함수를 호출한다.

| 함수 | 호출 API | 응답에서 읽는 Supabase 테이블(각 API 라우트 코드 기준) |
|---|---|---|
| `useMobileWorkStatusRows()` | `GET /api/work-status?department_id&shipper_id` | `works` (+ `work-master-supabase-repository`가 조회하는 워크마스터 테이블) |
| `useMobileInspectionRows()` | `GET /api/work-inspection?department_id&shipper_id` | `works`, `work_inspections`, `inspection_images`, `admin_review_requests` |
| `useMobileMaterials()` | `GET /api/material-master?department_id&shipper_id[&material_id]` | `material_masters` |

홈(`/mobile`)의 OCR 검수 카드(`OcrInspectionCard`)가 추가로 호출하는 API:
- `GET /api/material-master/registration?material_id=...` — 기준 사진(ROI 포함) 미리보기 조회. 부자재마스터 화면과 동일한 라우트를 재사용한다.
- `POST /api/work-inspection/ocr` — `inspectionId`, `workId`, `image`(ROI로 크롭된 촬영본), `roi`(JSON)를 FormData로 전송. 상세 동작은 `docs/menus/work-inspection.md`의 "OCR 검수 제출 API" 참고.

부자재등록 화면(`material-photo`)이 추가로 호출하는 API:
- `POST /api/ocr` — `image`(크롭된 File), `expectedText`, `roi` 등을 FormData로 전송. `OCR_PROVIDER=google-vision` 환경변수와 Google Cloud 서비스계정 자격증명이 없으면 `mockOcr()`로 `matched: false, canVerify: false` 응답만 반환. Google Vision 호출 로직은 `lib/server/ocr.ts`의 `runOcr()`로 추출되어 있으며, 홈 화면의 `POST /api/work-inspection/ocr`도 같은 함수를 공유한다(두 라우트 모두 이 함수 하나로 Google Cloud Vision을 호출).
- `POST /api/material-master/registration` — `materialId`, `method`(OCR|VISION), `roi`, `expectedText`, `recognizedText`, `similarity`, `images`(File[])를 FormData로 전송. Supabase 사용 시 `material-images` 스토리지 버킷에 `mobile/{materialId}/{method}/{timestamp}-{index}-{fileName}.{ext}` 경로로 업로드(`ensureMaterialImageBucket`이 버킷을 없으면 자동 생성, `public: false`, 8MB 제한, jpeg/png/webp만 허용)한 뒤 `material_masters.ocr_image_path`/`vision_image_path`/`reference_image_path`를 갱신하고 `material_inspection_regions` 테이블에 ROI·인식결과를 upsert(기존 삭제 후 insert) 한다. `method === "OCR"`이면 `material_masters.verification_value`도 함께 갱신한다: OCR 등록 화면은 OCR 검토를 거쳤으므로 `recognizedText` FormData 필드를 값이 비어있어도 항상 전송하고, 서버는 그 값을 그대로(빈 문자열이어도) 저장한다. `recognizedText` 필드가 아예 전송되지 않은 요청(OCR 검토 없이 이미지만 등록하는 웹 관리자 플로우)만 `expectedText`(부자재코드)로 대신 채운다. 저장 완료 후 응답에 담긴 `material`(갱신된 `verification_value` 포함)로 `reload()`가 로컬 상태를 다시 채운다.
- `DELETE /api/material-master/registration` — `material_masters`의 이미지 경로 초기화 + `material_inspection_regions` 삭제.

설정/스코프 초기화 화면이 호출하는 API:
- `GET /api/users` — `app_users`, `departments`, `shippers`, `user_department_permissions`, `user_shipper_permissions` 테이블 조회. `MobileScopeInitializer`와 `settings` 페이지가 각각 별도로 호출한다.

이미지 업로드 실제 동작 여부는 화면마다 다르다.
- 부자재등록(OCR/비전), 홈 화면(`/mobile`)의 **OCR 검수 카드**가 실제로 서버(Supabase Storage)에 업로드된다(OCR 검수 카드는 `inspection-images` 버킷의 `{workId}/{inspectionId}/{timestamp}-ocr.jpg` 경로).
- 홈 화면(`/mobile`)의 `method`가 `OCR`이 아닌 제품 사진, `inspection/[workId]`의 `ImageUploadCard`, 서명 패드는 모두 storagePath 문자열 생성 또는 안내 문구만 있고 실제 업로드 fetch 호출이 코드에 없다(mock).

## 상태 관리
- `lib/state/filter-store.ts`의 `useFilterStore`(zustand, 부서/화주 스코프, persist 없음)를 모든 모바일 데이터 훅과 웹 `TopFilterBar`가 공유한다. 이 스토어 자체에는 영속화를 붙이지 않는다(웹 동작 변경 방지).
- `MobileScopeInitializer`의 초기화 우선순위: ① `lib/mobile/mobile-scope-storage.ts`(`localStorage` 키 `harness.mobile-scope.v1`)에 저장된 부서/화주가 있고 현재 사용자의 `department_ids`/`shipper_ids` 권한·`is_active` 기준으로 여전히 유효하면 그 값을 적용 ② 없거나 무효하면 기존 로직대로 이미 유효한 `currentScope`를 유지하거나, 그마저 없으면 권한 있는 첫 부서/화주로 자동 설정한다.
- `/mobile/settings`에서 부서/화주를 바꾸면 `useFilterStore.setScope`와 `saveMobileScope`(localStorage 저장, try/catch로 감쌈)가 함께 호출되어 즉시 반영·영속화된다. 저장 버튼은 없다.
- 웹 `components/layout/TopFilterBar.tsx`도 같은 `lib/mobile/mobile-scope-storage.ts`(같은 `localStorage` 키)를 재사용한다: 최초 로드 시 저장된 스코프가 유효하면 복원하고(무효/없음이면 기존처럼 첫 허용 항목 폴백), select로 부서/화주를 바꾸면 `saveMobileScope`로 저장한다. 따라서 같은 브라우저에서는 모바일 설정 탭에서 고른 화주(예: 민트하우스)가 웹 `TopFilterBar`에도 반영되고, 반대로 웹에서 바꾼 값도 모바일에 반영된다(더 이상 서로 독립적이지 않음).
- 화면 간 데이터 전달은 대부분 URL 파라미터(`[workId]`)와 서버 재조회로 이루어진다. 예: `/mobile/inspection/[workId]` → `/mobile/sign/[workId]` → `/mobile/result/[workId]`는 각 페이지가 자체적으로 `useMobileInspectionRows()`를 다시 호출해 `workId`로 `findInspectionById`를 수행하며, 클라이언트 전역 상태로 넘기는 값은 없다.
- 홈 화면(`/mobile`)의 스캔 결과/체크리스트/사진 상태(`scannedWorkId`, `photoStates`)는 `useState`로만 관리되는 로컬 상태이며, 새로고침하면 초기화된다. 저장소(localStorage 등)에 영속화하지 않는다. `OcrInspectionCard`의 촬영/판정 상태도 컴포넌트 로컬 `useState`이며, 판정 결과 자체는 서버(`work_inspections`)에 저장되므로 새로고침 후에도 상단 상태 배지는 최신값을 다시 불러온다.
- `lib/state/work-flow-store.ts`(`useWorkFlowState`, `assignWorkToInspection` 등, localStorage 키 `harness.work-flow.v1`)와 `lib/providers/inspection-provider.ts`(`mockInspectionProvider`)는 코드에서 `app/mobile/**`, `components/mobile/**` 어디에서도 import되지 않는다(grep 결과 0건). `work-flow-store`는 `app/(workspace)/work-register`, `work-status`(관리자 데스크톱 화면)에서만 사용되고, `inspection-provider`는 현재 어떤 화면에서도 사용되지 않는 미연결 코드다.

## 주의사항
- 두 개의 검수 플로우(홈 탭 UI 방식 vs `/mobile/scan` → `/mobile/inspection` 방식)가 코드상 동시에 존재하며 하단 탭바는 홈 플로우만 연결한다. `/mobile/scan` 계열은 `BarcodeScannerPanel`을 통해서만 진입 가능하고 다른 화면에서 이 경로로 가는 링크가 없다.
- `app/mobile/scan/page.tsx`와 `BarcodeScannerPanel`, 홈 화면 스캔 UI 모두 실제 카메라 바코드 인식은 미구현이며 문서번호 텍스트 입력으로만 동작한다(코드 주석: `TODO: BarcodeDetector 또는 @zxing/browser 카메라 스캐너 연결`).
- `app/mobile/inspection/[workId]/page.tsx`의 재검수/관리자 요청/촬영 검수 버튼과 `ImageUploadCard`는 `toast` 알림만 발생시키는 정적 UI이며, 클릭해도 검수 상태나 Supabase 데이터가 바뀌지 않는다(홈 화면의 OCR 검수 카드와는 별개의 미구현 플로우다).
- `SignaturePad.onSave`는 서명 이미지를 어디에도 저장하지 않고 즉시 다음 페이지로 이동한다. 안내 문구의 "signatures 버킷 저장"은 아직 코드로 연결되어 있지 않다.
- 홈 화면(`/mobile`)의 `method`가 `OCR`이 아닌 제품 사진 촬영은 여전히 압축·업로드가 실제로 일어나지 않고 `storagePath` 문자열만 만들어 "서버 저장 mock 완료"로 표시한다. `method === "OCR"`인 대상은 `OcrInspectionCard`가 실제로 크롭·업로드·판정·저장까지 수행한다(위 "OCR 검수 카드" 참고).
- 비전 등록의 일치율(`getVisionSignature`/`compareVisionSignatures`)은 클라이언트에서 24x32 그레이스케일 픽셀 차이로 계산하는 근사값이며, 서버로 전송되거나 저장 가능 여부를 막는 검증으로 쓰이지 않는다(참고용 표시일 뿐 저장 버튼 활성화 조건이 아님).
- OCR 등록은 `OCR_PROVIDER=google-vision` 환경변수와 `GOOGLE_CLOUD_PROJECT_ID`/`GOOGLE_CLOUD_CLIENT_EMAIL`/`GOOGLE_CLOUD_PRIVATE_KEY`가 모두 설정되어야 실제 Google Vision을 호출한다. 하나라도 없으면 `/api/ocr`는 `canVerify: false`, `extractedText: ""`인 mock 응답을 반환한다. 이 경우 프론트(`OcrRegistration`)는 검토 완료(`ocrReviewed`) 상태에서 저장을 허용하며, 화면에 "⚠️ OCR 서버 검증 불가 — 텍스트 검증 없이 저장됩니다" 경고 배지를 표시한다(이때 검증값은 빈 문자열로 저장됨). **부자재코드와 인식 텍스트의 일치(`matched`) 여부는 저장 조건이 아니다** — `canVerify`가 true인 정상 환경에서는 `ocrReviewed && 인식 텍스트가 비어있지 않음`이면 저장 버튼이 활성화되고, `matched`는 "코드와 일치"/"코드와 다름" 참고용 뱃지로만 노출된다. 저장되는 검증값은 항상 실제 인식된 텍스트(`recognizedText`)이며 부자재코드로 강제 치환되지 않는다.
- `lib/state/work-flow-store.ts`, `lib/providers/inspection-provider.ts`는 모바일 화면 어디서도 사용되지 않는다(코드 검색 기준). 향후 모바일 검수 플로우에 실제 저장 로직을 연결할 때 이 두 파일을 재사용할지, 새로 만들지 판단이 필요하다.
- `MobileScopeInitializer`와 `/mobile/settings`는 각각 독립적으로 `/api/users`를 호출한다. 두 화면을 동시에 열면 동일 데이터를 중복 조회한다.
