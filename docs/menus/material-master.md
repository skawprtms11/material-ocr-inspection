# 부자재마스터 (`app/(workspace)/material-master`)

> 변경 이력(2026-10-18, 문서관리팀): 검수방식 `NONE`(사진검수, 신규 기본값)·허용값 검증(400)·기준 미등록 판정/경고 배지(`missing_reference`)·기준 이미지 등록 시 검수방식 자동 변경 제거·502 정리·검수방식 열을 코드 기준으로 반영함.

## 개요
선택된 부서/화주에 소속된 부자재(원재료) 목록을 조회하고, 등록/수정/삭제 및 OCR·비전 스캔용 기준 이미지를 업로드하는 화면이다. 부자재 기본정보 저장(`/api/material-master`)과 검수 이미지 업로드(`/api/material-master/registration`) 두 API를 조합해서 사용한다. 이 화면의 `inspection_method`(OCR·비전 체크)가 현장 검수 방식의 판정 기준이다 — BOTH=OCR+비전, 둘 다 미체크(`NONE`)=사진검수(작업자 사진 촬영 후 관리자 승인). 판정·검수 행 생성 규칙은 `docs/menus/work-inspection.md`의 "사진검수 + 작업승인 코어 규칙" 참고.

## 화면 구조
- `app/(workspace)/material-master/page.tsx` (`MaterialMasterPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `EmptyCloudState`, `TouchRegionSelector`(`components/mobile/`, 수정 없이 재사용). 신규 하위 파일(같은 폴더): `ReferenceRegisterModal.tsx`(등록/재등록 팝업), `ReferenceDetailModal.tsx`(등록 내역 팝업), `PasteImageInput.tsx`(붙여넣기·드롭·파일선택 입력), `reference-status.ts`(버튼 상태 판정)
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`를 렌더링.
- 부자재 테이블: 부자재코드, 부자재명, LOT, **검증값**, 검수방식, OCR등록, 비전스캔등록, 비고. 행 클릭으로 `selectedMaterialId` 지정.
  - **OCR등록/비전스캔등록 컬럼 = 상태 버튼**(`ReferenceButton`, 클릭 시 `stopPropagation`으로 행 선택과 분리). 판정은 `reference-status.ts`(실체는 `lib/inspection/reference-status.ts`, 모바일 부자재등록과 공용이며 이 파일은 re-export)의 `getReferenceButtonState`이며 "검수방식" 열의 `기준 미등록` 경고(`getMissingReferences`)와 같은 기준이다.
    - 등록(파랑): 방식 체크됨 + 이미지 경로 없음 → 등록 팝업
    - 등록완료(초록): 경로 있음 + 누락 없음 → 내역 팝업
    - 보완필요(주황): 체크됨 + 경로 있음 + 영역/검증값 누락 → 내역 팝업(누락 사유 강조)
    - 미사용(회색 비활성): 체크 안 됨 + 경로 없음 (툴팁: 수정에서 체크 시 등록 가능)
    - 등록완료(미사용)(회색 테두리): 체크 안 됨 + 경로 있음 → 내역 조회·재등록만 가능
  - **검증값 컬럼**(LOT 바로 우측): `material_masters.verification_value`를 그대로 표시하고 값이 없으면 "-"로 표시한다. 이 컬럼은 읽기 전용이다 — OCR 등록 팝업(웹) 또는 모바일 부자재등록(`/mobile/material-photo`)의 OCR 등록·저장에서만 갱신된다(아래 "검증값 데이터 흐름" 참조). 수정 모달(`MaterialEditorModal`)에도 수정 모드일 때 현재 검증값을 읽기 전용 한 줄로 함께 보여준다.
  - **검수방식 컬럼**(검증값 바로 우측): `inspectionMethodLabels`(OCR/비전/OCR + 비전/사진검수) 배지를 표시한다(`NONE`은 회색 "사진검수"). 체크한 방식의 기준이 비어 있으면(`getMissingReferences`가 1건 이상) 노란 "기준 미등록(OCR·VISION) — 현장 진행 불가 — 기준 등록 또는 체크 해제 필요" 경고 배지를 함께 보여준다(판정 규칙은 아래 "기준 미등록 판정").
- 부자재명 셀은 밑줄 스타일의 클릭 가능한 버튼이다. 클릭 시(`stopPropagation`으로 행 선택 로직과 분리) `MaterialImagePreviewModal`(읽기 전용 미리보기 모달)을 연다.
- 액션 버튼: 등록(`Plus`), 수정(`Pencil`, 선택된 행 필요), 삭제(`Trash2`, 선택된 행 필요), 모바일 사진등록 링크(`/mobile/material-photo?materialId=...`).
- `MaterialEditorModal`(내부 컴포넌트, `mode: "create" | "edit"`): 기본정보 폼(code/name/lot/remark, OCR·비전 사용여부 체크박스 — 신규 등록 기본값은 둘 다 해제(= 사진검수)이며 "둘 다 해제하면 사진검수로 운영" 안내문구를 표시)만 남았다. 기존 `ImageRegistrationPanel` 2개(이미지 파일 선택, 중복 name 체크박스)와 "등록 영역 미리보기"는 **제거**됐고, 기준 이미지 등록은 목록의 상태 버튼으로 일원화했다(저장 시 이미지 업로드·`ocrFile`/`visionFile` 없음). 저장 응답은 기존 행에 병합(`{...prev, ...saved}`)한다.
- `ReferenceRegisterModal`(등록/재등록 팝업, method=OCR|VISION 공용): 이미지는 **붙여넣기(window `paste` 이벤트, 이미지 항목이 없으면 텍스트 붙여넣기는 통과) 기본**, 드래그앤드롭·파일 선택·"클립보드에서 붙여넣기" 버튼 보조(`PasteImageInput`). `browser-image-compression`으로 최대 2400px/2MB 압축(원본 비율 유지, png/jpeg/webp만). 영역은 `TouchRegionSelector`(이미지 실제 비율을 `aspectRatio`로 지정, 대표=첫 이미지).
  - OCR: 영역 지정 → "텍스트 인식"(`cropImageFile`로 크롭 → `POST /api/ocr` FormData: `image`(크롭), `isCropped=true`, `roi`=전체, `originalRoi`, `expectedText`=부자재코드, `imageWidth/Height`, `departmentId`, `shipperId`, `materialId`) → 인식 원문을 검증값 입력란에 채움 → 사용자 수정 허용(원문과 다르면 "현장 OCR은 완전 일치해야 합격" 경고) → 저장. `provider=mock`/`canVerify=false`이면 "OCR 서버 mock — 실제 글자 아님" 안내를 표시한다. 저장 조건: 이미지 + 인식 1회 이상 + 검증값 비어있지 않음.
  - 비전: 이미지 1~5장(붙여넣기 반복 추가, 개별 삭제) + 대표 이미지 영역 → "비전 인식(미리보기)"(2장 이상일 때 `compareVisionRegions` 평균/최저 일치율, 참고용·저장 조건 아님) → 저장(`similarity` 평균 동봉).
  - 저장: `POST /api/material-master/registration` multipart(`departmentId`, `shipperId`, `materialId`, `method`, `expectedText`, `roi`(원본 기준 %), `source=web`, `imageWidth/Height`, `images`, OCR은 `recognizedText`=확정 검증값 + `ocrRawText`=인식 원문, 비전은 `similarity`). 원본(압축본) 이미지를 저장한다(크롭본 아님). 실패 시 팝업 유지 + 오류 문구(502는 "연결 오류 — 다시 시도").
  - 재등록 모드(`previousRoi` 전달): 기존 영역을 초기값으로 채우되 이미지는 새로 붙여넣어야 저장 가능, 저장하면 기존 기준 교체.
- `ReferenceDetailModal`(등록 내역 팝업): 열 때 `GET registration`으로 해당 method 영역을 조회해 기준 이미지(영역 오버레이, 비전은 최대 5장), 검증값·인식 원문·수정 여부(OCR) / 이미지 장수·참고 일치율(비전), 영역 좌표, 등록일·등록 경로(웹/모바일)를 표시한다. 누락 사유(이미지/영역/검증값 없음)와 모바일 크롭본 경고, mock 모드 "이미지 미보관" 문구를 보여주고 **재등록** 버튼으로 등록 팝업(재등록 모드)으로 전환한다. 조회 실패 시 "연결 오류" + "다시 시도". 등록 삭제 UI는 두지 않는다.
- `MaterialImagePreviewModal`(내부 컴포넌트): 부자재명 클릭으로 열리는 읽기 전용 모달. 열릴 때 `GET /api/material-master/registration?material_id=...`를 호출해 method별(OCR/VISION) 이미지와 ROI를 조회한다. OCR 섹션은 첫 번째 이미지 위에 저장된 ROI를 퍼센트 좌표 절대배치 오버레이(`RoiOverlayImage`)로 표시하고 `expected_text`/`options.recognizedText`를 캡션으로 보여준다. 비전 섹션은 이미지 최대 5장을 그리드로 표시하며 각 이미지에 동일한 저장 ROI(비전 등록 시 첫 번째 사진의 영역만 저장됨)를 오버레이한다. 로딩 중에는 스피너, 등록 이미지가 없으면 빈 상태 문구를 표시한다.

## 데이터 흐름
- 등록 영역 조회: `GET /api/material-master/registration?material_id=...`
  - mock: `appRepository.listMaterialRegions(materialId)`에 각 region마다 `imageUrls: []`를 붙여 반환.
  - Supabase: `.from("material_inspection_regions").select("*").eq("material_id", materialId)` 조회 후, region별로 `options.uploadedPaths`(없으면 `options.imagePath` 단건)에서 버킷 프리픽스(`material-images/`)를 제거한 상대 경로로 `supabase.storage.from("material-images").createSignedUrls(paths, 60 * 60)`(1시간 만료)를 호출해 `imageUrls: string[]`로 각 region에 병합한다. 서명 URL 발급이 실패하면 해당 region은 `imageUrls: []`로 조용히 폴백한다(전체 요청은 실패시키지 않음).
- 조회: `GET /api/material-master?department_id=...&shipper_id=...`
  - mock: `appRepository.listMaterials(toMockScopeIds(departmentId, shipperId))`.
  - Supabase: `resolveScopeIds` 후 `.from("material_masters").select("*").eq("department_id",...).eq("shipper_id",...).order("code")`. 조회한 목록은 `attachMissingReferences`(`lib/server/material-reference.ts`)로 `missing_reference`(기준 미등록 방식 목록)를 붙여 응답한다. `material_id` 쿼리로 단건 조회하는 경로도 있음(`.from("material_masters").select("*").eq("id", materialId).single()`).
  - 실DB 모드에서 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다. 화면(`page.tsx`)은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전에 표시 중이던 목록은 그대로 유지).
