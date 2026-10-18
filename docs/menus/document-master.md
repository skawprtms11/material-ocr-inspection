# 문서마스터 (`app/(workspace)/document-master`)

## 개요
작업지시서 양식(레이아웃 선택형)을 부서 단위로 등록·개정 관리하고, 화주별로 사용할 양식·기본 양식·정렬을 지정하는 화면이다. 등록한 양식은 작업등록의 작업지시서 출력(`/print/work-order/[workId]`)과 같은 렌더러(`components/documents/DocumentRenderer`)로 그려지므로 미리보기와 실제 출력 모양이 같다. 사이드바 "문서마스터"(화주마스터 다음, 사용자관리 앞).

## 화면 구조
- `page.tsx`(`DocumentMasterPage`): 탭 2개(로컬 state) + `EmptyCloudState`(부서 없을 때). 하위 컴포넌트는 같은 폴더.
- 탭1 `TemplateTab.tsx` (문서양식등록)
  - 목록 컬럼: 문서코드 / 문서명 / 개정일자 / 레이아웃 / 사용여부 / 매핑 화주(수) / 관리(미리보기·수정·개정·사용중지·삭제).
  - "최신 개정만 보기"(기본 ON): 코드별 최신 `revision_date` 행만 표시. 조회는 `include_inactive=true`로 중지 양식 포함.
  - `TemplateFormModal.tsx`: 등록/수정/개정 공용 모달. 레이아웃 카드 선택(standard/bom-detail/lot-split) + 코드·문서명·개정일자·머리글 제목/부제·회사명·비고(footerNote)·결재란(0~5칸)·코드표시(QR/없음)·코드 위치·수기 빈 행·섹션 토글(제품/부자재/비고/서명)·레이아웃 옵션(검수방식 표시, LOT 체크칸)·사용여부. 우측에 `DocumentPreviewFrame`(scale 0.5) 실시간 미리보기(샘플 `SAMPLE_WORK_ORDER_DTO`).
  - "개정" 버튼: 선택 행을 복제해 개정일자만 새로 입력(코드 고정). 옵션 "기존 개정의 화주 매핑 이어받기"(서버 `inheritFromTemplateId`) + "이전 개정 사용중지"(등록 성공 후 이전 개정 PATCH `isActive:false`; 실패 시 경고 토스트).
  - `TemplatePreviewModal.tsx`: 목록/화주 탭 공용 미리보기(scale 0.7).
- 탭2 `ShipperMappingTab.tsx` (화주별양식등록)
  - 좌측 화주 목록(`GET /api/shipper-master`의 `shippers`), 선택 시 `useFilterStore().setShipperId`로 전역 필터와 동기화.
  - 우측: 매핑된 양식 목록(순번·기본 배지·사용중지 배지) + 위/아래 정렬 + 기본 지정 + 미리보기 + 해제, 상단 "추가할 양식" 셀렉트(같은 부서 활성·미매핑 양식) + 양식 추가.
  - 정렬은 인접 교환 후 1..n 재부여, 값이 바뀐 행만 PATCH.
- `DataStatusBar.tsx`: 데이터 출처 배지(Supabase/Mock/연결 오류) + "다시 시도".

## 데이터 흐름 / API
공통: 스코프 가드(`lib/server/scope-guard.ts`) 사용, 누락 400 / 리소스 없음 404 / 부서·화주 불일치 403 / 중복·사용 중 409 / 실DB 오류 502(mock 폴백 없음). mock 모드(`NEXT_PUBLIC_USE_MOCK_DATA !== "false"`)는 `appRepository.listDocumentTemplates`·`listShipperDocumentTemplates` 조회 + 쓰기는 echo(화면 상태만 갱신, 새로고침 시 원복). 공용 헬퍼 `lib/server/document-templates.ts`.

