# 작업마스터 (`app/(workspace)/work-master`)

> 변경 이력(2026-10-18, 문서관리팀): 부자재 모달 "검수방식" 열·기준 미등록 배지, 부자재 검수방식 `NONE`(사진검수) 반영, 일괄등록 임시 부자재 기본값 NONE을 코드 기준으로 반영함.

## 개요
선택된 부서/화주 기준으로 작업마스터(완성품 단위 작업 정의)를 관리한다. 행 단위 개별 등록, 엑셀 붙여넣기 기반 일괄등록, 부자재 구성 등록, 사용제품코드 등록, 선택 삭제까지 지원하는 이 프로젝트에서 가장 복잡한 마스터 화면이다.

## 화면 구조
- `app/(workspace)/work-master/page.tsx` (`WorkMasterPage`)
- 사용 컴포넌트: `PageHeader`, `CloudButton`, `CuteCard`, `EmptyCloudState`, `appRepository`(mock 폴백용)
- 메인 테이블 컬럼: 전체선택 체크박스, 작업구분(`workType`), 완성품코드, 타입, 완성품명, 사용제품코드(개수 배지 버튼), 부자재(개수 배지 버튼), 작업설명, 사용여부.
- 인라인 행추가: "행추가" 클릭 시 `draftWorkMaster` 상태로 테이블 맨 위에 입력 가능한 행(작업구분 select, 코드/타입/이름/설명 input, 사용여부 select)이 나타나고 "저장"/"취소" 버튼으로 확정.
- 모달 3종(모두 파일 내부 컴포넌트):
  - `WorkMaterialModal`: 특정 작업마스터에 부자재+단위수량 등록(부자재 select + 수량 input → 추가), 표 컬럼은 부자재코드/부자재명/단위수량/**검수방식**/OCR검수/비전검수/삭제. 검수방식 열은 `inspectionMethodLabels` 배지(`NONE`="사진검수")와, 체크한 방식의 기준이 비어 있으면 "기준 미등록(OCR·VISION)" 경고 배지(`getMissingReferences`, 판정 규칙은 `docs/menus/material-master.md`)를 보여준다. OCR/비전검수 대상여부는 `MaterialMaster.inspection_method` 기반 읽기전용 체크박스로 표시하며 둘 다 미체크(`NONE`)면 사진검수 대상이다.
  - `ProductCodeModal`: 특정 작업마스터에 사용제품코드+단위수량+제품구분(정상품/샘플/세트제품) 등록. `baseProducts`(하드코딩된 3개 완성품 목록)로 datalist 제공.
  - `BatchRegisterModal`: 탭 구분 텍스트를 붙여넣어 여러 행을 한 번에 파싱·검증(`parseBatchRows`) 후 일괄등록. 컬럼 순서: 작업구분/완성품코드/타입/완성품명/사용제품코드/부자재/작업설명/사용여부(제품코드·부자재는 `/`로 다중 분리).

## 데이터 흐름
- 조회: `GET /api/work-masters?department_id=...&shipper_id=...`
  - `route.ts`: mock이면 `appRepository.listWorkMasters`/`listMaterials`/`listWorkMasterMaterials` 조합. Supabase면 `resolveScopeIds` 후 `fetchWorkMasterData(supabase, departmentId, shipperId)`(`lib/repositories/work-master-supabase-repository.ts`) 호출.
  - 실DB 모드에서 조회 중 예외가 발생하면 mock 폴백 없이 `502 { error }`를 반환한다. 화면은 더 이상 `applyMockData()`로 대체하지 않고 `loadError` 상태로 "연결 오류" 배지 + "다시 시도" 버튼을 표시한다.
  - `fetchWorkMasterData`: `.from("work_masters").select("*").eq("department_id",...).eq("shipper_id",...)`, `.from("material_masters").select("*").eq(...)`, 그리고 `selectMaybeEmpty`로 `.from("work_master_materials")`, `.from("work_master_products")`를 `work_master_id in (...)` 조건으로 조회.
