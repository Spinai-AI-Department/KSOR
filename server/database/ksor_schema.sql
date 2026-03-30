-- ============================================================================
-- KSOR / Korean Spinoscopy Outcome Registry
-- PostgreSQL schema (multi-tenant, on-prem, closed-login, audit-ready)
-- Target: PostgreSQL 16+ (works best on PostgreSQL 18 with uuidv7 fallback)
-- Notes:
--   1) All end-user IDs are application-managed (not PostgreSQL login roles).
--   2) The application should set request context per transaction:
--      SELECT app_private.set_context(:user_id, :hospital_code, :role, :request_id, :client_ip, true);
--   3) Store patient direct identifiers only in vault.patient_identity.
--   4) Run a scheduler to refresh analytics materialized views and rotate partitions.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------------------------
-- Schemas
-- --------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS patient;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS survey;
CREATE SCHEMA IF NOT EXISTS messaging;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;

-- --------------------------------------------------------------------------
-- Enum types
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'auth' AND t.typname = 'app_role'
    ) THEN
        CREATE TYPE auth.app_role AS ENUM ('ADMIN', 'STEERING', 'PI', 'CRC', 'AUDITOR', 'SYSTEM');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'patient' AND t.typname = 'sex_type'
    ) THEN
        CREATE TYPE patient.sex_type AS ENUM ('M', 'F', 'OTHER', 'UNKNOWN');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'clinical' AND t.typname = 'case_status'
    ) THEN
        CREATE TYPE clinical.case_status AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED', 'CLOSED', 'ARCHIVED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'clinical' AND t.typname = 'spinal_region'
    ) THEN
        CREATE TYPE clinical.spinal_region AS ENUM ('CERVICAL', 'THORACIC', 'LUMBAR', 'SACRAL', 'MULTI', 'UNKNOWN');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'clinical' AND t.typname = 'memo_visibility'
    ) THEN
        CREATE TYPE clinical.memo_visibility AS ENUM ('PRIVATE', 'HOSPITAL', 'ADMIN');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'survey' AND t.typname = 'token_status'
    ) THEN
        CREATE TYPE survey.token_status AS ENUM ('READY', 'SENT', 'OPENED', 'VERIFIED', 'SUBMITTED', 'EXPIRED', 'FAILED', 'REVOKED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'messaging' AND t.typname = 'message_channel'
    ) THEN
        CREATE TYPE messaging.message_channel AS ENUM ('KAKAO_ALIMTALK', 'EMAIL', 'SMS');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'messaging' AND t.typname = 'message_status'
    ) THEN
        CREATE TYPE messaging.message_status AS ENUM ('QUEUED', 'LEASED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'CANCELLED', 'EXPIRED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'auth' AND t.typname = 'auth_event_type'
    ) THEN
        CREATE TYPE auth.auth_event_type AS ENUM (
            'LOGIN_SUCCESS',
            'LOGIN_FAILURE',
            'ACCOUNT_LOCKED',
            'LOGOUT',
            'TOKEN_REFRESH',
            'PASSWORD_RESET_REQUEST',
            'PASSWORD_RESET_SUCCESS',
            'PASSWORD_RESET_FAILURE'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'ops' AND t.typname = 'export_scope'
    ) THEN
        CREATE TYPE ops.export_scope AS ENUM ('SITE', 'GLOBAL');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'ops' AND t.typname = 'approval_status'
    ) THEN
        CREATE TYPE ops.approval_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DOWNLOADED', 'CANCELLED');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'auth' AND t.typname = 'reset_channel'
    ) THEN
        CREATE TYPE auth.reset_channel AS ENUM ('EMAIL', 'ALIMTALK', 'ADMIN');
    END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Context / helper functions
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.gen_uuid_pk()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_uuid uuid;
BEGIN
    IF to_regprocedure('uuidv7()') IS NOT NULL THEN
        EXECUTE 'SELECT uuidv7()' INTO v_uuid;
    ELSE
        v_uuid := gen_random_uuid();
    END IF;
    RETURN v_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_private.current_app_hospital_code()
RETURNS varchar(20)
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.hospital_code', true), '')::varchar(20);
$$;

CREATE OR REPLACE FUNCTION app_private.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE OR REPLACE FUNCTION app_private.current_request_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.request_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_private.current_request_ip()
RETURNS inet
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.request_ip', true), '')::inet;
$$;

