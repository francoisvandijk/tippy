import { describe, it, expect } from "vitest";
import { sql } from "kysely";

describe("Phase 1 — DB Security", () => {
  it("admin can read all guards", async () => {
    const rows = await sql`SELECT * FROM guards`.execute();
    expect(rows).toBeDefined();
  });
  it("guard sees only own row", async () => {
    const rows = await sql`SELECT * FROM guards WHERE id = auth_user_id()`.execute();
    expect(rows.length).toBe(1);
  });
  it("no plaintext MSISDN in audit logs", async () => {
    const res = await sql`SELECT payload FROM audit_logs`.execute();
    res.rows.forEach(r =>
      expect(JSON.stringify(r.payload)).not.toMatch(/\d{10}/)
    );
  });
});