- 등록/수정: `POST`/`PATCH /api/material-master`
  - POST는 `departmentId`/`shipperId`/`code`/`name` 필수, PATCH는 `id`/`code`/`name` 필수. `inspection_method`는 미전송이면 `NONE`(사진검수)으로 보고, 전송된 값이 `OCR`/`VISION`/`BOTH`/`NONE`이 아니면 `400`("inspection_method는 OCR, VISION, BOTH, NONE 중 하나여야 합니다.")이다. 응답·조회의 `inspection_method`는 `normalizeMaterialInspectionMethod`로 이상값·NULL을 `NONE`으로 정규화한다(DB 기본값도 `NONE`, `docs/menus/work-inspection.md`의 "데이터 모델·DB 스키마 변경 이력" 참고). 응답의 `material`에도 `missing_reference`가 붙는다.
  - Supabase 분기: `.from("material_masters").insert(...)` 또는 `.update(...).eq("id", id)`.
- 삭제: `DELETE /api/material-master` body `{ id }` → `.from("material_masters").delete().eq("id", id)`.
- 이미지 업로드: 부자재 저장과 분리되어, 목록의 OCR/비전 상태 버튼 → `ReferenceRegisterModal`에서 `POST /api/material-master/registration`(multipart FormData, 필드는 위 "ReferenceRegisterModal" 참고)을 호출한다.
  - `app/api/material-master/registration/route.ts`: Supabase Storage 버킷 `material-images`에 `mobile/{materialId}/{ocr|vision}/{timestamp}-{index}-{파일명}.{ext}` 경로로 업로드(`ensureMaterialImageBucket`로 버킷 없으면 생성), `material_masters` 테이블의 `ocr_image_path`/`vision_image_path`/`reference_image_path`(OCR이면 `verification_value`도)를 업데이트하고(**`inspection_method`는 바꾸지 않는다** — 기존의 OCR/VISION 자동 병합 `mergeInspectionMethod`는 삭제됐고 검수방식은 수정 모달 체크로만 변경한다), `material_inspection_regions` 테이블에 기존 method 행을 삭제 후 ROI(`roi`), `expected_text`, `similarity_threshold`, `options`를 insert. 업로드 이후 이 DB 작업(update/insert)이 실패하면 이미 업로드된 파일을 `supabase.storage.from("material-images").remove(...)`로 정리(cleanup)한 뒤 원래 에러를 그대로 반환한다(정리 자체가 실패해도 콘솔 로그만 남기고 원래 에러 응답을 우선한다). 이 라우트의 조회·저장·삭제 실패는 스코프 가드 오류(400/403/404)를 제외하고 `502`로 반환한다(이전 500). POST/DELETE 응답의 `material`에도 `missing_reference`가 붙는다.
  - **POST 보강(2026-10)**: 추가 필드 `source`(`web`|`mobile`, 저장값은 `options.source` = `web-material-registration`/`mobile-material-registration`, 그 외 값은 mobile), `ocrRawText`(OCR 인식 원문), `imageWidth`/`imageHeight`(선택, `options.imageNaturalSize`). `recognizedText`(확정 검증값)가 `ocrRawText`와 다르면(앞뒤 공백 무시) `options.manualEdited=true`를 기록한다(DDL 없음, region `options` jsonb 키).
  - **미사용 규칙**: `inspection_method`에 해당 방식(OCR/VISION/BOTH)이 없고 기존 기준(해당 방식의 경로 또는 region)도 없으면 `400`. 기존 기준이 있으면 재등록 허용.
  - **이미지 장수**: OCR 1장, VISION 1~5장(초과 400). `source=web`이면 파일 필수(없으면 400)이고 OCR은 `recognizedText`가 비어 있으면 400.
  - **업로드·경로 보안(2026-10, 보안점검 M1/M2)**: 업로드 파일은 `checkImageFile`(jpeg/png/webp, 장당 8MB — 형식 400/용량 413)로 검사한 뒤 올리고, 저장 확장자는 클라이언트 파일명이 아니라 검증된 MIME(`imageExtension`)으로 정한다. `method`는 `OCR`/`VISION`만 허용(400). 파일 없이 온 클라이언트 `imagePath`는 해당 부자재·방식 폴더(`mobile/{materialId}/{method}/`) 안일 때만 저장하고 아니면 400(파일이 있으면 imagePath는 무시). 소유 판정은 `lib/server/material-reference.ts`의 `ownedMaterialImagePath`(버킷 프리픽스 1회만 허용, 선행 `/`·`\\`·`.`/`..`/빈 세그먼트 거부)를 저장·서명(GET `resolveRegionImageUrls`, `lib/server/photo-review-expected.ts`)·삭제(`ownedStoragePaths`)가 함께 쓴다. 서명 시 소유 폴더 밖 경로는 서명하지 않고 로그만 남긴다.
  - **저장 순서(부분 실패 정합성)**: 현행 region 조회 → 새 파일 업로드(일부 실패 시 성공분도 삭제) → 새 region INSERT → `material_masters` UPDATE → 이전 region 삭제 → 이전 스토리지 파일 삭제(best-effort, 해당 부자재·방식 폴더 `mobile/{id}/{method}/` 파일만). UPDATE 실패 시 새 region 삭제 + 새 파일 삭제 후 `502`. 새 파일 없이 들어온 요청(JSON/imagePath만)은 이전 파일을 지우지 않는다.
  - **GET 응답 보강**: `{ source, regions, verificationValue, material }`. 각 region에 `imageUrls`(서명 URL 1시간), `roi`, `registeredAt`(`options.savedAt` 없으면 `created_at`), `registrationSource`(web/mobile/unknown), `ocrRawText`, `manualEdited`, `similarity`, `imageCount` 포함. `material`은 `missing_reference` 포함(누락 사유 표시용).
  - DELETE 핸들러는 등록된 이미지/영역 삭제(`material_inspection_regions` 삭제 + `material_masters`의 경로 필드 초기화 + 해당 방식 스토리지 파일 정리)를 지원한다.
