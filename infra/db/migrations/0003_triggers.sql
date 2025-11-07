-- §14 Audit triggers
CREATE OR REPLACE FUNCTION log_audit() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(table_name, action, performed_by, payload)
  VALUES (TG_TABLE_NAME, TG_OP, current_setting('app.current_user_id', true)::uuid, to_jsonb(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guards_audit
AFTER INSERT OR UPDATE OR DELETE ON guards
FOR EACH ROW EXECUTE FUNCTION log_audit();