| 메서드·경로 | 요청 | 응답·오류 |
|---|---|---|
| GET `/api/document-templates` | `department_id`(필수), `include_inactive?` | `{source, templates[](+mappedShipperCount), layouts[]}` |
| POST `/api/document-templates` | `{departmentId, code, name, revisionDate, templateType:"layout", layoutKey, settings, isActive?, memo?, inheritFromTemplateId?}` | 201 `{source, template}` / 400(zod·editor/file "준비 중"·layoutKey·날짜) / 409(부서+코드+개정일자 중복, 23505) / 403·404(승계 원본) |
| PATCH `/api/document-templates/[templateId]` | `{departmentId, code?, name?, revisionDate?, layoutKey?, settings?, isActive?, memo?}` | 200 `{source, template}` / 400 / 403(타 부서) / 404 / 409(중복). `updated_at` 명시 세팅. layoutKey만 바꾸면 기존 settings를 새 레이아웃 기본값에 병합 |
| DELETE `/api/document-templates/[templateId]` | `department_id` | 200 `{source, deletedId}` / 409(화주 매핑 또는 출력 이력 있음 → 사용중지 안내) |
| GET `/api/shipper-document-templates` | `department_id`, `shipper_id` | `{source, mappings[](+template, sort_order 순), candidates[](같은 부서 활성·미매핑)}` |
| POST `/api/shipper-document-templates` | `{departmentId, shipperId, templateId, isDefault?}` | 201 `{source, mapping}` / 403(양식·화주 부서 불일치) / 409(중복·사용중지 양식) / 화주 첫 양식은 자동 기본, `sort_order`=max+1 |
| PATCH `/api/shipper-document-templates/[mappingId]` | `{departmentId, shipperId, isDefault?, sortOrder?}` | 200 / 400(sortOrder 0~9999 정수) / 403(다른 화주 매핑) / 409(기본 해제 시도) / 기본 지정은 "기존 기본 해제 → 대상 지정", 실패 시 원복 |
| DELETE `/api/shipper-document-templates/[mappingId]` | `department_id`, `shipper_id` | 200 `{source, deletedId, promotedId?, warning?}` / 403 / 404. 기본 매핑을 해제하면 남은 매핑 중 활성 양식의 `sort_order` 최소 행을 기본으로 자동 승격(`promotedId`). 승격 불가·실패 시 삭제는 유지하고 `warning` 반환(화면은 토스트 표시). mock은 화면에서 같은 규칙으로 로컬 승격 |

- 신규 개정 승계: 원본 매핑을 새 양식으로 복제. 화주당 기본은 1개(부분 유니크)라 원본 기본을 해제하고 새 개정을 기본으로 둔다(원본 매핑 행은 유지). 실패 시 새 양식 삭제·기본 복구.
- 확인된 Supabase 테이블: `document_templates`, `shipper_document_templates`, `work_order_issues`(삭제 가드 조회용), `shippers`.

## 상태·필터
- `useFilterStore()`의 `departmentId`(필수), 탭2는 `shipperId`도 사용(선택 화주). `departmentId` 변경 시 재조회.
- 양식은 부서 소속. 화주·양식의 부서 일치는 DB 제약이 없어 API 가드에서만 검증한다.

## 주요 타입
- `lib/types/document-template.ts`: `DocumentTemplate`, `ShipperDocumentTemplate`, `LayoutKey`, `DocumentLayoutSettings`, 요청·응답 DTO. 레이아웃 메타·기본값은 `lib/documents/layout-meta.ts`, 검증은 `lib/documents/settings-schema.ts`(zod).

## 주의사항
- `template_type`은 `layout`만 받는다(editor/file은 400 "준비 중").
- 삭제는 매핑·출력 이력이 있으면 409. 이력의 `template_id`는 FK `ON DELETE SET NULL`이라 DB가 막지 않으므로 API 사전 조회로만 막는다.
- 코드128은 렌더러 미지원이라 코드표시 선택지는 QR/없음만 노출한다.
- 새 레이아웃 추가 시 `LAYOUT_META` + `components/documents/layout-registry.tsx` 두 곳만 수정하면 카드 목록에 자동 반영된다.
