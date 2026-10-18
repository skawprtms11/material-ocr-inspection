-- =====================================================================
-- 롤백: 작업지시서 출력 + 문서마스터 테이블 3종 제거
-- 주의: 출력 이력·양식·매핑 데이터가 영구 삭제됨. 실행 전 건수 확인 및 필요 시 백업
--   select (select count(*) from public.document_templates) t,
--          (select count(*) from public.shipper_document_templates) m,
--          (select count(*) from public.work_order_issues) i;
-- works.assigned_at(출력 시 자동배정 값)은 이 롤백으로 원복되지 않음(기존 컬럼, 별도 판단)
-- 기존 테이블 영향 없음(신규 테이블만 참조하는 방향)
-- =====================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TABLE IF EXISTS public.work_order_issues;
DROP TABLE IF EXISTS public.shipper_document_templates;
DROP TABLE IF EXISTS public.document_templates;

COMMIT;
