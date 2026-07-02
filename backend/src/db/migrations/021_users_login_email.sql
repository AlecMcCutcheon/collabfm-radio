ALTER TABLE users ADD COLUMN login_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_email ON users(login_email) WHERE login_email IS NOT NULL;
