-- Preserve email-as-login before renaming legacy hybrid usernames to provider sub.
UPDATE users
SET login_email = username
WHERE auth_source = 'oidc'
  AND password_hash IS NOT NULL
  AND password_hash != ''
  AND login_email IS NULL
  AND username LIKE '%@%';

-- Legacy hybrid accounts: username was email/name before sub-based usernames.
UPDATE users
SET username = oidc_subject
WHERE auth_source = 'oidc'
  AND oidc_subject IS NOT NULL
  AND password_hash IS NOT NULL
  AND password_hash != ''
  AND username != oidc_subject COLLATE NOCASE;
