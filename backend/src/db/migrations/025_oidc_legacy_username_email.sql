-- Legacy OIDC accounts whose username is an email address (any password state).
UPDATE users
SET login_email = lower(trim(username))
WHERE auth_source = 'oidc'
  AND login_email IS NULL
  AND username LIKE '%@%';
