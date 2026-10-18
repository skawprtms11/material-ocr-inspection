-- 작업별 OCR 검수 텍스트 + 일치율 판정. 전부 nullable·default 없음 → 테이블 재작성 없음, 기존 행 영향 없음
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.work_components
  add column if not exists ocr_expected_text text;          -- 부자재 행만 사용, NULL = 미지정(마스터값 폴백)

alter table public.work_inspections
  add column if not exists ocr_expected_text text,          -- 판정 당시 기준 텍스트 스냅샷
  add column if not exists ocr_match_rate    numeric(5,1);  -- 최근 판정 일치율(%)

alter table public.work_components
  drop constraint if exists work_components_ocr_expected_text_check;
alter table public.work_components
  add constraint work_components_ocr_expected_text_check
  check (ocr_expected_text is null
         or (component_type = '부자재' and char_length(ocr_expected_text) between 1 and 200));

alter table public.work_inspections
  drop constraint if exists work_inspections_ocr_match_rate_check;
alter table public.work_inspections
  add constraint work_inspections_ocr_match_rate_check
  check (ocr_match_rate is null or (ocr_match_rate >= 0 and ocr_match_rate <= 100));

comment on column public.work_components.ocr_expected_text  is '작업등록 시 지정한 OCR 검수 텍스트(부자재). NULL이면 material_masters.verification_value 사용';
comment on column public.work_inspections.ocr_expected_text is 'OCR 판정 당시 기준 텍스트 스냅샷';
comment on column public.work_inspections.ocr_match_rate    is 'OCR 판정 일치율(%) — 공백 무시 Levenshtein 유사도';
commit;