- 개별 등록: `POST /api/work-masters` body `{ mode: "single", departmentId, shipperId, draft }` → `createWorkMaster()`가 `.from("work_masters").insert({..., work_type, type, ...})`, 실패 시 `work_type`/`type` 컬럼을 뺀 폴백 insert 재시도.
- 일괄 등록: `POST /api/work-masters` body `{ mode: "batch", ..., rows }` → `createBatchWorkMasters()`가 `createMissingMaterials()`(부자재코드가 없으면 `.from("material_masters").insert(...)`로 임시 부자재 자동 생성 — `inspection_method`는 `NONE`(사진검수, 이전 기본값은 BOTH)) → 행별 `createWorkMaster()` → `replaceWorkMasterMaterials()`/`replaceWorkMasterProducts()`.
- 삭제: `DELETE /api/work-masters` body `{ ids }` → `deleteWorkMasters()`가 `work_master_products`, `work_master_materials`를 먼저 삭제한 뒤 `work_masters` 삭제.
- 부자재 구성 저장: `POST /api/work-masters/[workMasterId]/materials` body `{ rows }` → `replaceWorkMasterMaterials()`(기존 행 백업 → 전체 delete → insert, insert 실패 시 백업 복원. 복원까지 실패하면 오류 메시지에 유실 가능성을 포함). 저장 전 서버측 검증: 같은 `materialId` 중복·수량이 1 이상 1,000,000 이하 정수가 아닌 경우(1.5, 1e40 등)는 `400 { error }`(`WorkMasterValidationError`, 작업등록 수량 기준과 동일). 그 외 DB 오류는 502. 사용제품코드(`/products`)도 productCode 중복·수량 검증 동일. 일괄등록은 한 행 안의 부자재/제품코드 중복(예: `A11/A11`)을 수량 합산 없이 400으로 거부한다. 요청 본문 JSON 파싱 실패도 400.
- 제품코드 저장: `POST /api/work-masters/[workMasterId]/products` body `{ rows }` → `replaceWorkMasterProducts()`(기존 행 확보 → 전체 delete → insert, insert 실패 시 확보해둔 기존 행 복원). insert 컬럼에 `sort_order`(입력 순서)가 포함되며 DB에도 해당 컬럼이 존재한다(2026-08-22 마이그레이션 `add_sort_order_to_work_master_products`).
- 확인된 Supabase 테이블: `work_masters`, `material_masters`, `work_master_materials`, `work_master_products`.

## 상태·필터
- `useFilterStore()`에서 `departmentId`, `shipperId` 구독. 값이 없으면 `applyMockData()`로 즉시 mock 데이터를 채운 뒤 `EmptyCloudState`를 반환(다른 마스터 화면과 달리 조회 자체를 mock으로 먼저 채워둔다). 이 mock 채움은 스코프 미선택 상태에서만 발생하며, 실DB 모드에서 API가 502를 반환하는 오류 경로에서는 더 이상 mock으로 대체되지 않는다(`loadError` 배지 + 다시 시도).
- `AbortController`로 부서/화주 변경 시 이전 fetch를 취소.
- 로컬 상태가 많음: `visibleWorkMasters`, `localMaterials`, `workMasterMeta`(work_type/type), `materialRowsByWork`, `productRowsByWork`, `selectedWorkMaster`/`selectedProductWorkMaster`(모달용), `selectedIds`(체크박스 다중 선택), `draftWorkMaster`, `isBatchOpen`.

## 주요 타입
- `WorkMaster`(`lib/types/domain.ts`): `id`, `department_id`, `shipper_id`, `name`, `code`, `description`, `is_active`.
- `lib/types/work-master-api.ts`: `WorkMaterialRowDto`(`id`, `workMasterId`, `materialId`, `unitQuantity`), `ProductUsageRowDto`(+ `productCode`, `productName`, `productType: "정상품"|"샘플"|"세트제품"`), `WorkMasterMetaDto`(`workType`, `type`), `DraftWorkMasterDto`, `BatchWorkMasterRowDto`(`DraftWorkMasterDto` + `productCodes[]`, `materialCodes[]`, `unknownMaterialCodes?`), `WorkMasterDataResponse`, `CreateWorkMasterResponse`, `BatchWorkMasterResponse`.

