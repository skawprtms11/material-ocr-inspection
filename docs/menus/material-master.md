# 부자재마스터 (`app/(workspace)/material-master`)

## 개요
선택된 부서/화주에 소속된 부자재(원재료) 목록을 조회하고, 등록/수정/삭제 및 OCR·비전 스캔용 기준 이미지를 업로드하는 화면이다. 부자재 기본정보 저장(`/api/material-master`)과 검수 이미지 업로드(`/api/material-master/registration`) 두 API를 조합해서 사용한다.

## 화면 구조
- `app/(workspace)/material-master/page.tsx` (`MaterialMasterPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `EmptyCloudState`, `InspectionRegionEditor`(`components/inspection/InspectionRegionEditor.tsx`)
- `departmentId`/`shipperId`가 없으면 `EmptyCloudState`를 렌더링.
- 부자재 테이블: 부자재코드, 부자재명, LOT, OCR등록, 비전스캔등록, 비고. 행 클릭으로 `selectedMaterialId` 지정.
  - **등록 판정 기준(모바일과 통일)**: OCR등록/비전스캔등록 체크와 "등록완료/대기" 라벨은 `ocr_image_path`/`vision_image_path` **이미지 실등록 여부**로 표시한다. 사용 설정(`inspection_method`)은 수정 모달에서만 관리하며 목록 체크박스와 무관하다.
- 부자재명 셀은 밑줄 스타일의 클릭 가능한 버튼이다. 클릭 시(`stopPropagation`으로 행 선택 로직과 분리) `MaterialImagePreviewModal`(읽기 전용 미리보기 모달)을 연다.
- 액션 버튼: 등록(`Plus`), 수정(`Pencil`, 선택된 행 필요), 삭제(`Trash2`, 선택된 행 필요), 모바일 사진등록 링크(`/mobile/material-photo?materialId=...`).
- `MaterialEditorModal`(내부 컴포넌트, `mode: "create" | "edit"`): 기본정보 폼(code/name/lot/remark, OCR·비전 사용여부 체크박스) + `ImageRegistrationPanel` 2개(OCR/비전 이미지 파일 선택, `storageHint`로 저장 경로 예시 표시) + 수정 모드일 때만 `InspectionRegionEditor`로 등록된 ROI 미리보기 표시(모달이 열릴 때 `useEffect`로 `GET /api/material-master/registration?material_id=...`를 호출해 `regions` 상태를 채움. fetch 실패 시 mock 폴백 없이 빈 배열 + 콘솔 경고).
- `MaterialImagePreviewModal`(내부 컴포넌트): 부자재명 클릭으로 열리는 읽기 전용 모달. 열릴 때 `GET /api/material-master/registration?material_id=...`를 호출해 method별(OCR/VISION) 이미지와 ROI를 조회한다. OCR 섹션은 첫 번째 이미지 위에 저장된 ROI를 퍼센트 좌표 절대배치 오버레이(`RoiOverlayImage`)로 표시하고 `expected_text`/`options.recognizedText`를 캡션으로 보여준다. 비전 섹션은 이미지 최대 5장을 그리드로 표시하며 각 이미지에 동일한 저장 ROI(비전 등록 시 첫 번째 사진의 영역만 저장됨)를 오버레이한다. 로딩 중에는 스피너, 등록 이미지가 없으면 빈 상태 문구를 표시한다.

## 데이터 흐름
- 등록 영역 조회: `GET /api/material-master/registration?material_id=...`
  - mock: `appRepository.listMaterialRegions(materialId)`에 각 region마다 `imageUrls: []`를 붙여 반환.
  - Supabase: `.from("material_inspection_regions").select("*").eq("material_id", materialId)` 조회 후, region별로 `options.uploadedPaths`(없으면 `options.imagePath` 단건)에서 버킷 프리픽스(`material-images/`)를 제거한 상대 경로로 `supabase.storage.from("material-images").createSignedUrls(paths, 60 * 60)`(1시간 만료)를 호출해 `imageUrls: string[]`로 각 region에 병합한다. 서명 URL 발급이 실패하면 해당 region은 `imageUrls: []`로 조용히 폴백한다(전체 요청은 실패시키지 않음).
- 조회: `GET /api/material-master?department_id=...&shipper_id=...`
  - mock: `appRepository.listMaterials(toMockScopeIds(departmentId, shipperId))`.
  - Supabase: `resolveScopeIds` 후 `.from("material_masters").select("*").eq("department_id",...).eq("shipper_id",...).order("code")`. `material_id` 쿼리로 단건 조회하는 경로도 있음(`.from("material_masters").select("*").eq("id", materialId).single()`).
  - 실DB 모드에서 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다. 화면(`page.tsx`)은 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다(직전에 표시 중이던 목록은 그대로 유지).
- 등록/수정: `POST`/`PATCH /api/material-master`
  - POST는 `departmentId`/`shipperId`/`code`/`name` 필수, PATCH는 `id`/`code`/`name` 필수.
  - Supabase 분기: `.from("material_masters").insert(...)` 또는 `.update(...).eq("id", id)`.
- 삭제: `DELETE /api/material-master` body `{ id }` → `.from("material_masters").delete().eq("id", id)`.
- 이미지 업로드: 저장 성공 후 `ocrFile`/`visionFile`가 있으면 각각 `POST /api/material-master/registration` (multipart FormData: `materialId`, `method`, `expectedText`, `images`) 호출.
  - `app/api/material-master/registration/route.ts`: Supabase Storage 버킷 `material-images`에 `mobile/{materialId}/{ocr|vision}/{timestamp}-{index}-{파일명}.{ext}` 경로로 업로드(`ensureMaterialImageBucket`로 버킷 없으면 생성), `material_masters` 테이블의 `ocr_image_path`/`vision_image_path`/`reference_image_path`/`inspection_method`(OCR/VISION 병합)를 업데이트하고, `material_inspection_regions` 테이블에 기존 method 행을 삭제 후 ROI(`roi`), `expected_text`, `similarity_threshold`, `options`를 insert. 업로드 이후 이 DB 작업(update/insert)이 실패하면 이미 업로드된 파일을 `supabase.storage.from("material-images").remove(...)`로 정리(cleanup)한 뒤 원래 에러를 그대로 반환한다(정리 자체가 실패해도 콘솔 로그만 남기고 원래 에러 응답을 우선한다).
  - DELETE 핸들러는 등록된 이미지/영역 삭제(`material_inspection_regions` 삭제 + `material_masters`의 경로 필드 초기화)를 지원하지만, 현재 `material-master` 페이지 UI에서는 이 DELETE를 호출하는 곳이 없다.
- 확인된 Supabase 테이블: `material_masters`, `material_inspection_regions`. Storage 버킷: `material-images`.

## 상태·필터
- `useFilterStore()`에서 `departmentId`, `shipperId` 모두 구독. 두 값이 바뀌면 `loadMaterials` 재실행.
- 부서/화주 미선택 시 `EmptyCloudState`로 조기 반환.
- 로컬 상태: `materials`, `selectedMaterialId`, `modalMode`, `isLoading`, `dataSource`, `loadError`.

## 주요 타입
- `MaterialMaster`(`lib/types/domain.ts`): `id`, `department_id`, `shipper_id`, `name`, `code`, `lot?`, `inspection_method: "OCR"|"VISION"|"BOTH"`, `reference_image_path`, `ocr_image_path?`, `vision_image_path?`, `remark?`, `is_active`.
- `InspectionMethod`: `"OCR" | "VISION" | "BOTH"`.
- `MaterialFormValue`(페이지 로컬 타입): `MaterialMaster`의 일부 필드 + `ocrFile?: File`, `visionFile?: File`.
- `RoiRect`(`lib/types/domain.ts`, registration route에서 검증): `{ x, y, width, height }`, 0~100 범위.

## 주의사항
- `InspectionRegionEditor`에 넘기는 `regions`는 모달이 열릴 때 `GET /api/material-master/registration?material_id=...`로 조회한다. Supabase 모드에서는 `material_inspection_regions` 실데이터를, mock/env 미설정 시에는 `appRepository.listMaterialRegions`를 반환하므로 화면 미리보기와 실제 등록 상태가 일치한다.
- `buildMockStoragePath`(페이지)는 실제 업로드 전에 미리 보여줄 mock 경로 문자열만 만들며, 실제 저장 경로는 서버(`registration/route.ts`)의 `storagePath()`가 `Date.now()` 기반으로 다시 생성한다. 즉 클라이언트에서 계산한 경로와 서버에 최종 저장되는 경로가 다르다.
- POST/PATCH `/api/material-master`에서 `reference_image_path`는 `ocr_image_path || vision_image_path || 기존값`으로 프론트에서 계산해서 보내지만, 이후 이미지 업로드(`registration`)가 성공하면 서버가 다시 `reference_image_path`를 갱신한다(최초 1회만, `currentReferencePath || imagePath`).
- 부자재 삭제(`DELETE /api/material-master`)는 연결된 `work_master_materials`, `material_inspection_regions` 등을 함께 정리하지 않는다(단순 `material_masters` 행 삭제만 수행).
