-- =====================================================================
-- 사진검수(PHOTO) + 관리자 승인/반려 지원 마이그레이션 (안 A 최종안)
-- 대상: 유통가공검수시스템 (ref yzulktvvxltehgsbjfcp, PostgreSQL 17.6)
-- 작성: db-guard-team / 2026-10-18 / 사전 조회 결과 반영
--
-- 사전 조회 결과 요약(2026-10-18 실DB, 읽기 전용)
--  - work_inspections CHECK: work_inspections_stage_check 1개뿐
--    → method / status 에는 CHECK 없음(교체할 기존 제약 없음, 신규 추가)
--  - inspection_images.image_type: CHECK 없음(신규 추가)
--  - material_masters.inspection_method: text NOT NULL default 'OCR', CHECK 없음
--  - 유니크: work_inspections_work_material_method_stage_key
--           (work_id, material_id, method, stage) — 유니크 "인덱스"(제약 아님), NULLS DISTINCT
--  - RLS: 3테이블 모두 enabled, 정책 0건(서비스롤만 접근) / 비내부 트리거 0건 / 뷰·함수 의존 0건
--  - 데이터: work_inspections 10행, inspection_images 6행, material_masters 8행
--
-- 적용 방법: 이 파일 전체를 한 번에 실행(begin/commit 포함).
-- 동일 파일 재실행 시에도 오류 없이 통과하도록 작성(멱등).
-- =====================================================================

begin;

-- 잠금 대기 상한(운영 트래픽과 충돌 시 즉시 실패 → 재시도)
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------
-- 1. work_inspections 컬럼 7개 추가
--    (상수 default 컬럼 추가는 PG11+ 메타데이터 변경만 → 테이블 재작성 없음)
-- ---------------------------------------------------------------------
alter table public.work_inspections
  add column if not exists target_type    text not null default 'material',
  add column if not exists product_code   text,
  add column if not exists product_name   text,
  add column if not exists product_lot    text,
  add column if not exists review_comment text,        -- 최근 반려 사유(승인 시 null)
  add column if not exists submitted_at   timestamptz,
  add column if not exists reviewed_at    timestamptz;

-- 기존 완료제품사진 행(method='PRODUCT', material_id NULL) 표기 정리 — 현재 2행
-- (CHECK 추가 전에 수행해야 아래 정합성 CHECK가 통과함)
update public.work_inspections
   set target_type = 'completion'
 where method = 'PRODUCT'
   and target_type <> 'completion';

-- ---------------------------------------------------------------------
-- 2. CHECK 제약 (기존 제약 없음 → 신규. 재실행 대비 drop if exists 후 add)
-- ---------------------------------------------------------------------
alter table public.work_inspections
  drop constraint if exists work_inspections_target_type_check;
alter table public.work_inspections
  add constraint work_inspections_target_type_check
  check (target_type in ('material', 'product', 'completion'));

alter table public.work_inspections
  drop constraint if exists work_inspections_method_check;
alter table public.work_inspections
  add constraint work_inspections_method_check
  check (method in ('OCR', 'VISION', 'PRODUCT', 'PHOTO'));

alter table public.work_inspections
  drop constraint if exists work_inspections_status_check;
alter table public.work_inspections
  add constraint work_inspections_status_check
  check (status in ('pending', 'passed', 'failed', 'retrying',
                    'admin_requested', 'admin_approved',
                    'submitted', 'rejected'));

-- 대상 구분별 필수값 정합성(설계 초안 대비 추가)
--  - product  : product_code 필수, material_id 없음 → 부분 유니크 인덱스 우회(NULL) 방지
--  - material : material_id 필수 → 기존 유니크 인덱스가 NULL로 무력화되는 것 방지
alter table public.work_inspections
  drop constraint if exists work_inspections_target_fields_check;
alter table public.work_inspections
  add constraint work_inspections_target_fields_check
  check (
    (target_type <> 'product'  or (product_code is not null and btrim(product_code) <> ''
                                   and material_id is null))
    and (target_type <> 'material' or material_id is not null)
  );

alter table public.inspection_images
  drop constraint if exists inspection_images_image_type_check;
alter table public.inspection_images
  add constraint inspection_images_image_type_check
  check (image_type in ('ocr_capture', 'vision_capture', 'admin_review',
                        'product', 'completion_photo', 'photo_review'));

-- 부자재마스터: OCR·비전 둘 다 미체크 = 'NONE'(사진검수 대상) 허용
-- NOT NULL·default 'OCR'은 유지(NULL 미사용 — 기존 코드의 NULL→BOTH 해석과 충돌 방지)
alter table public.material_masters
  drop constraint if exists material_masters_inspection_method_check;
alter table public.material_masters
  add constraint material_masters_inspection_method_check
  check (inspection_method in ('OCR', 'VISION', 'BOTH', 'NONE'));

-- 신규 부자재 기본값: OCR·비전 미체크(사진검수) — 대표님 결정(추천안)
alter table public.material_masters
  alter column inspection_method set default 'NONE';

-- ---------------------------------------------------------------------
-- 3. 제품 PHOTO 행 중복 방지(material_id NULL이라 기존 유니크로 못 막음)
--    소규모 테이블이라 일반 create index(트랜잭션 내) 사용
-- ---------------------------------------------------------------------
create unique index if not exists work_inspections_product_photo_uq
  on public.work_inspections (work_id, stage, product_code, coalesce(product_lot, ''))
  where method = 'PHOTO' and target_type = 'product';

-- (선택) 완료제품사진(PRODUCT) 행도 material_id NULL이라 경합 시 중복 가능 — 현재 중복 0건 확인
create unique index if not exists work_inspections_completion_product_uq
  on public.work_inspections (work_id, stage)
  where method = 'PRODUCT';

-- 부자재 PHOTO 행은 기존 work_inspections_work_material_method_stage_key
-- (work_id, material_id, 'PHOTO', stage)로 부자재·단계당 1행 보장 → 추가 인덱스 불필요

commit;

-- ---------------------------------------------------------------------
-- 적용 후 확인(읽기 전용)
-- ---------------------------------------------------------------------
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid in ('public.work_inspections'::regclass, 'public.inspection_images'::regclass,
--                     'public.material_masters'::regclass) and contype = 'c' order by 1;
-- select indexname, indexdef from pg_indexes where tablename = 'work_inspections';
-- select method, target_type, count(*) from public.work_inspections group by 1, 2;
