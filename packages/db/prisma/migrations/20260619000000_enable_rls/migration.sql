-- Enable Row-Level Security on the transaction table.
--
-- FORCE ensures the policy applies to the table owner and superuser
-- connections too — every connection must set app.organization_id via
-- withOrgContext() before touching this table.
--
-- Application code (packages/db/src/client.ts → withOrgContext) opens an
-- interactive transaction, runs:
--   SELECT set_config('app.organization_id', '<orgId>', TRUE)
-- then executes the caller's queries under that context. The TRUE argument
-- scopes the variable to the current transaction only.

ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" FORCE ROW LEVEL SECURITY;

-- Drop first so this migration is safe to re-run after a DB reset.
DROP POLICY IF EXISTS "org_isolation" ON "transaction";

-- FOR ALL covers SELECT, INSERT, UPDATE, DELETE.
-- USING      → rows the current session can read / modify.
-- WITH CHECK → rows the current session is allowed to write.
-- NULLIF(..., '') turns an unset variable into NULL so that an unscoped
-- connection sees zero rows rather than all rows — safe-by-default.
CREATE POLICY "org_isolation"
  ON  "transaction"
  FOR ALL
  USING (
    "organizationId" = NULLIF(current_setting('app.organization_id', TRUE), '')
  )
  WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.organization_id', TRUE), '')
  );
