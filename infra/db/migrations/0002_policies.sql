-- §8 + §25 — RLS + POPIA enforcement
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID AS $$
  SELECT current_setting('app.current_user_id', true)::uuid;
$$ LANGUAGE SQL STABLE;

CREATE POLICY admin_full ON admins
  USING (true);

CREATE POLICY guard_self ON guards
  USING (id = auth_user_id());

CREATE POLICY audit_admin_only ON audit_logs
  USING (auth_role() = 'admin');

ALTER TABLE guards FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