CREATE OR REPLACE FUNCTION app_private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(app_private.current_app_role() IN ('ADMIN', 'STEERING', 'SYSTEM'), false);
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_hospital(p_hospital_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app_private.is_admin()
           OR p_hospital_code = app_private.current_app_hospital_code();
$$;

CREATE OR REPLACE FUNCTION app_private.set_context(
    p_user_id uuid,
    p_hospital_code text,
    p_role text,
    p_request_id uuid DEFAULT app_private.gen_uuid_pk(),
    p_request_ip inet DEFAULT NULL,
    p_is_local boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', COALESCE(p_user_id::text, ''), p_is_local);
    PERFORM set_config('app.hospital_code', COALESCE(p_hospital_code, ''), p_is_local);
    PERFORM set_config('app.role', COALESCE(p_role, ''), p_is_local);
    PERFORM set_config('app.request_id', COALESCE(p_request_id::text, ''), p_is_local);
    PERFORM set_config('app.request_ip', COALESCE(p_request_ip::text, ''), p_is_local);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.clear_context(p_is_local boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', '', p_is_local);
    PERFORM set_config('app.hospital_code', '', p_is_local);
    PERFORM set_config('app.role', '', p_is_local);
    PERFORM set_config('app.request_id', '', p_is_local);
    PERFORM set_config('app.request_ip', '', p_is_local);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.redact_jsonb(p_doc jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_doc IS NULL THEN NULL
        ELSE p_doc - ARRAY[
            'password_hash',
            'refresh_token_hash',
            'token_hash',
            'download_token_hash',
            'local_mrn_enc',
            'full_name_enc',
            'phone_enc',
            'birth_date_enc',
            'response_body',
            'request_payload',
            'response_payload'
        ]
    END;
$$;

CREATE OR REPLACE FUNCTION app_private.jsonb_changed_columns(p_old jsonb, p_new jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::text[])
    FROM (
        SELECT COALESCE(n.key, o.key) AS key,
               n.value AS new_value,
               o.value AS old_value
        FROM jsonb_each(COALESCE(p_new, '{}'::jsonb)) n
        FULL OUTER JOIN jsonb_each(COALESCE(p_old, '{}'::jsonb)) o USING (key)
    ) s
    WHERE new_value IS DISTINCT FROM old_value;
$$;

CREATE OR REPLACE FUNCTION app_private.tg_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.created_at IS NULL THEN
            NEW.created_at := now();
        END IF;
        IF NEW.created_by IS NULL THEN
            NEW.created_by := app_private.current_app_user_id();
        END IF;
        IF NEW.hospital_code IS NULL THEN
            NEW.hospital_code := app_private.current_app_hospital_code();
        END IF;
    END IF;

    NEW.updated_at := now();
    NEW.updated_by := COALESCE(app_private.current_app_user_id(), NEW.updated_by);
    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- Reference / master tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref.hospital (
    hospital_code         varchar(20) PRIMARY KEY,
    hospital_name         varchar(255) NOT NULL,
    hospital_short_name   varchar(120),
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.role_catalog (
    role_code             auth.app_role PRIMARY KEY,
    role_name_ko          varchar(100) NOT NULL,
    role_description      text,
    is_system_role        boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS ref.timepoint (
    timepoint_code        varchar(30) PRIMARY KEY,
    display_name_ko       varchar(100) NOT NULL,
    display_name_en       varchar(100),
    sort_order            integer NOT NULL,
    day_offset_from_sx    integer,
    window_start_day      integer,
    window_end_day        integer,
    is_active             boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ref.diagnosis_code (
    diagnosis_code        varchar(30) PRIMARY KEY,
    display_name_ko       varchar(150) NOT NULL,
    display_name_en       varchar(150),
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.procedure_code (
    procedure_code        varchar(30) PRIMARY KEY,
    display_name_ko       varchar(150) NOT NULL,
    display_name_en       varchar(150),
    spinal_region         clinical.spinal_region NOT NULL DEFAULT 'UNKNOWN',
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.prom_instrument (
    instrument_code       varchar(30) PRIMARY KEY,
    display_name_ko       varchar(150) NOT NULL,
    display_name_en       varchar(150),
    version_label         varchar(50),
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ref.prom_question_bank (
    question_bank_id      uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    instrument_code       varchar(30) NOT NULL REFERENCES ref.prom_instrument(instrument_code),
    question_code         varchar(50) NOT NULL,
    display_order         integer NOT NULL,
    question_text_ko      text,
    response_type         varchar(30) NOT NULL,
    options_jsonb         jsonb,
    min_score             numeric(8,2),
    max_score             numeric(8,2),
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instrument_code, question_code)
);

CREATE INDEX IF NOT EXISTS idx_prom_question_bank_instrument_order
    ON ref.prom_question_bank (instrument_code, display_order);

INSERT INTO auth.role_catalog (role_code, role_name_ko, role_description, is_system_role)
VALUES
    ('ADMIN', '최고관리자', '전체 기관/회원/내보내기 승인 권한', true),
    ('STEERING', '운영위원', '전체 통계 조회 및 승인 업무', true),
    ('PI', '책임연구자', '기관 데이터 입력/조회 및 잠금 관리', false),
    ('CRC', '연구코디네이터', '기관 데이터 입력/조회', false),
    ('AUDITOR', '감사/모니터링', '로그/감사 위주 열람', true),
    ('SYSTEM', '시스템', '백엔드 배치/워커 전용 내부 역할', true)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO ref.timepoint (
    timepoint_code, display_name_ko, display_name_en, sort_order,
    day_offset_from_sx, window_start_day, window_end_day, is_active
)
VALUES
    ('PREOP', '수술 전', 'Pre-op', 10, NULL, NULL, NULL, true),
    ('POSTOP_1M', '수술 후 1개월', 'Post-op 1 month', 20, 30, 21, 45, true),
    ('POSTOP_3M', '수술 후 3개월', 'Post-op 3 months', 30, 90, 76, 120, true),
    ('POSTOP_6M', '수술 후 6개월', 'Post-op 6 months', 40, 180, 151, 210, true),
    ('POSTOP_12M', '수술 후 12개월', 'Post-op 12 months', 50, 365, 330, 420, true),
    ('POSTOP_24M', '수술 후 24개월', 'Post-op 24 months', 60, 730, 690, 790, true)
ON CONFLICT (timepoint_code) DO NOTHING;

INSERT INTO ref.diagnosis_code (diagnosis_code, display_name_ko, display_name_en, is_active)
VALUES
    ('HNP', '추간판탈출증', 'Herniated nucleus pulposus', true),
    ('STENOSIS', '척추관협착증', 'Spinal stenosis', true),
    ('SPONDY', '척추전방전위증', 'Spondylolisthesis', true)
ON CONFLICT (diagnosis_code) DO NOTHING;

INSERT INTO ref.procedure_code (procedure_code, display_name_ko, display_name_en, spinal_region, is_active)
VALUES
    ('UBE', '양방향 내시경', 'Unilateral biportal endoscopy', 'LUMBAR', true),
    ('FULL_ENDO', '단일공 내시경', 'Full-endoscopic', 'LUMBAR', true),
    ('SPINOSCOPY', 'Spinoscopy', 'Spinoscopy', 'LUMBAR', true)
ON CONFLICT (procedure_code) DO NOTHING;

INSERT INTO ref.prom_instrument (instrument_code, display_name_ko, display_name_en, version_label, is_active)
VALUES
    ('VAS', '시각통증척도', 'Visual Analog Scale', 'v1', true),
    ('ODI', 'Oswestry Disability Index', 'Oswestry Disability Index', 'v1', true),
    ('NDI', 'Neck Disability Index', 'Neck Disability Index', 'v1', true),
    ('EQ5D5L', 'EQ-5D-5L', 'EQ-5D-5L', 'v1', true),
    ('FOLLOWUP', '추적관찰 문항', 'Follow-up questions', 'v1', true)
ON CONFLICT (instrument_code) DO NOTHING;

-- --------------------------------------------------------------------------
-- Audit tables (high-volume logs are partitioned by time)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.api_request_log (
    occurred_at           timestamptz NOT NULL DEFAULT now(),
    request_log_id        uuid NOT NULL DEFAULT app_private.gen_uuid_pk(),
    request_id            uuid,
    session_id            uuid,
    user_id               uuid,
    hospital_code         varchar(20),
    client_ip             inet,
    forwarded_for         text,
    http_method           varchar(10) NOT NULL,
    request_path          text NOT NULL,
    query_string          text,
    response_status       integer,
    latency_ms            integer,
    request_bytes         bigint,
    response_bytes        bigint,
    app_node              text,
    load_balancer_id      text,
    trace_id              text,
    error_code            text,
    PRIMARY KEY (occurred_at, request_log_id)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS audit.api_request_log_2026
    PARTITION OF audit.api_request_log
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit.api_request_log_2027
    PARTITION OF audit.api_request_log
    FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit.api_request_log_default
    PARTITION OF audit.api_request_log DEFAULT;

CREATE INDEX IF NOT EXISTS idx_api_request_log_request_id
    ON audit.api_request_log (request_id);
CREATE INDEX IF NOT EXISTS idx_api_request_log_user_time
    ON audit.api_request_log (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_hospital_time
    ON audit.api_request_log (hospital_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_log_path_time
    ON audit.api_request_log (request_path, occurred_at DESC);

CREATE TABLE IF NOT EXISTS audit.change_log (
    changed_at            timestamptz NOT NULL DEFAULT now(),
    change_id             uuid NOT NULL DEFAULT app_private.gen_uuid_pk(),
    hospital_code         varchar(20),
    user_id               uuid,
    request_id            uuid,
    client_ip             inet,
    schema_name           text NOT NULL,
    table_name            text NOT NULL,
    action                varchar(10) NOT NULL,
    entity_pk             jsonb NOT NULL DEFAULT '{}'::jsonb,
    changed_columns       text[] NOT NULL DEFAULT ARRAY[]::text[],
    txid                  bigint NOT NULL DEFAULT txid_current(),
    app_node              text,
    row_before            jsonb,
    row_after             jsonb,
    PRIMARY KEY (changed_at, change_id)
) PARTITION BY RANGE (changed_at);

CREATE TABLE IF NOT EXISTS audit.change_log_2026
    PARTITION OF audit.change_log
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit.change_log_2027
    PARTITION OF audit.change_log
    FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS audit.change_log_default
    PARTITION OF audit.change_log DEFAULT;

CREATE INDEX IF NOT EXISTS idx_change_log_request_id
    ON audit.change_log (request_id);
CREATE INDEX IF NOT EXISTS idx_change_log_hospital_time
    ON audit.change_log (hospital_code, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_user_time
    ON audit.change_log (user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_table_time
    ON audit.change_log (schema_name, table_name, changed_at DESC);

CREATE TABLE IF NOT EXISTS audit.security_event (
    security_event_id     uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code         varchar(20),
    user_id               uuid,
    client_ip             inet,
    severity              varchar(10) NOT NULL DEFAULT 'WARN',
    event_type            varchar(60) NOT NULL,
    event_detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at           timestamptz NOT NULL DEFAULT now(),
    resolved_at           timestamptz,
    resolved_by           uuid
);

CREATE INDEX IF NOT EXISTS idx_security_event_hospital_time
    ON audit.security_event (hospital_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_event_user_time
    ON audit.security_event (user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION app_private.tg_audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_old                jsonb;
    v_new                jsonb;
    v_pk                 jsonb := '{}'::jsonb;
    v_hospital_code      varchar(20);
    v_changed_columns    text[];
    i                    integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := app_private.redact_jsonb(to_jsonb(NEW));
        v_old := NULL;
        v_hospital_code := (v_new ->> 'hospital_code')::varchar(20);
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := app_private.redact_jsonb(to_jsonb(OLD));
        v_new := app_private.redact_jsonb(to_jsonb(NEW));
        v_hospital_code := COALESCE((v_new ->> 'hospital_code')::varchar(20), (v_old ->> 'hospital_code')::varchar(20));
    ELSE
        v_old := app_private.redact_jsonb(to_jsonb(OLD));
        v_new := NULL;
        v_hospital_code := (v_old ->> 'hospital_code')::varchar(20);
    END IF;

    v_changed_columns := app_private.jsonb_changed_columns(v_old, v_new);

    IF TG_NARGS > 0 THEN
        FOR i IN 0 .. TG_NARGS - 1 LOOP
            v_pk := v_pk || jsonb_build_object(
                TG_ARGV[i],
                COALESCE(v_new -> TG_ARGV[i], v_old -> TG_ARGV[i])
            );
        END LOOP;
    END IF;

    INSERT INTO audit.change_log (
        changed_at,
        change_id,
        hospital_code,
        user_id,
        request_id,
        client_ip,
        schema_name,
        table_name,
        action,
        entity_pk,
        changed_columns,
        txid,
        app_node,
        row_before,
        row_after
    ) VALUES (
        now(),
        app_private.gen_uuid_pk(),
        v_hospital_code,
        app_private.current_app_user_id(),
        app_private.current_request_id(),
        app_private.current_request_ip(),
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        TG_OP,
        v_pk,
        v_changed_columns,
        txid_current(),
        current_setting('application_name', true),
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- --------------------------------------------------------------------------
-- Authentication / account tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth.user_account (
    user_id                    uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code              varchar(20) REFERENCES ref.hospital(hospital_code),
    login_id                   varchar(100) NOT NULL,
    password_hash              text NOT NULL,
    password_algo              varchar(30) NOT NULL DEFAULT 'argon2id',
    full_name                  varchar(100) NOT NULL,
    email                      varchar(255),
    phone                      varchar(30),
    role_code                  auth.app_role NOT NULL,
    is_first_login             boolean NOT NULL DEFAULT true,
    password_reset_required    boolean NOT NULL DEFAULT false,
    is_active                  boolean NOT NULL DEFAULT true,
    is_locked                  boolean NOT NULL DEFAULT false,
    failed_login_count         integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    last_login_at              timestamptz,
    last_active_at             timestamptz,
    last_password_changed_at   timestamptz,
    locked_at                  timestamptz,
    locked_reason              text,
    deleted_at                 timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid,
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    updated_by                 uuid,
    CONSTRAINT chk_user_hospital_required
        CHECK (
            role_code IN ('ADMIN', 'STEERING', 'AUDITOR', 'SYSTEM')
            OR hospital_code IS NOT NULL
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_account_login_id_ci
    ON auth.user_account (lower(login_id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_account_email_ci
    ON auth.user_account (lower(email))
    WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_account_hospital_role
    ON auth.user_account (hospital_code, role_code);

CREATE INDEX IF NOT EXISTS idx_user_account_active
    ON auth.user_account (is_active, is_locked);

CREATE TABLE IF NOT EXISTS auth.user_password_history (
    password_history_id        uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    user_id                    uuid NOT NULL REFERENCES auth.user_account(user_id),
    password_hash              text NOT NULL,
    changed_at                 timestamptz NOT NULL DEFAULT now(),
    changed_by                 uuid
);

CREATE INDEX IF NOT EXISTS idx_user_password_history_user_time
    ON auth.user_password_history (user_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS auth.auth_session (
    session_id                 uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    user_id                    uuid NOT NULL REFERENCES auth.user_account(user_id),
    refresh_token_hash         char(64) NOT NULL,
    access_jti                 uuid NOT NULL DEFAULT app_private.gen_uuid_pk(),
    issued_at                  timestamptz NOT NULL DEFAULT now(),
    last_seen_at               timestamptz NOT NULL DEFAULT now(),
    expires_at                 timestamptz NOT NULL,
    revoked_at                 timestamptz,
    revoke_reason              text,
    client_ip                  inet,
    forwarded_for              text,
    user_agent                 text,
    device_fingerprint         text,
    app_node                   text,
    load_balancer_id           text,
    request_id                 uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid,
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    updated_by                 uuid,
    CONSTRAINT uq_auth_session_refresh_hash UNIQUE (refresh_token_hash),
    CONSTRAINT chk_auth_session_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_active
    ON auth.auth_session (user_id, revoked_at, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_session_last_seen
    ON auth.auth_session (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS auth.password_reset_token (
    reset_token_id             uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    user_id                    uuid NOT NULL REFERENCES auth.user_account(user_id),
    token_hash                 char(64) NOT NULL,
    reset_channel              auth.reset_channel NOT NULL DEFAULT 'EMAIL',
    request_ip                 inet,
    requested_at               timestamptz NOT NULL DEFAULT now(),
    expires_at                 timestamptz NOT NULL,
    used_at                    timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid,
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    updated_by                 uuid,
    CONSTRAINT uq_password_reset_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_password_reset_expiry CHECK (expires_at > requested_at)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_time
    ON auth.password_reset_token (user_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS auth.login_event (
    login_event_id             uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    user_id                    uuid REFERENCES auth.user_account(user_id),
    login_id                   varchar(100),
    hospital_code              varchar(20),
    event_type                 auth.auth_event_type NOT NULL,
    success                    boolean NOT NULL,
    failure_reason             text,
    failed_attempt_number      integer,
    request_id                 uuid,
    client_ip                  inet,
    forwarded_for              text,
    user_agent                 text,
    app_node                   text,
    occurred_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_event_user_time
    ON auth.login_event (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_event_hospital_time
    ON auth.login_event (hospital_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_event_login_id_time
    ON auth.login_event (login_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS auth.hospital_ip_allowlist (
    allowlist_id               uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code              varchar(20) NOT NULL REFERENCES ref.hospital(hospital_code),
    allowed_cidr               cidr NOT NULL,
    description                text,
    is_active                  boolean NOT NULL DEFAULT true,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid,
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    updated_by                 uuid
);

CREATE INDEX IF NOT EXISTS idx_hospital_ip_allowlist_hospital
    ON auth.hospital_ip_allowlist (hospital_code, is_active);

CREATE OR REPLACE FUNCTION auth.tg_guard_user_account_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF app_private.is_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.user_id IS DISTINCT FROM app_private.current_app_user_id() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '본인 계정만 수정할 수 있습니다.';
    END IF;

    IF (NEW.role_code, NEW.hospital_code, NEW.login_id, NEW.is_active, NEW.is_locked, NEW.deleted_at)
       IS DISTINCT FROM
       (OLD.role_code, OLD.hospital_code, OLD.login_id, OLD.is_active, OLD.is_locked, OLD.deleted_at) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '권한/소속/잠금/삭제 상태는 관리자만 변경할 수 있습니다.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auth.get_user_auth_snapshot(p_login_id text)
RETURNS TABLE (
    user_id                   uuid,
    hospital_code             varchar(20),
    login_id                  varchar(100),
    password_hash             text,
    password_algo             varchar(30),
    full_name                 varchar(100),
    role_code                 auth.app_role,
    is_first_login            boolean,
    password_reset_required   boolean,
    is_active                 boolean,
    is_locked                 boolean,
    failed_login_count        integer,
    last_password_changed_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
    SELECT ua.user_id,
           ua.hospital_code,
           ua.login_id,
           ua.password_hash,
           ua.password_algo,
           ua.full_name,
           ua.role_code,
           ua.is_first_login,
           ua.password_reset_required,
           ua.is_active,
           ua.is_locked,
           ua.failed_login_count,
           ua.last_password_changed_at
      FROM auth.user_account ua
     WHERE lower(ua.login_id) = lower(p_login_id)
       AND ua.deleted_at IS NULL
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth.record_login_attempt(
    p_login_id text,
    p_success boolean,
    p_failure_reason text DEFAULT NULL,
    p_request_id uuid DEFAULT NULL,
    p_client_ip inet DEFAULT NULL,
    p_forwarded_for text DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_app_node text DEFAULT NULL
)
RETURNS TABLE (
    user_id uuid,
    failed_login_count integer,
    is_locked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app_private
AS $$
DECLARE
    v_user          auth.user_account%ROWTYPE;
    v_new_fail      integer;
    v_event_type    auth.auth_event_type;
BEGIN
    SELECT *
      INTO v_user
      FROM auth.user_account
     WHERE lower(login_id) = lower(p_login_id)
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO auth.login_event (
            login_event_id,
            user_id,
            login_id,
            hospital_code,
            event_type,
            success,
            failure_reason,
            failed_attempt_number,
            request_id,
            client_ip,
            forwarded_for,
            user_agent,
            app_node,
            occurred_at
        ) VALUES (
            app_private.gen_uuid_pk(),
            NULL,
            p_login_id,
            NULL,
            'LOGIN_FAILURE',
            false,
            COALESCE(p_failure_reason, 'LOGIN_ID_NOT_FOUND'),
            NULL,
            p_request_id,
            p_client_ip,
            p_forwarded_for,
            p_user_agent,
            p_app_node,
            now()
        );
        RETURN;
    END IF;

    IF p_success AND NOT v_user.is_locked THEN
        UPDATE auth.user_account
           SET failed_login_count = 0,
               last_login_at = now(),
               last_active_at = now(),
               updated_at = now()
         WHERE user_id = v_user.user_id
     RETURNING auth.user_account.user_id,
               auth.user_account.failed_login_count,
               auth.user_account.is_locked
          INTO user_id, failed_login_count, is_locked;

        v_event_type := 'LOGIN_SUCCESS';
    ELSE
        v_new_fail := CASE
            WHEN v_user.is_locked THEN v_user.failed_login_count
            ELSE COALESCE(v_user.failed_login_count, 0) + 1
        END;

        UPDATE auth.user_account
           SET failed_login_count = v_new_fail,
               is_locked = CASE WHEN v_user.is_locked THEN true WHEN v_new_fail >= 5 THEN true ELSE false END,
               locked_at = CASE WHEN v_user.is_locked THEN v_user.locked_at WHEN v_new_fail >= 5 THEN now() ELSE NULL END,
               locked_reason = CASE WHEN v_user.is_locked THEN COALESCE(v_user.locked_reason, 'ADMIN_LOCKED')
                                    WHEN v_new_fail >= 5 THEN COALESCE(p_failure_reason, 'LOGIN_FAILED_5_TIMES')
                                    ELSE NULL END,
               updated_at = now()
         WHERE user_id = v_user.user_id
     RETURNING auth.user_account.user_id,
               auth.user_account.failed_login_count,
               auth.user_account.is_locked
          INTO user_id, failed_login_count, is_locked;

        v_event_type := CASE WHEN is_locked THEN 'ACCOUNT_LOCKED' ELSE 'LOGIN_FAILURE' END;
    END IF;

    INSERT INTO auth.login_event (
        login_event_id,
        user_id,
        login_id,
        hospital_code,
        event_type,
        success,
        failure_reason,
        failed_attempt_number,
        request_id,
        client_ip,
        forwarded_for,
        user_agent,
        app_node,
        occurred_at
    ) VALUES (
        app_private.gen_uuid_pk(),
        v_user.user_id,
        v_user.login_id,
        v_user.hospital_code,
        v_event_type,
        p_success AND NOT v_user.is_locked,
        p_failure_reason,
        failed_login_count,
        p_request_id,
        p_client_ip,
        p_forwarded_for,
        p_user_agent,
        p_app_node,
        now()
    );

    RETURN NEXT;
END;
$$;

-- --------------------------------------------------------------------------
-- Patient / identity vault tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient.patient (
    patient_id                  uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code               varchar(20) NOT NULL REFERENCES ref.hospital(hospital_code),
    patient_initial             varchar(20) NOT NULL,
    sex                         patient.sex_type NOT NULL DEFAULT 'UNKNOWN',
    birth_year                  smallint CHECK (birth_year BETWEEN 1900 AND 2100),
    is_active                   boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    UNIQUE (patient_id, hospital_code)
);

CREATE INDEX IF NOT EXISTS idx_patient_hospital_initial
    ON patient.patient (hospital_code, patient_initial);
CREATE INDEX IF NOT EXISTS idx_patient_hospital_active
    ON patient.patient (hospital_code, is_active);

CREATE TABLE IF NOT EXISTS vault.patient_identity (
    patient_id                  uuid PRIMARY KEY,
    hospital_code               varchar(20) NOT NULL,
    local_mrn_enc               bytea,
    local_mrn_sha256            char(64),
    full_name_enc               bytea,
    phone_enc                   bytea,
    phone_sha256                char(64),
    phone_last4_sha256          char(64),
    birth_date_enc              bytea,
    birth_ymd_sha256            char(64),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    UNIQUE (patient_id, hospital_code),
    CONSTRAINT fk_patient_identity_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_patient_identity_phone_consistency
        CHECK (
            (phone_enc IS NULL AND phone_sha256 IS NULL AND phone_last4_sha256 IS NULL)
            OR
            (phone_enc IS NOT NULL AND phone_sha256 IS NOT NULL AND phone_last4_sha256 IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_identity_local_mrn_hash
    ON vault.patient_identity (hospital_code, local_mrn_sha256)
    WHERE local_mrn_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_identity_phone_hash
    ON vault.patient_identity (hospital_code, phone_sha256)
    WHERE phone_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_identity_phone_last4_hash
    ON vault.patient_identity (hospital_code, phone_last4_sha256)
    WHERE phone_last4_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_identity_birth_hash
    ON vault.patient_identity (hospital_code, birth_ymd_sha256)
    WHERE birth_ymd_sha256 IS NOT NULL;

-- --------------------------------------------------------------------------
-- Clinical / registry core tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical.registration_counter (
    hospital_code               varchar(20) NOT NULL REFERENCES ref.hospital(hospital_code),
    yymm                        char(4) NOT NULL,
    last_value                  integer NOT NULL DEFAULT 0 CHECK (last_value >= 0),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (hospital_code, yymm)
);

CREATE TABLE IF NOT EXISTS clinical.case_record (
    case_id                     uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code               varchar(20) NOT NULL REFERENCES ref.hospital(hospital_code),
    patient_id                  uuid NOT NULL,
    registration_no             varchar(40) NOT NULL,
    consent_date                date,
    visit_date                  date NOT NULL,
    surgery_date                date,
    diagnosis_code              varchar(30) REFERENCES ref.diagnosis_code(diagnosis_code),
    procedure_code              varchar(30) REFERENCES ref.procedure_code(procedure_code),
    spinal_region               clinical.spinal_region NOT NULL DEFAULT 'UNKNOWN',
    surgeon_user_id             uuid REFERENCES auth.user_account(user_id),
    coordinator_user_id         uuid REFERENCES auth.user_account(user_id),
    case_status                 clinical.case_status NOT NULL DEFAULT 'DRAFT',
    is_locked                   boolean NOT NULL DEFAULT false,
    locked_at                   timestamptz,
    locked_by                   uuid REFERENCES auth.user_account(user_id),
    lock_reason                 text,
    enrollment_source           varchar(30) NOT NULL DEFAULT 'WEB',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    UNIQUE (registration_no),
    UNIQUE (case_id, hospital_code),
    CONSTRAINT fk_case_record_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code)
);

CREATE INDEX IF NOT EXISTS idx_case_record_hospital_visit
    ON clinical.case_record (hospital_code, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_case_record_hospital_surgery
    ON clinical.case_record (hospital_code, surgery_date DESC);
CREATE INDEX IF NOT EXISTS idx_case_record_hospital_status
    ON clinical.case_record (hospital_code, case_status, is_locked);
CREATE INDEX IF NOT EXISTS idx_case_record_hospital_diagnosis
    ON clinical.case_record (hospital_code, diagnosis_code);
CREATE INDEX IF NOT EXISTS idx_case_record_hospital_procedure
    ON clinical.case_record (hospital_code, procedure_code);
CREATE INDEX IF NOT EXISTS idx_case_record_patient
    ON clinical.case_record (patient_id, surgery_date DESC);
CREATE INDEX IF NOT EXISTS idx_case_record_surgeon
    ON clinical.case_record (surgeon_user_id, surgery_date DESC);

CREATE TABLE IF NOT EXISTS clinical.case_initial_form (
    case_id                     uuid PRIMARY KEY,
    hospital_code               varchar(20) NOT NULL,
    patient_id                  uuid NOT NULL,
    comorbidities               jsonb NOT NULL DEFAULT '[]'::jsonb,
    diagnosis_detail            text,
    symptom_duration_weeks      numeric(8,2),
    baseline_neuro_deficit_yn   boolean,
    preop_medication_jsonb      jsonb NOT NULL DEFAULT '[]'::jsonb,
    preop_image_findings        text,
    additional_attributes       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    CONSTRAINT fk_case_initial_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_initial_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_case_initial_comorbidities_is_array
        CHECK (jsonb_typeof(comorbidities) = 'array'),
    CONSTRAINT chk_case_initial_preop_med_is_array
        CHECK (jsonb_typeof(preop_medication_jsonb) = 'array'),
    CONSTRAINT chk_case_initial_additional_is_object
        CHECK (jsonb_typeof(additional_attributes) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_case_initial_patient
    ON clinical.case_initial_form (patient_id);
CREATE INDEX IF NOT EXISTS idx_case_initial_comorbidities_gin
    ON clinical.case_initial_form USING GIN (comorbidities);

CREATE TABLE IF NOT EXISTS clinical.case_extended_form (
    case_id                     uuid PRIMARY KEY,
    hospital_code               varchar(20) NOT NULL,
    patient_id                  uuid NOT NULL,
    surgery_level               varchar(100),
    approach_type               varchar(100),
    laterality                  varchar(50),
    operation_minutes           integer CHECK (operation_minutes >= 0),
    estimated_blood_loss_ml     integer CHECK (estimated_blood_loss_ml >= 0),
    anesthesia_type             varchar(100),
    implant_used_yn             boolean,
    discharge_date              date,
    hospital_stay_days          numeric(8,2) CHECK (hospital_stay_days >= 0),
    adverse_events_jsonb        jsonb NOT NULL DEFAULT '[]'::jsonb,
    intraop_note                text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    CONSTRAINT fk_case_extended_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_extended_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_case_extended_adverse_events_is_array
        CHECK (jsonb_typeof(adverse_events_jsonb) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_case_extended_patient
    ON clinical.case_extended_form (patient_id);
CREATE INDEX IF NOT EXISTS idx_case_extended_adverse_events_gin
    ON clinical.case_extended_form USING GIN (adverse_events_jsonb);

CREATE TABLE IF NOT EXISTS clinical.case_outcome_form (
    case_id                     uuid PRIMARY KEY,
    hospital_code               varchar(20) NOT NULL,
    patient_id                  uuid NOT NULL,
    complication_yn             boolean,
    complication_detail         text,
    readmission_30d_yn          boolean,
    reoperation_yn              boolean,
    surgeon_global_outcome      smallint CHECK (surgeon_global_outcome BETWEEN 1 AND 5),
    return_to_work_yn           boolean,
    final_note                  text,
    outcome_completed_at        timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  uuid,
    CONSTRAINT fk_case_outcome_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_outcome_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code)
);

CREATE INDEX IF NOT EXISTS idx_case_outcome_patient
    ON clinical.case_outcome_form (patient_id);

CREATE TABLE IF NOT EXISTS clinical.case_followup_visit (
    followup_id                  uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    timepoint_code               varchar(30) NOT NULL REFERENCES ref.timepoint(timepoint_code),
    visit_date                   date NOT NULL,
    clinician_note               text,
    complication_yn              boolean,
    complication_detail          text,
    return_to_work_yn            boolean,
    reoperation_yn               boolean,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT fk_case_followup_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_followup_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT uq_case_followup_timepoint UNIQUE (case_id, timepoint_code, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_case_followup_case_timepoint
    ON clinical.case_followup_visit (case_id, timepoint_code, visit_date DESC);

CREATE TABLE IF NOT EXISTS clinical.case_memo (
    memo_id                      uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    visibility                   clinical.memo_visibility NOT NULL DEFAULT 'PRIVATE',
    memo_text                    text NOT NULL,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT fk_case_memo_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_memo_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code)
);

CREATE INDEX IF NOT EXISTS idx_case_memo_case_time
    ON clinical.case_memo (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS clinical.case_lock_history (
    lock_event_id                uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    is_locked                    boolean NOT NULL,
    reason                       text,
    changed_by                   uuid REFERENCES auth.user_account(user_id),
    request_id                   uuid,
    changed_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_case_lock_history_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_case_lock_history_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code)
);

CREATE INDEX IF NOT EXISTS idx_case_lock_history_case_time
    ON clinical.case_lock_history (case_id, changed_at DESC);

CREATE OR REPLACE FUNCTION clinical.next_registration_no(
    p_hospital_code varchar(20),
    p_visit_date date
)
RETURNS varchar(40)
LANGUAGE plpgsql
AS $$
DECLARE
    v_yymm      char(4);
    v_next      integer;
BEGIN
    v_yymm := to_char(COALESCE(p_visit_date, CURRENT_DATE), 'YYMM');

    INSERT INTO clinical.registration_counter (hospital_code, yymm, last_value, updated_at)
    VALUES (p_hospital_code, v_yymm, 1, now())
    ON CONFLICT (hospital_code, yymm)
    DO UPDATE
       SET last_value = clinical.registration_counter.last_value + 1,
           updated_at = now()
    RETURNING last_value INTO v_next;

    RETURN format('%s-%s-%s', p_hospital_code, v_yymm, lpad(v_next::text, 4, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION clinical.tg_case_record_before_ins_upd()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.registration_no IS NULL OR btrim(NEW.registration_no) = '' THEN
            NEW.registration_no := clinical.next_registration_no(NEW.hospital_code, NEW.visit_date);
        END IF;

        IF NEW.is_locked AND NEW.locked_at IS NULL THEN
            NEW.locked_at := now();
            NEW.locked_by := COALESCE(NEW.locked_by, app_private.current_app_user_id());
            IF NEW.case_status = 'DRAFT' OR NEW.case_status = 'ACTIVE' THEN
                NEW.case_status := 'LOCKED';
            END IF;
        END IF;
    ELSE
        IF OLD.is_locked AND NOT app_private.is_admin() THEN
            IF (NEW.patient_id, NEW.registration_no, NEW.consent_date, NEW.visit_date, NEW.surgery_date,
                NEW.diagnosis_code, NEW.procedure_code, NEW.spinal_region, NEW.surgeon_user_id,
                NEW.coordinator_user_id, NEW.enrollment_source)
               IS DISTINCT FROM
               (OLD.patient_id, OLD.registration_no, OLD.consent_date, OLD.visit_date, OLD.surgery_date,
                OLD.diagnosis_code, OLD.procedure_code, OLD.spinal_region, OLD.surgeon_user_id,
                OLD.coordinator_user_id, OLD.enrollment_source) THEN
                RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '잠금된 케이스는 수정할 수 없습니다.';
            END IF;
        END IF;

        IF NEW.is_locked AND NOT OLD.is_locked THEN
            NEW.locked_at := COALESCE(NEW.locked_at, now());
            NEW.locked_by := COALESCE(NEW.locked_by, app_private.current_app_user_id());
            IF NEW.case_status = 'ACTIVE' OR NEW.case_status = 'DRAFT' THEN
                NEW.case_status := 'LOCKED';
            END IF;
        ELSIF NOT NEW.is_locked AND OLD.is_locked THEN
            NEW.locked_at := NULL;
            NEW.locked_by := NULL;
            IF NEW.case_status = 'LOCKED' THEN
                NEW.case_status := 'ACTIVE';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION clinical.tg_block_if_case_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_case_id        uuid;
    v_hospital_code  varchar(20);
    v_locked         boolean;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_case_id := OLD.case_id;
        v_hospital_code := OLD.hospital_code;
    ELSE
        v_case_id := NEW.case_id;
        v_hospital_code := NEW.hospital_code;
    END IF;

    SELECT is_locked
      INTO v_locked
      FROM clinical.case_record
     WHERE case_id = v_case_id
       AND hospital_code = v_hospital_code;

    IF COALESCE(v_locked, false) AND NOT app_private.is_admin() THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '잠금된 케이스는 수정할 수 없습니다.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION clinical.tg_log_case_lock_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN
        INSERT INTO clinical.case_lock_history (
            lock_event_id,
            hospital_code,
            case_id,
            patient_id,
            is_locked,
            reason,
            changed_by,
            request_id,
            changed_at
        ) VALUES (
            app_private.gen_uuid_pk(),
            NEW.hospital_code,
            NEW.case_id,
            NEW.patient_id,
            NEW.is_locked,
            NEW.lock_reason,
            COALESCE(app_private.current_app_user_id(), NEW.updated_by),
            app_private.current_request_id(),
            now()
        );
    END IF;

    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION clinical.tg_validate_case_patient_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_case_id            uuid;
    v_hospital_code      varchar(20);
    v_expected_patient   uuid;
    v_actual_patient     uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_case_id := OLD.case_id;
        v_hospital_code := OLD.hospital_code;
        v_actual_patient := OLD.patient_id;
    ELSE
        v_case_id := NEW.case_id;
        v_hospital_code := NEW.hospital_code;
        v_actual_patient := NEW.patient_id;
    END IF;

    SELECT patient_id
      INTO v_expected_patient
      FROM clinical.case_record
     WHERE case_id = v_case_id
       AND hospital_code = v_hospital_code;

    IF v_expected_patient IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '상위 case_id를 찾을 수 없습니다.';
    END IF;

    IF v_actual_patient IS DISTINCT FROM v_expected_patient THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'case_id와 patient_id가 일치하지 않습니다.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- --------------------------------------------------------------------------
-- Survey / PROM tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS survey.prom_request (
    request_id                   uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    timepoint_code               varchar(30) NOT NULL REFERENCES ref.timepoint(timepoint_code),
    token_uuid                   uuid NOT NULL DEFAULT app_private.gen_uuid_pk(),
    token_status                 survey.token_status NOT NULL DEFAULT 'READY',
    source_channel               messaging.message_channel NOT NULL DEFAULT 'KAKAO_ALIMTALK',
    requested_by                 uuid NOT NULL REFERENCES auth.user_account(user_id),
    requested_at                 timestamptz NOT NULL DEFAULT now(),
    expires_at                   timestamptz NOT NULL,
    opened_at                    timestamptz,
    verified_at                  timestamptz,
    submitted_at                 timestamptz,
    submit_ip                    inet,
    submit_user_agent            text,
    resend_of_request_id         uuid REFERENCES survey.prom_request(request_id),
    latest_message_id            uuid,
    remarks                      text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    UNIQUE (token_uuid),
    UNIQUE (request_id, hospital_code),
    CONSTRAINT fk_prom_request_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_prom_request_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_prom_request_expiry CHECK (expires_at > requested_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prom_request_active_case_timepoint
    ON survey.prom_request (case_id, timepoint_code)
    WHERE token_status IN ('READY', 'SENT', 'OPENED', 'VERIFIED');

CREATE INDEX IF NOT EXISTS idx_prom_request_hospital_status
    ON survey.prom_request (hospital_code, token_status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_request_case_timepoint
    ON survey.prom_request (case_id, timepoint_code, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_request_expiry
    ON survey.prom_request (expires_at);

CREATE TABLE IF NOT EXISTS survey.prom_draft (
    request_id                   uuid PRIMARY KEY REFERENCES survey.prom_request(request_id) ON DELETE CASCADE,
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    answer_payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_saved_at                timestamptz NOT NULL DEFAULT now(),
    save_count                   integer NOT NULL DEFAULT 0 CHECK (save_count >= 0),
    last_save_ip                 inet,
    client_fingerprint           text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT fk_prom_draft_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_prom_draft_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_prom_draft_payload_is_object CHECK (jsonb_typeof(answer_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_prom_draft_case
    ON survey.prom_draft (case_id, last_saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_draft_answer_payload_gin
    ON survey.prom_draft USING GIN (answer_payload);

CREATE TABLE IF NOT EXISTS survey.prom_submission (
    submission_id                uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    request_id                   uuid NOT NULL UNIQUE,
    timepoint_code               varchar(30) NOT NULL REFERENCES ref.timepoint(timepoint_code),
    instrument_bundle            jsonb NOT NULL DEFAULT '[]'::jsonb,
    answer_payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
    vas_back                     smallint CHECK (vas_back BETWEEN 0 AND 10),
    vas_leg                      smallint CHECK (vas_leg BETWEEN 0 AND 10),
    odi_score                    smallint CHECK (odi_score BETWEEN 0 AND 100),
    ndi_score                    smallint CHECK (ndi_score BETWEEN 0 AND 100),
    eq5d_index                   numeric(6,3),
    eq_vas                       smallint CHECK (eq_vas BETWEEN 0 AND 100),
    satisfaction                 smallint CHECK (satisfaction BETWEEN 1 AND 5),
    global_impression            smallint CHECK (global_impression BETWEEN 1 AND 5),
    returned_to_work             boolean,
    scoring_version              varchar(30) NOT NULL DEFAULT 'v1',
    is_valid                     boolean NOT NULL DEFAULT true,
    submitted_at                 timestamptz NOT NULL DEFAULT now(),
    submit_ip                    inet,
    user_agent                   text,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT fk_prom_submission_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_prom_submission_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT fk_prom_submission_request
        FOREIGN KEY (request_id, hospital_code)
        REFERENCES survey.prom_request(request_id, hospital_code),
    CONSTRAINT chk_prom_submission_instrument_bundle_is_array
        CHECK (jsonb_typeof(instrument_bundle) = 'array'),
    CONSTRAINT chk_prom_submission_answer_payload_is_object
        CHECK (jsonb_typeof(answer_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prom_submission_case_timepoint_valid
    ON survey.prom_submission (case_id, timepoint_code)
    WHERE is_valid;

CREATE INDEX IF NOT EXISTS idx_prom_submission_hospital_time
    ON survey.prom_submission (hospital_code, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_submission_case_timepoint
    ON survey.prom_submission (case_id, timepoint_code, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_prom_submission_payload_gin
    ON survey.prom_submission USING GIN (answer_payload);

CREATE TABLE IF NOT EXISTS survey.prom_answer (
    submission_id                uuid NOT NULL REFERENCES survey.prom_submission(submission_id) ON DELETE CASCADE,
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    instrument_code              varchar(30) NOT NULL,
    question_code                varchar(50) NOT NULL,
    display_order                integer,
    answer_value_numeric         numeric(10,2),
    answer_value_text            text,
    answer_value_jsonb           jsonb,
    answered_at                  timestamptz NOT NULL DEFAULT now(),
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    PRIMARY KEY (submission_id, question_code),
    CONSTRAINT fk_prom_answer_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_prom_answer_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT fk_prom_answer_instrument
        FOREIGN KEY (instrument_code)
        REFERENCES ref.prom_instrument(instrument_code)
);

CREATE INDEX IF NOT EXISTS idx_prom_answer_case_question
    ON survey.prom_answer (case_id, question_code);
CREATE INDEX IF NOT EXISTS idx_prom_answer_instrument_question
    ON survey.prom_answer (instrument_code, question_code);

CREATE TABLE IF NOT EXISTS survey.verify_attempt (
    verify_attempt_id            uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20),
    request_id                   uuid NOT NULL REFERENCES survey.prom_request(request_id) ON DELETE CASCADE,
    method_code                  varchar(30) NOT NULL,
    success                      boolean NOT NULL,
    reason_code                  varchar(50),
    client_ip                    inet,
    forwarded_for                text,
    user_agent                   text,
    attempted_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verify_attempt_request_time
    ON survey.verify_attempt (request_id, attempted_at DESC);

CREATE OR REPLACE FUNCTION survey.tg_prom_request_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_patient_id uuid;
BEGIN
    IF NEW.patient_id IS NULL THEN
        SELECT patient_id INTO v_patient_id
          FROM clinical.case_record
         WHERE case_id = NEW.case_id
           AND hospital_code = NEW.hospital_code;

        NEW.patient_id := v_patient_id;
    END IF;

    IF NEW.requested_at IS NULL THEN
        NEW.requested_at := now();
    END IF;

    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.requested_at + interval '7 day';
    END IF;

    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION survey.tg_prom_draft_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_hospital_code  varchar(20);
    v_case_id        uuid;
    v_patient_id     uuid;
BEGIN
    SELECT hospital_code, case_id, patient_id
      INTO v_hospital_code, v_case_id, v_patient_id
      FROM survey.prom_request
     WHERE request_id = NEW.request_id;

    IF v_hospital_code IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '유효한 request_id가 아닙니다.';
    END IF;

    NEW.hospital_code := COALESCE(NEW.hospital_code, v_hospital_code);
    NEW.case_id := COALESCE(NEW.case_id, v_case_id);
    NEW.patient_id := COALESCE(NEW.patient_id, v_patient_id);

    IF NEW.hospital_code IS DISTINCT FROM v_hospital_code
       OR NEW.case_id IS DISTINCT FROM v_case_id
       OR NEW.patient_id IS DISTINCT FROM v_patient_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROM draft의 상위 request 정보가 일치하지 않습니다.';
    END IF;

    NEW.last_saved_at := now();
    NEW.save_count := COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.save_count ELSE 0 END, 0) + 1;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION survey.tg_prom_submission_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_hospital_code  varchar(20);
    v_case_id        uuid;
    v_patient_id     uuid;
    v_timepoint_code varchar(30);
    v_token_status   survey.token_status;
BEGIN
    SELECT hospital_code, case_id, patient_id, timepoint_code, token_status
      INTO v_hospital_code, v_case_id, v_patient_id, v_timepoint_code, v_token_status
      FROM survey.prom_request
     WHERE request_id = NEW.request_id;

    IF v_hospital_code IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '유효한 request_id가 아닙니다.';
    END IF;

    NEW.hospital_code := COALESCE(NEW.hospital_code, v_hospital_code);
    NEW.case_id := COALESCE(NEW.case_id, v_case_id);
    NEW.patient_id := COALESCE(NEW.patient_id, v_patient_id);
    NEW.timepoint_code := COALESCE(NEW.timepoint_code, v_timepoint_code);

    IF NEW.hospital_code IS DISTINCT FROM v_hospital_code
       OR NEW.case_id IS DISTINCT FROM v_case_id
       OR NEW.patient_id IS DISTINCT FROM v_patient_id
       OR NEW.timepoint_code IS DISTINCT FROM v_timepoint_code THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROM submission의 상위 request 정보가 일치하지 않습니다.';
    END IF;

    IF v_token_status = 'SUBMITTED' THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = '이미 제출된 설문입니다.';
    ELSIF v_token_status IN ('EXPIRED', 'REVOKED') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = '만료 또는 폐기된 설문 링크입니다.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION survey.tg_prom_answer_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_hospital_code  varchar(20);
    v_case_id        uuid;
    v_patient_id     uuid;
BEGIN
    SELECT hospital_code, case_id, patient_id
      INTO v_hospital_code, v_case_id, v_patient_id
      FROM survey.prom_submission
     WHERE submission_id = NEW.submission_id;

    IF v_hospital_code IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '유효한 submission_id가 아닙니다.';
    END IF;

    NEW.hospital_code := COALESCE(NEW.hospital_code, v_hospital_code);
    NEW.case_id := COALESCE(NEW.case_id, v_case_id);
    NEW.patient_id := COALESCE(NEW.patient_id, v_patient_id);

    IF NEW.hospital_code IS DISTINCT FROM v_hospital_code
       OR NEW.case_id IS DISTINCT FROM v_case_id
       OR NEW.patient_id IS DISTINCT FROM v_patient_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PROM answer의 상위 submission 정보가 일치하지 않습니다.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION survey.tg_prom_submission_finalize_request()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE survey.prom_request
       SET token_status = 'SUBMITTED',
           submitted_at = COALESCE(NEW.submitted_at, now()),
           submit_ip = NEW.submit_ip,
           submit_user_agent = NEW.user_agent,
           updated_at = now(),
           updated_by = COALESCE(app_private.current_app_user_id(), updated_by)
     WHERE request_id = NEW.request_id;

    DELETE FROM survey.prom_draft
     WHERE request_id = NEW.request_id;

    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- Messaging / outbox tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messaging.alimtalk_template (
    template_id                  uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    vendor_code                  varchar(50) NOT NULL,
    template_code                varchar(100) NOT NULL,
    timepoint_code               varchar(30) REFERENCES ref.timepoint(timepoint_code),
    title                        varchar(255),
    body_template                text NOT NULL,
    button_template              jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active                    boolean NOT NULL DEFAULT true,
    version_no                   integer NOT NULL DEFAULT 1,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT uq_alimtalk_template UNIQUE (vendor_code, template_code, version_no),
    CONSTRAINT chk_alimtalk_button_template_is_array CHECK (jsonb_typeof(button_template) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_alimtalk_template_active
    ON messaging.alimtalk_template (vendor_code, is_active, template_code);

CREATE TABLE IF NOT EXISTS messaging.message_outbox (
    message_id                   uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20) NOT NULL,
    case_id                      uuid NOT NULL,
    patient_id                   uuid NOT NULL,
    request_id                   uuid REFERENCES survey.prom_request(request_id),
    channel                      messaging.message_channel NOT NULL DEFAULT 'KAKAO_ALIMTALK',
    vendor_code                  varchar(50) NOT NULL,
    template_id                  uuid REFERENCES messaging.alimtalk_template(template_id),
    dedupe_key                   varchar(200),
    payload_jsonb                jsonb NOT NULL DEFAULT '{}'::jsonb,
    message_body_snapshot        text,
    recipient_phone_sha256       char(64),
    status                       messaging.message_status NOT NULL DEFAULT 'QUEUED',
    priority                     smallint NOT NULL DEFAULT 100,
    queued_at                    timestamptz NOT NULL DEFAULT now(),
    next_attempt_at              timestamptz NOT NULL DEFAULT now(),
    attempt_count                integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts                 smallint NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    lease_token                  uuid,
    leased_by_node               text,
    lease_until                  timestamptz,
    sent_at                      timestamptz,
    delivered_at                 timestamptz,
    failed_at                    timestamptz,
    vendor_request_id            text,
    vendor_message_id            text,
    last_error_code              text,
    last_error_message           text,
    response_payload             jsonb,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT fk_message_outbox_case
        FOREIGN KEY (case_id, hospital_code)
        REFERENCES clinical.case_record(case_id, hospital_code),
    CONSTRAINT fk_message_outbox_patient
        FOREIGN KEY (patient_id, hospital_code)
        REFERENCES patient.patient(patient_id, hospital_code),
    CONSTRAINT chk_message_payload_is_object CHECK (jsonb_typeof(payload_jsonb) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_outbox_dedupe_key
    ON messaging.message_outbox (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_outbox_dispatch
    ON messaging.message_outbox (status, next_attempt_at, priority DESC)
    WHERE status IN ('QUEUED', 'FAILED', 'LEASED');

CREATE INDEX IF NOT EXISTS idx_message_outbox_case_time
    ON messaging.message_outbox (case_id, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_outbox_vendor_msg
    ON messaging.message_outbox (vendor_code, vendor_message_id);

CREATE TABLE IF NOT EXISTS messaging.message_attempt (
    attempt_id                   uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    message_id                   uuid NOT NULL REFERENCES messaging.message_outbox(message_id) ON DELETE CASCADE,
    hospital_code                varchar(20),
    attempt_no                   integer NOT NULL CHECK (attempt_no > 0),
    worker_node                  text,
    request_id                   uuid,
    requested_at                 timestamptz NOT NULL DEFAULT now(),
    responded_at                 timestamptz,
    http_status                  integer,
    success                      boolean,
    error_code                   text,
    error_message                text,
    request_payload              jsonb,
    response_payload             jsonb,
    CONSTRAINT uq_message_attempt UNIQUE (message_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_message_attempt_message_time
    ON messaging.message_attempt (message_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS messaging.vendor_webhook_event (
    webhook_event_id             uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    hospital_code                varchar(20),
    vendor_code                  varchar(50) NOT NULL,
    vendor_message_id            text,
    message_id                   uuid REFERENCES messaging.message_outbox(message_id),
    request_id                   uuid,
    event_type                   varchar(100) NOT NULL,
    payload_jsonb                jsonb NOT NULL DEFAULT '{}'::jsonb,
    remote_ip                    inet,
    signature_verified           boolean NOT NULL DEFAULT false,
    processing_status            varchar(30) NOT NULL DEFAULT 'RECEIVED',
    error_message                text,
    received_at                  timestamptz NOT NULL DEFAULT now(),
    processed_at                 timestamptz,
    CONSTRAINT chk_vendor_webhook_payload_is_object CHECK (jsonb_typeof(payload_jsonb) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_vendor_webhook_vendor_msg
    ON messaging.vendor_webhook_event (vendor_code, vendor_message_id);
CREATE INDEX IF NOT EXISTS idx_vendor_webhook_received
    ON messaging.vendor_webhook_event (received_at DESC);

CREATE OR REPLACE FUNCTION messaging.tg_message_status_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'LEASED' AND NEW.lease_token IS NULL THEN
        NEW.lease_token := app_private.gen_uuid_pk();
    END IF;

    IF NEW.status = 'SENT' AND OLD.status IS DISTINCT FROM 'SENT' AND NEW.sent_at IS NULL THEN
        NEW.sent_at := now();
    END IF;

    IF NEW.status = 'DELIVERED' AND OLD.status IS DISTINCT FROM 'DELIVERED' AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at := now();
    END IF;

    IF NEW.status = 'FAILED' AND OLD.status IS DISTINCT FROM 'FAILED' AND NEW.failed_at IS NULL THEN
        NEW.failed_at := now();
    END IF;

    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION messaging.tg_message_outbox_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_hospital_code  varchar(20);
    v_case_id        uuid;
    v_patient_id     uuid;
BEGIN
    IF NEW.request_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT hospital_code, case_id, patient_id
      INTO v_hospital_code, v_case_id, v_patient_id
      FROM survey.prom_request
     WHERE request_id = NEW.request_id;

    IF v_hospital_code IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '유효한 request_id가 아닙니다.';
    END IF;

    NEW.hospital_code := COALESCE(NEW.hospital_code, v_hospital_code);
    NEW.case_id := COALESCE(NEW.case_id, v_case_id);
    NEW.patient_id := COALESCE(NEW.patient_id, v_patient_id);

    IF NEW.hospital_code IS DISTINCT FROM v_hospital_code
       OR NEW.case_id IS DISTINCT FROM v_case_id
       OR NEW.patient_id IS DISTINCT FROM v_patient_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'message_outbox의 상위 request 정보가 일치하지 않습니다.';
    END IF;

    RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- Operations / exports / cluster support tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops.idempotency_key (
    idempotency_key              varchar(200) PRIMARY KEY,
    scope_name                   varchar(100) NOT NULL,
    hospital_code                varchar(20),
    user_id                      uuid,
    request_hash                 char(64),
    response_status              integer,
    response_body                jsonb,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    last_seen_at                 timestamptz NOT NULL DEFAULT now(),
    expires_at                   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key_expiry
    ON ops.idempotency_key (expires_at);

CREATE TABLE IF NOT EXISTS ops.data_export_request (
    export_request_id            uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    requester_user_id            uuid NOT NULL REFERENCES auth.user_account(user_id),
    requester_hospital_code      varchar(20) REFERENCES ref.hospital(hospital_code),
    export_scope                 ops.export_scope NOT NULL,
    approval_status              ops.approval_status NOT NULL DEFAULT 'REQUESTED',
    reason                       text NOT NULL,
    filter_jsonb                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    deidentify_mode              varchar(30) NOT NULL DEFAULT 'STRICT',
    reviewed_by                  uuid REFERENCES auth.user_account(user_id),
    reviewed_at                  timestamptz,
    review_comment               text,
    approved_until               timestamptz,
    download_token_hash          char(64),
    generated_file_name          text,
    generated_file_sha256        char(64),
    generated_row_count          bigint,
    generated_at                 timestamptz,
    download_count               integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
    last_downloaded_at           timestamptz,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid,
    updated_at                   timestamptz NOT NULL DEFAULT now(),
    updated_by                   uuid,
    CONSTRAINT chk_export_filter_is_object CHECK (jsonb_typeof(filter_jsonb) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_export_request_status_time
    ON ops.data_export_request (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_request_requester_time
    ON ops.data_export_request (requester_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ops.export_download_log (
    export_download_id           uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    export_request_id            uuid NOT NULL REFERENCES ops.data_export_request(export_request_id) ON DELETE CASCADE,
    downloaded_by                uuid REFERENCES auth.user_account(user_id),
    client_ip                    inet,
    user_agent                   text,
    success                      boolean NOT NULL,
    failure_reason               text,
    downloaded_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_download_request_time
    ON ops.export_download_log (export_request_id, downloaded_at DESC);

CREATE TABLE IF NOT EXISTS ops.backup_run_log (
    backup_run_id                uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    backup_type                  varchar(30) NOT NULL,
    status                       varchar(30) NOT NULL,
    target_location              text NOT NULL,
    checksum_sha256              char(64),
    backup_size_bytes            bigint,
    started_at                   timestamptz NOT NULL DEFAULT now(),
    completed_at                 timestamptz,
    executed_by_node             text,
    error_message                text
);

CREATE INDEX IF NOT EXISTS idx_backup_run_time
    ON ops.backup_run_log (started_at DESC);

CREATE TABLE IF NOT EXISTS ops.node_heartbeat (
    node_name                    text PRIMARY KEY,
    node_role                    varchar(50) NOT NULL,
    node_ip                      inet,
    app_version                  varchar(50),
    started_at                   timestamptz NOT NULL DEFAULT now(),
    last_seen_at                 timestamptz NOT NULL DEFAULT now(),
    meta_jsonb                   jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_node_meta_is_object CHECK (jsonb_typeof(meta_jsonb) = 'object')
);

CREATE TABLE IF NOT EXISTS ops.job_run_log (
    job_run_id                   uuid PRIMARY KEY DEFAULT app_private.gen_uuid_pk(),
    job_name                     varchar(100) NOT NULL,
    node_name                    text,
    status                       varchar(30) NOT NULL,
    detail_jsonb                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at                   timestamptz NOT NULL DEFAULT now(),
    finished_at                  timestamptz,
    error_message                text,
    CONSTRAINT chk_job_detail_is_object CHECK (jsonb_typeof(detail_jsonb) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_job_run_log_job_time
    ON ops.job_run_log (job_name, started_at DESC);

-- --------------------------------------------------------------------------
-- Analytics views / materialized views
-- --------------------------------------------------------------------------
CREATE OR REPLACE VIEW analytics.v_case_status AS
WITH latest_request AS (
    SELECT DISTINCT ON (pr.case_id)
           pr.case_id,
           pr.hospital_code,
           pr.request_id,
           pr.timepoint_code,
           pr.token_status,
           pr.requested_at,
           pr.submitted_at
      FROM survey.prom_request pr
     ORDER BY pr.case_id, pr.requested_at DESC
),
latest_submission AS (
    SELECT DISTINCT ON (ps.case_id)
           ps.case_id,
           ps.hospital_code,
           ps.submission_id,
           ps.timepoint_code,
           ps.submitted_at
      FROM survey.prom_submission ps
     WHERE ps.is_valid
     ORDER BY ps.case_id, ps.submitted_at DESC
)
SELECT
    cr.case_id,
    cr.hospital_code,
    cr.patient_id,
    cr.registration_no,
    p.patient_initial,
    p.sex,
    p.birth_year,
    cr.visit_date,
    cr.surgery_date,
    cr.diagnosis_code,
    cr.procedure_code,
    cr.case_status,
    cr.is_locked,
    CASE
        WHEN cif.case_id IS NULL THEN 'WAITING'
        WHEN cr.diagnosis_code IS NOT NULL AND cr.procedure_code IS NOT NULL AND cr.surgery_date IS NOT NULL THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
    END AS initial_db_status,
    CASE
        WHEN cef.case_id IS NULL THEN 'WAITING'
        WHEN cef.surgery_level IS NOT NULL AND cef.approach_type IS NOT NULL AND cef.operation_minutes IS NOT NULL THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
    END AS extended_db_status,
    CASE
        WHEN cof.case_id IS NULL THEN 'WAITING'
        WHEN cof.complication_yn IS NOT NULL AND cof.surgeon_global_outcome IS NOT NULL THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
    END AS outcome_db_status,
    lr.request_id AS latest_prom_request_id,
    lr.timepoint_code AS latest_prom_timepoint,
    lr.token_status AS latest_prom_status,
    lr.requested_at AS latest_prom_sent_at,
    ls.submission_id AS latest_submission_id,
    ls.submitted_at AS latest_prom_submitted_at
FROM clinical.case_record cr
JOIN patient.patient p
  ON p.patient_id = cr.patient_id
 AND p.hospital_code = cr.hospital_code
LEFT JOIN clinical.case_initial_form cif
  ON cif.case_id = cr.case_id
 AND cif.hospital_code = cr.hospital_code
LEFT JOIN clinical.case_extended_form cef
  ON cef.case_id = cr.case_id
 AND cef.hospital_code = cr.hospital_code
LEFT JOIN clinical.case_outcome_form cof
  ON cof.case_id = cr.case_id
 AND cof.hospital_code = cr.hospital_code
LEFT JOIN latest_request lr
  ON lr.case_id = cr.case_id
 AND lr.hospital_code = cr.hospital_code
LEFT JOIN latest_submission ls
  ON ls.case_id = cr.case_id
 AND ls.hospital_code = cr.hospital_code;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_global_prom_benchmark AS
SELECT
    ps.timepoint_code,
    COUNT(*)::bigint AS sample_n,
    ROUND(AVG(ps.vas_back)::numeric, 2) AS avg_vas_back,
    ROUND(AVG(ps.vas_leg)::numeric, 2) AS avg_vas_leg,
    ROUND(AVG(ps.odi_score)::numeric, 2) AS avg_odi_score,
    ROUND(AVG(ps.ndi_score)::numeric, 2) AS avg_ndi_score,
    ROUND(AVG(ps.eq5d_index)::numeric, 3) AS avg_eq5d_index,
    ROUND(AVG(ps.eq_vas)::numeric, 2) AS avg_eq_vas,
    MAX(ps.submitted_at) AS last_submission_at,
    now() AS refreshed_at
FROM survey.prom_submission ps
WHERE ps.is_valid
GROUP BY ps.timepoint_code
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_global_prom_benchmark_timepoint
    ON analytics.mv_global_prom_benchmark (timepoint_code);

CREATE OR REPLACE FUNCTION analytics.refresh_global_prom_benchmark(p_concurrently boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_concurrently THEN
        EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_global_prom_benchmark';
    ELSE
        EXECUTE 'REFRESH MATERIALIZED VIEW analytics.mv_global_prom_benchmark';
    END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- Trigger attachments (naming ordered so stamp runs before business/audit)
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_01_user_account_stamp ON auth.user_account;
CREATE TRIGGER trg_01_user_account_stamp
BEFORE INSERT OR UPDATE ON auth.user_account
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_user_account_guard ON auth.user_account;
CREATE TRIGGER trg_05_user_account_guard
BEFORE UPDATE ON auth.user_account
FOR EACH ROW EXECUTE FUNCTION auth.tg_guard_user_account_update();

DROP TRIGGER IF EXISTS trg_99_user_account_audit ON auth.user_account;
CREATE TRIGGER trg_99_user_account_audit
AFTER INSERT OR UPDATE OR DELETE ON auth.user_account
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('user_id');

DROP TRIGGER IF EXISTS trg_01_auth_session_stamp ON auth.auth_session;
CREATE TRIGGER trg_01_auth_session_stamp
BEFORE INSERT OR UPDATE ON auth.auth_session
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_01_password_reset_stamp ON auth.password_reset_token;
CREATE TRIGGER trg_01_password_reset_stamp
BEFORE INSERT OR UPDATE ON auth.password_reset_token
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_01_ip_allowlist_stamp ON auth.hospital_ip_allowlist;
CREATE TRIGGER trg_01_ip_allowlist_stamp
BEFORE INSERT OR UPDATE ON auth.hospital_ip_allowlist
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_99_ip_allowlist_audit ON auth.hospital_ip_allowlist;
CREATE TRIGGER trg_99_ip_allowlist_audit
AFTER INSERT OR UPDATE OR DELETE ON auth.hospital_ip_allowlist
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('allowlist_id');

DROP TRIGGER IF EXISTS trg_01_patient_stamp ON patient.patient;
CREATE TRIGGER trg_01_patient_stamp
BEFORE INSERT OR UPDATE ON patient.patient
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_99_patient_audit ON patient.patient;
CREATE TRIGGER trg_99_patient_audit
AFTER INSERT OR UPDATE OR DELETE ON patient.patient
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('patient_id');

DROP TRIGGER IF EXISTS trg_01_patient_identity_stamp ON vault.patient_identity;
CREATE TRIGGER trg_01_patient_identity_stamp
BEFORE INSERT OR UPDATE ON vault.patient_identity
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_01_case_record_stamp ON clinical.case_record;
CREATE TRIGGER trg_01_case_record_stamp
BEFORE INSERT OR UPDATE ON clinical.case_record
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_case_record_business ON clinical.case_record;
CREATE TRIGGER trg_05_case_record_business
BEFORE INSERT OR UPDATE ON clinical.case_record
FOR EACH ROW EXECUTE FUNCTION clinical.tg_case_record_before_ins_upd();

DROP TRIGGER IF EXISTS trg_10_case_record_lock_history ON clinical.case_record;
CREATE TRIGGER trg_10_case_record_lock_history
AFTER UPDATE OF is_locked ON clinical.case_record
FOR EACH ROW EXECUTE FUNCTION clinical.tg_log_case_lock_history();

DROP TRIGGER IF EXISTS trg_99_case_record_audit ON clinical.case_record;
CREATE TRIGGER trg_99_case_record_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_record
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('case_id');

DROP TRIGGER IF EXISTS trg_01_case_initial_stamp ON clinical.case_initial_form;
CREATE TRIGGER trg_01_case_initial_stamp
BEFORE INSERT OR UPDATE ON clinical.case_initial_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_case_initial_lock_guard ON clinical.case_initial_form;
CREATE TRIGGER trg_05_case_initial_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_initial_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_block_if_case_locked();

DROP TRIGGER IF EXISTS trg_06_case_initial_case_patient_guard ON clinical.case_initial_form;
CREATE TRIGGER trg_06_case_initial_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_initial_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_case_initial_audit ON clinical.case_initial_form;
CREATE TRIGGER trg_99_case_initial_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_initial_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('case_id');

DROP TRIGGER IF EXISTS trg_01_case_extended_stamp ON clinical.case_extended_form;
CREATE TRIGGER trg_01_case_extended_stamp
BEFORE INSERT OR UPDATE ON clinical.case_extended_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_case_extended_lock_guard ON clinical.case_extended_form;
CREATE TRIGGER trg_05_case_extended_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_extended_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_block_if_case_locked();

DROP TRIGGER IF EXISTS trg_06_case_extended_case_patient_guard ON clinical.case_extended_form;
CREATE TRIGGER trg_06_case_extended_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_extended_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_case_extended_audit ON clinical.case_extended_form;
CREATE TRIGGER trg_99_case_extended_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_extended_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('case_id');

DROP TRIGGER IF EXISTS trg_01_case_outcome_stamp ON clinical.case_outcome_form;
CREATE TRIGGER trg_01_case_outcome_stamp
BEFORE INSERT OR UPDATE ON clinical.case_outcome_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_case_outcome_lock_guard ON clinical.case_outcome_form;
CREATE TRIGGER trg_05_case_outcome_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_outcome_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_block_if_case_locked();

DROP TRIGGER IF EXISTS trg_06_case_outcome_case_patient_guard ON clinical.case_outcome_form;
CREATE TRIGGER trg_06_case_outcome_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_outcome_form
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_case_outcome_audit ON clinical.case_outcome_form;
CREATE TRIGGER trg_99_case_outcome_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_outcome_form
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('case_id');

DROP TRIGGER IF EXISTS trg_01_case_followup_stamp ON clinical.case_followup_visit;
CREATE TRIGGER trg_01_case_followup_stamp
BEFORE INSERT OR UPDATE ON clinical.case_followup_visit
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_case_followup_lock_guard ON clinical.case_followup_visit;
CREATE TRIGGER trg_05_case_followup_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_followup_visit
FOR EACH ROW EXECUTE FUNCTION clinical.tg_block_if_case_locked();

DROP TRIGGER IF EXISTS trg_06_case_followup_case_patient_guard ON clinical.case_followup_visit;
CREATE TRIGGER trg_06_case_followup_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_followup_visit
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_case_followup_audit ON clinical.case_followup_visit;
CREATE TRIGGER trg_99_case_followup_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_followup_visit
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('followup_id');

DROP TRIGGER IF EXISTS trg_01_case_memo_stamp ON clinical.case_memo;
CREATE TRIGGER trg_01_case_memo_stamp
BEFORE INSERT OR UPDATE ON clinical.case_memo
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_06_case_memo_case_patient_guard ON clinical.case_memo;
CREATE TRIGGER trg_06_case_memo_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON clinical.case_memo
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_case_memo_audit ON clinical.case_memo;
CREATE TRIGGER trg_99_case_memo_audit
AFTER INSERT OR UPDATE OR DELETE ON clinical.case_memo
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('memo_id');

DROP TRIGGER IF EXISTS trg_01_prom_request_stamp ON survey.prom_request;
CREATE TRIGGER trg_01_prom_request_stamp
BEFORE INSERT OR UPDATE ON survey.prom_request
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_prom_request_defaults ON survey.prom_request;
CREATE TRIGGER trg_05_prom_request_defaults
BEFORE INSERT ON survey.prom_request
FOR EACH ROW EXECUTE FUNCTION survey.tg_prom_request_defaults();

DROP TRIGGER IF EXISTS trg_06_prom_request_case_patient_guard ON survey.prom_request;
CREATE TRIGGER trg_06_prom_request_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON survey.prom_request
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_prom_request_audit ON survey.prom_request;
CREATE TRIGGER trg_99_prom_request_audit
AFTER INSERT OR UPDATE OR DELETE ON survey.prom_request
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('request_id');

DROP TRIGGER IF EXISTS trg_01_prom_draft_stamp ON survey.prom_draft;
CREATE TRIGGER trg_01_prom_draft_stamp
BEFORE INSERT OR UPDATE ON survey.prom_draft
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_prom_draft_defaults ON survey.prom_draft;
CREATE TRIGGER trg_05_prom_draft_defaults
BEFORE INSERT OR UPDATE ON survey.prom_draft
FOR EACH ROW EXECUTE FUNCTION survey.tg_prom_draft_defaults();

DROP TRIGGER IF EXISTS trg_06_prom_draft_case_patient_guard ON survey.prom_draft;
CREATE TRIGGER trg_06_prom_draft_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON survey.prom_draft
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_prom_draft_audit ON survey.prom_draft;
CREATE TRIGGER trg_99_prom_draft_audit
AFTER INSERT OR UPDATE OR DELETE ON survey.prom_draft
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('request_id');

DROP TRIGGER IF EXISTS trg_01_prom_submission_stamp ON survey.prom_submission;
CREATE TRIGGER trg_01_prom_submission_stamp
BEFORE INSERT OR UPDATE ON survey.prom_submission
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_prom_submission_defaults ON survey.prom_submission;
CREATE TRIGGER trg_05_prom_submission_defaults
BEFORE INSERT ON survey.prom_submission
FOR EACH ROW EXECUTE FUNCTION survey.tg_prom_submission_defaults();

DROP TRIGGER IF EXISTS trg_06_prom_submission_case_patient_guard ON survey.prom_submission;
CREATE TRIGGER trg_06_prom_submission_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON survey.prom_submission
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_10_prom_submission_finalize ON survey.prom_submission;
CREATE TRIGGER trg_10_prom_submission_finalize
AFTER INSERT ON survey.prom_submission
FOR EACH ROW EXECUTE FUNCTION survey.tg_prom_submission_finalize_request();

DROP TRIGGER IF EXISTS trg_99_prom_submission_audit ON survey.prom_submission;
CREATE TRIGGER trg_99_prom_submission_audit
AFTER INSERT OR UPDATE OR DELETE ON survey.prom_submission
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('submission_id');

DROP TRIGGER IF EXISTS trg_01_prom_answer_stamp ON survey.prom_answer;
CREATE TRIGGER trg_01_prom_answer_stamp
BEFORE INSERT OR UPDATE ON survey.prom_answer
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_prom_answer_defaults ON survey.prom_answer;
CREATE TRIGGER trg_05_prom_answer_defaults
BEFORE INSERT ON survey.prom_answer
FOR EACH ROW EXECUTE FUNCTION survey.tg_prom_answer_defaults();

DROP TRIGGER IF EXISTS trg_06_prom_answer_case_patient_guard ON survey.prom_answer;
CREATE TRIGGER trg_06_prom_answer_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON survey.prom_answer
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_99_prom_answer_audit ON survey.prom_answer;
CREATE TRIGGER trg_99_prom_answer_audit
AFTER INSERT OR UPDATE OR DELETE ON survey.prom_answer
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('submission_id', 'question_code');

DROP TRIGGER IF EXISTS trg_01_alimtalk_template_stamp ON messaging.alimtalk_template;
CREATE TRIGGER trg_01_alimtalk_template_stamp
BEFORE INSERT OR UPDATE ON messaging.alimtalk_template
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_99_alimtalk_template_audit ON messaging.alimtalk_template;
CREATE TRIGGER trg_99_alimtalk_template_audit
AFTER INSERT OR UPDATE OR DELETE ON messaging.alimtalk_template
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('template_id');

DROP TRIGGER IF EXISTS trg_01_message_outbox_stamp ON messaging.message_outbox;
CREATE TRIGGER trg_01_message_outbox_stamp
BEFORE INSERT OR UPDATE ON messaging.message_outbox
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_05_message_outbox_defaults ON messaging.message_outbox;
CREATE TRIGGER trg_05_message_outbox_defaults
BEFORE INSERT OR UPDATE ON messaging.message_outbox
FOR EACH ROW EXECUTE FUNCTION messaging.tg_message_outbox_defaults();

DROP TRIGGER IF EXISTS trg_06_message_outbox_case_patient_guard ON messaging.message_outbox;
CREATE TRIGGER trg_06_message_outbox_case_patient_guard
BEFORE INSERT OR UPDATE OR DELETE ON messaging.message_outbox
FOR EACH ROW EXECUTE FUNCTION clinical.tg_validate_case_patient_match();

DROP TRIGGER IF EXISTS trg_05_message_outbox_status ON messaging.message_outbox;
CREATE TRIGGER trg_05_message_outbox_status
BEFORE UPDATE OF status ON messaging.message_outbox
FOR EACH ROW EXECUTE FUNCTION messaging.tg_message_status_timestamps();

DROP TRIGGER IF EXISTS trg_99_message_outbox_audit ON messaging.message_outbox;
CREATE TRIGGER trg_99_message_outbox_audit
AFTER INSERT OR UPDATE OR DELETE ON messaging.message_outbox
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('message_id');

DROP TRIGGER IF EXISTS trg_01_export_request_stamp ON ops.data_export_request;
CREATE TRIGGER trg_01_export_request_stamp
BEFORE INSERT OR UPDATE ON ops.data_export_request
FOR EACH ROW EXECUTE FUNCTION app_private.tg_stamp();

DROP TRIGGER IF EXISTS trg_99_export_request_audit ON ops.data_export_request;
CREATE TRIGGER trg_99_export_request_audit
AFTER INSERT OR UPDATE OR DELETE ON ops.data_export_request
FOR EACH ROW EXECUTE FUNCTION app_private.tg_audit_row_change('export_request_id');

-- --------------------------------------------------------------------------
-- Optional FK added after both tables exist
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE c.conname = 'fk_prom_request_latest_message'
           AND n.nspname = 'survey'
           AND t.relname = 'prom_request'
    ) THEN
        ALTER TABLE survey.prom_request
            ADD CONSTRAINT fk_prom_request_latest_message
            FOREIGN KEY (latest_message_id)
            REFERENCES messaging.message_outbox(message_id);
    END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Row-level security (multi-tenant guardrail)
-- --------------------------------------------------------------------------
ALTER TABLE auth.user_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient.patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.patient_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_initial_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_extended_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_outcome_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_followup_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_memo ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.case_lock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey.prom_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey.prom_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey.prom_submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey.prom_answer ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging.message_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.data_export_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_account_select ON auth.user_account;
CREATE POLICY p_user_account_select
    ON auth.user_account
    FOR SELECT
    USING (app_private.is_admin() OR user_id = app_private.current_app_user_id());

DROP POLICY IF EXISTS p_user_account_update ON auth.user_account;
CREATE POLICY p_user_account_update
    ON auth.user_account
    FOR UPDATE
    USING (app_private.is_admin() OR user_id = app_private.current_app_user_id())
    WITH CHECK (app_private.is_admin() OR user_id = app_private.current_app_user_id());

DROP POLICY IF EXISTS p_user_account_insert_admin ON auth.user_account;
CREATE POLICY p_user_account_insert_admin
    ON auth.user_account
    FOR INSERT
    WITH CHECK (app_private.is_admin());

DROP POLICY IF EXISTS p_user_account_delete_admin ON auth.user_account;
CREATE POLICY p_user_account_delete_admin
    ON auth.user_account
    FOR DELETE
    USING (app_private.is_admin());

DROP POLICY IF EXISTS p_auth_session_select ON auth.auth_session;
CREATE POLICY p_auth_session_select
    ON auth.auth_session
    FOR SELECT
    USING (app_private.is_admin() OR user_id = app_private.current_app_user_id());

DROP POLICY IF EXISTS p_auth_session_mod ON auth.auth_session;
CREATE POLICY p_auth_session_mod
    ON auth.auth_session
    FOR ALL
    USING (app_private.is_admin() OR user_id = app_private.current_app_user_id())
    WITH CHECK (app_private.is_admin() OR user_id = app_private.current_app_user_id());

DROP POLICY IF EXISTS p_patient_access ON patient.patient;
CREATE POLICY p_patient_access
    ON patient.patient
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_patient_identity_access ON vault.patient_identity;
CREATE POLICY p_patient_identity_access
    ON vault.patient_identity
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_record_access ON clinical.case_record;
CREATE POLICY p_case_record_access
    ON clinical.case_record
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_initial_access ON clinical.case_initial_form;
CREATE POLICY p_case_initial_access
    ON clinical.case_initial_form
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_extended_access ON clinical.case_extended_form;
CREATE POLICY p_case_extended_access
    ON clinical.case_extended_form
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_outcome_access ON clinical.case_outcome_form;
CREATE POLICY p_case_outcome_access
    ON clinical.case_outcome_form
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_followup_access ON clinical.case_followup_visit;
CREATE POLICY p_case_followup_access
    ON clinical.case_followup_visit
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_memo_access ON clinical.case_memo;
CREATE POLICY p_case_memo_access
    ON clinical.case_memo
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_case_lock_history_access ON clinical.case_lock_history;
CREATE POLICY p_case_lock_history_access
    ON clinical.case_lock_history
    FOR SELECT
    USING (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_prom_request_access ON survey.prom_request;
CREATE POLICY p_prom_request_access
    ON survey.prom_request
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_prom_draft_access ON survey.prom_draft;
CREATE POLICY p_prom_draft_access
    ON survey.prom_draft
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_prom_submission_access ON survey.prom_submission;
CREATE POLICY p_prom_submission_access
    ON survey.prom_submission
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_prom_answer_access ON survey.prom_answer;
CREATE POLICY p_prom_answer_access
    ON survey.prom_answer
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_message_outbox_access ON messaging.message_outbox;
CREATE POLICY p_message_outbox_access
    ON messaging.message_outbox
    FOR ALL
    USING (app_private.can_access_hospital(hospital_code))
    WITH CHECK (app_private.can_access_hospital(hospital_code));

DROP POLICY IF EXISTS p_export_request_access ON ops.data_export_request;
CREATE POLICY p_export_request_access
    ON ops.data_export_request
    FOR SELECT
    USING (
        app_private.is_admin()
        OR requester_user_id = app_private.current_app_user_id()
    );

DROP POLICY IF EXISTS p_export_request_insert ON ops.data_export_request;
CREATE POLICY p_export_request_insert
    ON ops.data_export_request
    FOR INSERT
    WITH CHECK (
        app_private.is_admin()
        OR requester_user_id = app_private.current_app_user_id()
    );

DROP POLICY IF EXISTS p_export_request_update ON ops.data_export_request;
CREATE POLICY p_export_request_update
    ON ops.data_export_request
    FOR UPDATE
    USING (
        app_private.is_admin()
        OR requester_user_id = app_private.current_app_user_id()
    )
    WITH CHECK (
        app_private.is_admin()
        OR requester_user_id = app_private.current_app_user_id()
    );

COMMIT;
