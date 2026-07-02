-- Registration-activated locals: copy email from linked request
UPDATE users
SET login_email = (
  SELECT rr.email FROM registration_requests rr WHERE rr.id = users.registration_request_id
)
WHERE registration_request_id IS NOT NULL
  AND login_email IS NULL
  AND EXISTS (
    SELECT 1 FROM registration_requests rr WHERE rr.id = users.registration_request_id
  );

-- Legacy hybrid: username was migrated to email
UPDATE users
SET login_email = username
WHERE auth_source = 'oidc'
  AND password_hash IS NOT NULL
  AND password_hash != ''
  AND login_email IS NULL
  AND username LIKE '%@%';

-- OIDC hybrid with profile email stored in oidc_profile_json
UPDATE users
SET login_email = json_extract(oidc_profile_json, '$.email')
WHERE auth_source = 'oidc'
  AND password_hash IS NOT NULL
  AND password_hash != ''
  AND login_email IS NULL
  AND oidc_profile_json IS NOT NULL
  AND json_extract(oidc_profile_json, '$.email') IS NOT NULL
  AND json_extract(oidc_profile_json, '$.email') != '';
