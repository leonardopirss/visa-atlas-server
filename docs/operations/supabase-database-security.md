# Supabase database boundary

Visa Atlas does not access Supabase from the browser. All database traffic must
pass through the NestJS API and Prisma.

## Required production settings

1. In Supabase, open **Project Settings → API → Data API settings** and disable
   the Data API. If it must remain enabled for another schema, remove `public`
   from the exposed schemas.
2. Use a dedicated PostgreSQL login for the API. Do not use `postgres`, an
   `anon`/publishable key, or a `service_role`/secret key in the application.
3. Store the connection string only as the backend `DATABASE_URL` secret. Never
   create a `VITE_*` variable containing a database password or Supabase secret.
4. Store a separate database-owner connection string as
   `MIGRATION_DATABASE_URL` in the protected GitHub `production` environment.
   The deployment workflow applies committed Prisma migrations with that
   credential before deploying the application. Do not store it in Fly.io or
   use it as the API's runtime `DATABASE_URL`.

Create the API login in the Supabase SQL editor while connected as `postgres`.
Generate the password in a password manager and substitute it only in the SQL
editor; do not add it to this repository:

```sql
create user "visa_atlas_api"
  with password '<GENERATED_PASSWORD>'
  bypassrls
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication;

grant usage on schema public to "visa_atlas_api";
grant select, insert, update, delete
  on all tables in schema public to "visa_atlas_api";
grant usage, select
  on all sequences in schema public to "visa_atlas_api";

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to "visa_atlas_api";
alter default privileges for role postgres in schema public
  grant usage, select on sequences to "visa_atlas_api";
```

Use Supabase's session-pooler connection on port `5432` for the long-running
Fly.io service, with `visa_atlas_api` as the database user. The role has
`BYPASSRLS` because the API is the trusted authorization boundary; its password
must therefore be treated like a root-level application secret and rotated if
it is ever exposed. It deliberately has no schema-creation, role-management, or
database-creation privilege.

The `20261116010000_lock_supabase_access_to_api` migration enables RLS on every
application table, creates no client policies, and revokes current and default
privileges from `anon`, `authenticated`, and `service_role`. This means a
publishable, user, or secret Supabase API key cannot read or mutate application
tables. The migration is also safe on plain PostgreSQL, where those Supabase
roles do not exist.

## Verification

Run this query in the Supabase SQL editor after migration. Every row must show
`rls_enabled = true`:

```sql
select tablename, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'countries', 'citizenships', 'visa_purposes', 'source_organizations',
    'source_datasets', 'dataset_releases', 'comparison_groups',
    'metric_observations', 'visa_programs', 'official_links', 'ingestion_jobs'
  )
order by tablename;
```

Confirm that the three Data API roles have no application-table privileges:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role');
```

The second query must return zero rows. Finally, start the backend with its
production-shaped secret and exercise a normal API read; this confirms that the
dedicated server login still has access.

Create schema changes only through reviewed Prisma migrations. If a table is
created manually under a different owner, repeat the grants/revokes for that
owner and verify the table before exposing a release.

RLS is defense in depth here. API input validation, rate limits, Cloudflare
origin controls, and least-privilege secret handling remain required.
