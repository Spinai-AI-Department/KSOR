-- KSOR bootstrap template
-- 1) Replace the placeholder values below.
-- 2) Generate password_hash in the application using Argon2id or bcrypt.
-- 3) Run after ksor_schema.sql.

BEGIN;

INSERT INTO ref.hospital (
    hospital_code,
    hospital_name,
    hospital_short_name,
    is_active
) VALUES (
    'H001',
    '예시병원',
    '예시병원',
    true
)
ON CONFLICT (hospital_code) DO UPDATE
SET hospital_name = EXCLUDED.hospital_name,
    hospital_short_name = EXCLUDED.hospital_short_name,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO auth.user_account (
    user_id,
    hospital_code,
    login_id,
    password_hash,
    password_algo,
    full_name,
    email,
    phone,
    role_code,
    is_first_login,
    password_reset_required,
    is_active,
    is_locked,
    failed_login_count,
    created_at,
    updated_at
) VALUES (
    app_private.gen_uuid_pk(),
    NULL,
    'superadmin',
    '<REPLACE_WITH_ARGON2ID_OR_BCRYPT_HASH>',
    'argon2id',
    'KSOR 최고관리자',
    'admin@example.org',
    '010-0000-0000',
    'ADMIN',
    true,
    false,
    true,
    false,
    0,
    now(),
    now()
)
ON CONFLICT ((lower(login_id))) DO NOTHING;

COMMIT;

-- Optional test query for login bootstrap (run through application DB user)
-- SELECT * FROM auth.get_user_auth_snapshot('superadmin');
