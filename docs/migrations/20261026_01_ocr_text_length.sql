-- 작업등록 OCR 검수 텍스트 길이 상한 200자 → 1000자 (부자재마스터 OCR 검증값이 200자를 넘는 경우 대응)
-- CHECK 제약만 교체(완화)하므로 기존 행은 모두 새 제약을 만족한다. 테이블 재작성 없음.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.work_components
  drop constraint if exists work_components_ocr_expected_text_check;
alter table public.work_components
  add constraint work_components_ocr_expected_text_check
  check (ocr_expected_text is null
         or (component_type = '부자재' and char_length(ocr_expected_text) between 1 and 1000));
commit;
