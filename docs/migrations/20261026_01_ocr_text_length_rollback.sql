-- 200자 상한으로 되돌린다. 200자를 넘는 텍스트가 저장된 행이 있으면 제약 추가가 실패하므로 먼저 확인한다.
-- select id, work_id, component_code, char_length(ocr_expected_text)
--   from public.work_components where char_length(ocr_expected_text) > 200;
begin;
set local lock_timeout = '5s';
alter table public.work_components
  drop constraint if exists work_components_ocr_expected_text_check;
alter table public.work_components
  add constraint work_components_ocr_expected_text_check
  check (ocr_expected_text is null
         or (component_type = '부자재' and char_length(ocr_expected_text) between 1 and 200));
commit;
