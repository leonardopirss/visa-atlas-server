import { Prisma, PrismaClient } from '@prisma/client';

const applicationTables = [
  'citizenships',
  'comparison_groups',
  'countries',
  'dataset_releases',
  'ingestion_jobs',
  'metric_observations',
  'official_links',
  'source_datasets',
  'source_organizations',
  'visa_programs',
  'visa_purposes',
] as const;

interface RowSecurityState {
  tablename: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

interface PolicyCount {
  policy_count: bigint;
}

describe('database RLS boundary', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enables RLS on every application table while retaining owner access for the API', async () => {
    const states = await prisma.$queryRaw<RowSecurityState[]>`
      SELECT
        class.relname AS tablename,
        class.relrowsecurity AS rls_enabled,
        class.relforcerowsecurity AS rls_forced
      FROM pg_class AS class
      INNER JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = current_schema()
        AND class.relkind = 'r'
        AND class.relname IN (${Prisma.join(applicationTables)})
      ORDER BY class.relname
    `;

    expect(states).toHaveLength(applicationTables.length);
    expect(states.map((state) => state.tablename)).toEqual(applicationTables);
    expect(states.every((state) => state.rls_enabled)).toBe(true);
    expect(states.every((state) => !state.rls_forced)).toBe(true);
  });

  it('defines no client policy that could expose application rows', async () => {
    const [result] = await prisma.$queryRaw<PolicyCount[]>`
      SELECT COUNT(*) AS policy_count
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename IN (${Prisma.join(applicationTables)})
    `;

    expect(result?.policy_count).toBe(0n);
  });

  it('leaves Supabase Data API roles without application-table privileges', async () => {
    const [result] = await prisma.$queryRaw<PolicyCount[]>`
      SELECT COUNT(*) AS policy_count
      FROM information_schema.role_table_grants
      WHERE table_schema = current_schema()
        AND table_name IN (${Prisma.join(applicationTables)})
        AND grantee IN ('anon', 'authenticated', 'service_role')
    `;

    expect(result?.policy_count).toBe(0n);
  });
});