- 확인된 Supabase 테이블: `material_masters`, `material_inspection_regions`. Storage 버킷: `material-images`.

### 검증값(`verification_value`) 데이터 흐름
- `material_masters.verification_value text NOT NULL DEFAULT ''` 컬럼(모바일 OCR 등록 검수·저장 값)을 GET 응답(`/api/material-master`, `/api/material-master/registration`, `fetchWorkMasterData`)의 `toMaterial()`이 모두 그대로 매핑해서 내려준다.
- 갱신 지점은 `app/api/material-master/registration/route.ts` POST 하나뿐이다(`method === "OCR"`일 때):
  - 모바일 OCR 등록 화면(`/mobile/material-photo`)에서 OCR 검토(`/api/ocr`)를 거쳐 저장하면 `recognizedText`(빈 문자열 포함) FormData 필드가 항상 함께 전송되고(`recognizedTextProvided: true`), 서버는 `recognizedText`를 **있는 그대로**(빈 값이어도) `verification_value`에 저장한다. 즉 OCR 서버 검증이 불가능해 인식 텍스트가 없었던 경우 검증값도 빈 문자열로 저장된다 — 임의로 부자재코드로 대체하지 않는다.
  - `recognizedText` 필드 자체가 전송되지 않은 요청(OCR 검토 없이 이미지만 올리는 구형 호출. 웹 등록 모달은 `source=web`일 때 `recognizedText`를 필수로 보낸다)은 `expectedText`(보통 부자재코드)가 있으면 그 값으로, 없으면 기존 `verification_value`를 유지한다.
  - DELETE(OCR 등록 삭제, `deleted.ocr === true`)는 `verification_value: ""`로 초기화한다.
