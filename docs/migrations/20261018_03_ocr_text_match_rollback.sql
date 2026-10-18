-- 0단계(선택): 입력 텍스트·판정 이력 백업
-- create table public._bak_wc_ocrtext_2026xxxx as
--   select id, work_id, component_code, ocr_expected_text from public.work_components where ocr_expected_text is not null;
-- create table public._bak_wi_ocrmatch_2026xxxx as
--   select id, ocr_expected_text, ocr_match_rate from public.work_inspections where ocr_match_rate is not null;
begin;
set local lock_timeout = '5s';
alter table public.work_inspections drop constraint if exists work_inspections_ocr_match_rate_check;
alter table public.work_components  drop constraint if exists work_components_ocr_expected_text_check;
alter table public.work_inspections drop column if exists ocr_match_rate, drop column if exists ocr_expected_text;
alter table public.work_components  drop column if exists ocr_expected_text;
commit;