## 주의사항
- `work_masters` 테이블에 `work_type`/`type` 컬럼이 없는 환경에서도 동작하도록 insert 실패 시 해당 컬럼을 제외한 폴백 insert를 시도하는 방어 코드가 있다(`createWorkMaster`). 즉 스키마에 이 컬럼들이 없을 수 있다는 뜻이며, 이 경우 `meta.workType`/`meta.type`은 DB에 저장되지 않고 응답 객체에만 임시로 채워진다.
- `work_master_materials.unit_quantity`는 실DB에 존재함을 확인했으므로 컬럼 제외 폴백과 `inspection_order` 수량 대체 읽기를 제거했다(수량 손상 방지).
- `fetchWorkMasterData`는 `work_master_materials`/`work_master_products` 조회 오류를 빈 배열로 삼키지 않고 throw(→ 502)한다. 부자재 목록에는 `attachMissingReferences`로 `missing_reference`(기준 미등록 방식)가 붙고(영역 조회 실패도 502), 부자재 `inspection_method`가 NULL·이상값이면 `NONE`(사진검수)으로 정규화한다(이전 폴백은 BOTH). 정렬은 materials `inspection_order`, products `sort_order`. `createMissingMaterials`·`deleteWorkMasters`의 조회/자식 삭제 오류도 throw한다.
- 화면의 부자재/제품 추가 폼은 수량이 1 미만·비숫자이면 추가를 막는다.
- 일괄등록 시 알 수 없는 부자재코드는 `material_masters`에 `"{code} (부자재마스터 등록 필요)"`라는 임시 이름으로 자동 생성되며, 사용자가 이후 부자재마스터에서 별도로 상세 등록해야 한다.
- `ProductCodeModal`의 `baseProducts`(완성품 3종)와 제품명 자동완성은 하드코딩값이며 Supabase 테이블에서 오지 않는다. 목록에 없는 코드를 입력하면 제품명이 `"{code} 제품명 확인 필요"`로 채워진다.
- `getMeta()`는 `workMasterMeta[workMaster.id]`가 없으면 `workTypeLabels[index % 4]`와 `inferType(workMaster)`(코드 문자열에 `BASIC`/`GUIDE` 포함 여부로 추정)로 폴백한다. 즉 화면에 보이는 작업구분/타입이 실제 저장값이 아니라 임시 추정값일 수 있다.

## 스코프 가드 (2026-10 추가, `lib/server/scope-guard.ts`)
- 공통 규칙: API 라우트는 서비스롤 키로 RLS를 우회하므로, 쓰기·삭제·상태변경·리소스ID 조회 요청은 부서/화주 스코프(JSON/FormData `departmentId`·`shipperId`, 쿼리 `department_id`·`shipper_id`)를 **필수**로 받는다. 누락 `400`, 리소스 없음 `404`, 스코프 불일치 `403`, 가드 내 DB 오류 `502`. 이 검증은 mock 모드에서도 스코프 존재(400)까지 동일하게 적용된다. 호출측은 웹은 `useFilterStore`, 모바일은 `useMobileScope()`(`lib/mobile/mobile-api.ts`, 기본 스코프 폴백 포함)의 값을 보낸다. 인증(로그인 사용자 확인)은 별도 범위다.
- `POST /api/work-masters/[workMasterId]/materials`·`/products` body `{ departmentId, shipperId, rows }`: 작업마스터가 해당 부서/화주 소속인지(404/403) 확인하고, `materials`는 `rows[].materialId`가 모두 같은 스코프 부자재인지도 확인한다(다른 화주 부자재 BOM 편입 차단, 존재하지 않으면 404, 스코프 밖이면 403).
- `DELETE /api/work-masters` body `{ departmentId, shipperId, ids }`: `ids` 전부가 해당 스코프 작업마스터여야 한다(하나라도 없으면 404, 스코프 밖이면 403 — 부분 삭제 없음).
