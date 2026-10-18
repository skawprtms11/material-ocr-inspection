-- =====================================================================
-- 작업지시서 출력 + 문서마스터 신규 테이블 3종
-- 작성: db-guard-team / 2026-10-18 / 대상: prod(PostgreSQL 17.6)
-- 사전 확인(SELECT): 대상 테이블·인덱스·타입 이름 충돌 0건, pgcrypto 설치,
--   public 함수·트리거 0건(updated_at 트리거 관례 없음 → API에서 명시 세팅),
--   기존 전 테이블 RLS enabled + 정책 0건(서비스롤 전용)
-- 기존 테이블 변경 없음(ALTER 0건). 멱등: 재실행해도 오류 없이 통과
-- =====================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) 문서양식(개정 단위 1행, 부서 소속)
CREATE TABLE IF NOT EXISTS public.document_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 기존 관례(works·shippers·마스터류 모두 departments CASCADE)와 맞춤
  department_id   uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  doc_kind        text NOT NULL DEFAULT 'work_order'
                    CHECK (doc_kind IN ('work_order')),
  code            text NOT NULL CHECK (btrim(code) <> ''),
  name            text NOT NULL CHECK (btrim(name) <> ''),
  revision_date   date NOT NULL,
  template_type   text NOT NULL DEFAULT 'layout'
                    CHECK (template_type IN ('layout', 'editor', 'file')),
  layout_key      text,
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb
                    CHECK (jsonb_typeof(settings) = 'object'),
  schema_version  integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  is_active       boolean NOT NULL DEFAULT true,
  memo            text,
  created_by      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_templates_layout_key_chk
    CHECK (template_type <> 'layout' OR (layout_key IS NOT NULL AND btrim(layout_key) <> '')),
  CONSTRAINT document_templates_code_rev_uk UNIQUE (department_id, code, revision_date)
);
CREATE INDEX IF NOT EXISTS document_templates_dept_idx
  ON public.document_templates (department_id, doc_kind, is_active, code);

-- 2) 화주별 사용 양식 매핑
CREATE TABLE IF NOT EXISTS public.shipper_document_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id   uuid NOT NULL REFERENCES public.shippers(id) ON DELETE CASCADE,
  -- NO ACTION(기본값): 매핑이 남은 양식의 직접 삭제는 차단하되,
  -- 부서 삭제 CASCADE 시 같은 문장 안에서 매핑이 먼저 지워지면 통과(RESTRICT는 즉시 검사라 막힘)
  template_id  uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE NO ACTION,
  is_default   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipper_document_templates_uk UNIQUE (shipper_id, template_id)
);
-- 화주당 기본양식 1개(기본 전환은 기존 기본 해제 → 대상 지정 순서 필수)
CREATE UNIQUE INDEX IF NOT EXISTS shipper_document_templates_default_uk
  ON public.shipper_document_templates (shipper_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS shipper_document_templates_template_idx
  ON public.shipper_document_templates (template_id);
-- 화주·양식 부서 일치는 DB가 아닌 API 가드에서 검증(shippers 복합 UNIQUE 추가 = 기존 테이블 ALTER 필요)

-- 3) 작업지시서 출력 이력(양식 스냅샷)
CREATE TABLE IF NOT EXISTS public.work_order_issues (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- works 하위 테이블(work_components·work_inspections 등) 관례와 동일하게 CASCADE
  work_id            uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  -- RESTRICT면 부서·화주 삭제 CASCADE 경로가 막히므로 works와 동일하게 CASCADE
  department_id      uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  shipper_id         uuid NOT NULL REFERENCES public.shippers(id) ON DELETE CASCADE,
  template_id        uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  template_code      text NOT NULL,
  template_name      text NOT NULL,
  revision_date      date NOT NULL,
  template_type      text NOT NULL CHECK (template_type IN ('layout', 'editor', 'file')),
  layout_key         text,
  settings_snapshot  jsonb NOT NULL DEFAULT '{}'::jsonb
                       CHECK (jsonb_typeof(settings_snapshot) = 'object'),
  issue_kind         text NOT NULL CHECK (issue_kind IN ('initial', 'reprint')),
  assigned_on_issue  boolean NOT NULL DEFAULT false,
  issued_by          uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  issued_by_name     text,
  issued_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_issues_work_idx
  ON public.work_order_issues (work_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS work_order_issues_scope_idx
  ON public.work_order_issues (department_id, shipper_id, issued_at DESC);
-- 양식 삭제 시 SET NULL 처리용
CREATE INDEX IF NOT EXISTS work_order_issues_template_idx
  ON public.work_order_issues (template_id) WHERE template_id IS NOT NULL;

-- 4) RLS: 기존 관례(enable + 정책 0건, 서비스롤만 접근)
ALTER TABLE public.document_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipper_document_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_issues           ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.document_templates IS '문서양식(개정 단위 행, 부서 소속)';
COMMENT ON TABLE public.shipper_document_templates IS '화주별 사용 문서양식 매핑';
COMMENT ON TABLE public.work_order_issues IS '작업지시서 출력(요청) 이력 + 양식 스냅샷';

COMMIT;

-- ---------------------------------------------------------------------
-- 적용 후 확인(SELECT)
-- select table_name from information_schema.tables where table_schema='public'
--   and table_name in ('document_templates','shipper_document_templates','work_order_issues');
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid in ('public.document_templates'::regclass,
--     'public.shipper_document_templates'::regclass,'public.work_order_issues'::regclass);
-- select relname, relrowsecurity from pg_class where relname in
--   ('document_templates','shipper_document_templates','work_order_issues');
-- PostgREST 스키마 캐시 미반영 시: NOTIFY pgrst, 'reload schema';
-- ---------------------------------------------------------------------