- 작업검수(`work-inspection`) 화면은 이 값을 검수 항목의 참고 기준값("검증값(기대값)")으로 함께 표시한다 — 상세는 `docs/menus/work-inspection.md` 참고.

### 기준 미등록 판정(`missing_reference`, 2026-10)
- 목적: 체크한 검수방식(OCR/비전)의 기준이 비어 있으면 현장에서 진행할 수 없으므로 마스터 화면에서 경고한다. 판정은 `lib/inspection/material-reference.ts`의 `findMissingReferences`, 서버 부착은 `lib/server/material-reference.ts`의 `attachMissingReferences`가 한다. **검수 방식 판정(OCR/비전/사진 중 무엇을 만들지)에는 쓰이지 않고 경고 표시 전용이다.**
- 규칙: `NONE`(사진검수)은 항상 빈 배열. `OCR`·`BOTH`는 `ocr_image_path` 없음 또는 OCR 영역(`material_inspection_regions`, method=OCR) 없음 또는 검증값 없음(`verification_value`도 영역의 `expected_text`도 비어 있음)이면 "OCR" 누락. `VISION`·`BOTH`는 `vision_image_path` 없음 또는 비전 영역 없음이면 "VISION" 누락.
- 서버는 체크된(NONE 아닌) 부자재의 영역만 한 번에 조회한다. 영역 조회 실패는 던져 호출 라우트가 `502`로 응답한다. 같은 판정이 `GET/POST/PATCH /api/material-master`, `registration` POST/DELETE 응답, `fetchWorkMasterData`(작업마스터·작업등록·작업검수·작업현황이 쓰는 부자재 목록)에 붙는다.
- mock 모드/서버 판정값이 없을 때는 `getMissingReferences`가 경로 컬럼(`ocr_image_path`/`vision_image_path`)과 `verification_value`만으로 대체 판정한다.
- 표시: 부자재마스터 "검수방식" 열과 작업마스터 부자재 모달 "검수방식" 열에 경고 배지(`기준 미등록(OCR·VISION)` + 안내 문구)로 나온다.

