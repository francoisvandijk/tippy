-- §4 Schema — Core tables for Phase 1
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE guards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL UNIQUE,
  phone_last4 TEXT,
  referrer_profile_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE guard_qr_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('UNASSIGNED','ASSIGNED')),
  guard_id UUID REFERENCES guards(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
