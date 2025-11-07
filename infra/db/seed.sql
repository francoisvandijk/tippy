-- Deterministic seed data (placeholders)
INSERT INTO admins (id, email, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@tippy.local', 'admin')
ON CONFLICT DO NOTHING;