## 상태·필터
- `useFilterStore()`에서 `departmentId`, `shipperId` 모두 구독. 두 값이 바뀌면 `loadMaterials` 재실행.
- 부서/화주 미선택 시 `EmptyCloudState`로 조기 반환.
- 로컬 상태: `materials`, `selectedMaterialId`, `modalMode`, `isLoading`, `dataSource`, `loadError`.

## 주요 타입
- `MaterialMaster`(`lib/types/domain.ts`): `id`, `department_id`, `shipper_id`, `name`, `code`, `lot?`, `inspection_method: "OCR"|"VISION"|"BOTH"|"NONE"`(NONE = 둘 다 미체크, 사진검수 대상), `reference_image_path`, `ocr_image_path?`, `vision_image_path?`, `remark?`, `is_active`, `verification_value: string`(모바일 OCR 등록 검수값, 실 DB 컬럼 `NOT NULL DEFAULT ''`).
- `InspectionMethod`(= `MaterialInspectionMethod`): `"OCR" | "VISION" | "BOTH" | "NONE"`. `MaterialWithReferenceStatus`(`lib/inspection/material-reference.ts`) = `MaterialMaster` + 서버가 채우는 `missing_reference?: ("OCR"|"VISION")[]`.
- 저장 규칙(폼): OCR·비전 둘 다 해제하면 `NONE`(사진검수)으로 저장한다(이전에는 BOTH로 저장하다가, 이후 저장 차단 안내로 바뀌었던 규칙을 대체). 이미지 파일 선택만으로 `material-images/mock/...` 가짜 경로를 DB에 저장하지 않으며, 경로는 업로드 성공 후 서버 응답으로만 갱신된다.
- `POST /api/material-master/registration`(OCR, `recognizedText` 미전송): 기존 `verification_value`가 있으면 유지하고 없을 때만 `expectedText`(부자재코드)로 채운다.
- `MaterialFormValue`(페이지 로컬 타입): `MaterialMaster`의 일부 필드 (이미지 파일 필드 없음 — 기준 이미지는 등록 팝업에서 처리).
- `RoiRect`(`lib/types/domain.ts`, registration route에서 검증): `{ x, y, width, height }`, 0~100 범위.

