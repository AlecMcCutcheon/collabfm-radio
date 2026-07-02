-- SSO-only and hybrid OIDC accounts: copy email from stored IdP profile snapshot.
UPDATE users
SET login_email = lower(trim(json_extract(oidc_profile_json, '$.email')))
WHERE auth_source = 'oidc'
  AND login_email IS NULL
  AND oidc_profile_json IS NOT NULL
  AND json_extract(oidc_profile_json, '$.email') IS NOT NULL
  AND json_extract(oidc_profile_json, '$.email') != ''
  AND json_extract(oidc_profile_json, '$.email') LIKE '%@%';
