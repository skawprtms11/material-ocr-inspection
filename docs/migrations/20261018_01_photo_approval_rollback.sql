-- =====================================================================
-- 롤백: 사진검수(PHOTO) + 관리자 승인/반려 마이그레이션 원복
-- 주의
--  - 운영 중 PHOTO 행·photo_review 사진·'NONE' 부자재가 생겼다면 아래 0단계 백업 먼저 수행
--  - PHOTO 행 삭제 시 inspection_images는 FK ON DELETE CASCADE로 함께 삭제됨
--    (스토리지 객체 inspection-images/... 는 삭제되지 않음 → 별도 정리)
--  - 'NONE' 부자재는 원복 시 'BOTH'로 되돌림(기존 코드의 이상값 처리 기준과 동일) — 가정
-- =====================================================================

-- 0단계(선택, 별도 실행): 백업
-- create table public._bak_wi_photo_20261018 as
--   select * from public.work_inspections
--    where method = 'PHOTO' or status in ('submitted', 'rejected');
-- create table public._bak_ii_photo_20261018 as
--   select * from public.inspection_images where image_type = 'photo_review';
-- create table public._bak_mm_none_20261018 as
--   select id, inspection_method from public.material_masters where inspection_method = 'NONE';

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. 신규 값 데이터 정리
delete from public.inspection_images where image_type = 'photo_review';
delete from public.work_inspections where method = 'PHOTO';
-- PHOTO 외 행에 신규 상태가 들어간 경우(정상 플로우에선 없음) 보수적으로 pending 복귀
update public.work_inspections set status = 'pending'
 where status in ('submitted', 'rejected');
update public.material_masters set inspection_method = 'BOTH'
 where inspection_method = 'NONE';

-- 2. 인덱스
drop index if exists public.work_inspections_product_photo_uq;
drop index if exists public.work_inspections_completion_product_uq;

-- 3. CHECK 제약(마이그레이션 이전에는 stage_check 외 CHECK 없었음)
alter table public.work_inspections  drop constraint if exists work_inspections_target_fields_check;
alter table public.work_inspections  drop constraint if exists work_inspections_target_type_check;
alter table public.work_inspections  drop constraint if exists work_inspections_method_check;
alter table public.work_inspections  drop constraint if exists work_inspections_status_check;
alter table public.inspection_images drop constraint if exists inspection_images_image_type_check;
alter table public.material_masters  drop constraint if exists material_masters_inspection_method_check;
alter table public.material_masters  alter column inspection_method set default 'OCR';

-- 4. 컬럼
alter table public.work_inspections
  drop column if exists target_type,
  drop column if exists product_code,
  drop column if exists product_name,
  drop column if exists product_lot,
  drop column if exists review_comment,
  drop column if exists submitted_at,
  drop column if exists reviewed_at;

commit;