## 주의사항
- 등록 영역은 팝업(`ReferenceDetailModal`·`MaterialImagePreviewModal`)이 열릴 때 `GET /api/material-master/registration?material_id=...`로 조회한다. Supabase 모드에서는 `material_inspection_regions` 실데이터를, mock/env 미설정 시에는 `appRepository.listMaterialRegions`를 반환한다. (`components/inspection/InspectionRegionEditor.tsx`는 이 화면에서 더 이상 사용하지 않음)
- 페이지는 이미지 선택만으로 가짜(mock) 저장 경로를 만들지 않는다(`buildMockStoragePath` 삭제). 실제 저장 경로는 서버(`registration/route.ts`)의 `storagePath()`가 `Date.now()` 기반으로 만들어 업로드 성공 후 응답으로만 갱신된다.
- POST/PATCH `/api/material-master`에서 `reference_image_path`는 `ocr_image_path || vision_image_path || 기존값`으로 프론트에서 계산해서 보내지만, 이후 이미지 업로드(`registration`)가 성공하면 서버가 다시 `reference_image_path`를 갱신한다(최초 1회만, `currentReferencePath || imagePath`).
- 부자재 삭제(`DELETE /api/material-master`)는 연결된 `work_master_materials`, `material_inspection_regions` 등을 함께 정리하지 않는다(단순 `material_masters` 행 삭제만 수행).

## 스코프 가드 (2026-10 추가, `lib/server/scope-guard.ts`)
- 공통 규칙: API 라우트는 서비스롤 키로 RLS를 우회하므로, 쓰기·삭제·상태변경·리소스ID 조회 요청은 부서/화주 스코프(JSON/FormData `departmentId`·`shipperId`, 쿼리 `department_id`·`shipper_id`)를 **필수**로 받는다. 누락 `400`, 리소스 없음 `404`, 스코프 불일치 `403`, 가드 내 DB 오류 `502`. 이 검증은 mock 모드에서도 스코프 존재(400)까지 동일하게 적용된다. 호출측은 웹은 `useFilterStore`, 모바일은 `useMobileScope()`(`lib/mobile/mobile-api.ts`, 기본 스코프 폴백 포함)의 값을 보낸다. 인증(로그인 사용자 확인)은 별도 범위다.
- `GET /api/material-master`는 이제 `department_id`+`shipper_id`가 항상 필수다. `material_id`를 함께 주면 스코프 안 부자재일 때만 반환한다(스코프 밖 403 / 없음 404, 모바일 부자재사진 `?materialId=` 용도).
- `PATCH`/`DELETE /api/material-master` body에 `departmentId`·`shipperId` 필수(수정 시에도 소속 대조 후 처리, 부서/화주 자체는 변경하지 않음).
- `GET`(쿼리 `material_id`+`department_id`+`shipper_id`)/`POST`(JSON 또는 multipart의 `departmentId`·`shipperId`)/`DELETE`(body) `/api/material-master/registration` 모두 부자재가 스코프 소속인지 확인한 뒤 처리하며, 스코프 밖이면 업로드/수정 이전에 403으로 끊는다.
