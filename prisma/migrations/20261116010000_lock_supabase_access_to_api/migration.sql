-- The application reads and writes through the NestJS API using a dedicated
-- PostgreSQL role. Supabase Data API roles must not reach these tables.

ALTER TABLE "countries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "citizenships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visa_purposes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_datasets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dataset_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comparison_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metric_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visa_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "official_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_jobs" ENABLE ROW LEVEL SECURITY;

-- Supabase roles are absent from a plain PostgreSQL development database, so
-- revoke their privileges only when the migration is running on Supabase.
DO $security$
DECLARE
  target_role TEXT;
  target_schema TEXT := current_schema();
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I',
        target_schema,
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I',
        target_schema,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        target_schema,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        target_schema,
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM %I',
        target_schema,
        target_role
      );
    END IF;
  END LOOP;

  -- PostgreSQL grants function execution to PUBLIC by default. Do not let a
  -- future RPC function become an accidental path around the API boundary.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    target_schema
  );
END;
$security$;

-- Intentionally no policies: client roles receive neither table grants nor
-- matching RLS policies. The dedicated server role bypasses RLS and its
-- credentials are stored only in the backend secret manager.
