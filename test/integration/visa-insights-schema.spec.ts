import { PrismaClient } from '@prisma/client';

type ColumnRow = {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
};

type EnumRow = { enum_name: string; enum_value: string };
type ConstraintRow = { table_name: string; constraint_name: string; definition: string };

describe('visa insights schema migration', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => prisma.$connect());
  afterAll(async () => prisma.$disconnect());

  it('adds composable population and program dimensions with nullable citizenship', async () => {
    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('comparison_groups', 'metric_observations')
        AND column_name IN (
          'population_basis',
          'population_key',
          'program_key',
          'citizenship_iso3'
        )
      ORDER BY table_name, column_name
    `;

    expect(columns).toEqual([
      {
        table_name: 'comparison_groups',
        column_name: 'citizenship_iso3',
        is_nullable: 'YES',
      },
      {
        table_name: 'comparison_groups',
        column_name: 'population_basis',
        is_nullable: 'NO',
      },
      {
        table_name: 'comparison_groups',
        column_name: 'population_key',
        is_nullable: 'NO',
      },
      {
        table_name: 'comparison_groups',
        column_name: 'program_key',
        is_nullable: 'NO',
      },
      {
        table_name: 'metric_observations',
        column_name: 'citizenship_iso3',
        is_nullable: 'YES',
      },
      {
        table_name: 'metric_observations',
        column_name: 'population_basis',
        is_nullable: 'NO',
      },
      {
        table_name: 'metric_observations',
        column_name: 'population_key',
        is_nullable: 'NO',
      },
      {
        table_name: 'metric_observations',
        column_name: 'program_key',
        is_nullable: 'NO',
      },
    ]);
  });

  it('creates the derivation, requirement and pathway tables', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN (
          'metric_derivations',
          'metric_derivation_operands',
          'visa_program_requirements',
          'visa_program_pathways'
        )
      ORDER BY table_name
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'metric_derivation_operands',
      'metric_derivations',
      'visa_program_pathways',
      'visa_program_requirements',
    ]);
  });

  it('adds only the admitted enum values for the v1 release', async () => {
    const values = await prisma.$queryRaw<EnumRow[]>`
      SELECT type.typname AS enum_name, enum.enumlabel AS enum_value
      FROM pg_type type
      JOIN pg_enum enum ON enum.enumtypid = type.oid
      JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
      WHERE type.typname IN ('MetricType', 'PopulationBasis')
        AND namespace.nspname = current_schema()
      ORDER BY type.typname, enum.enumsortorder
    `;
    const byEnum = new Map<string, EnumRow[]>();
    for (const row of values) {
      const entries = byEnum.get(row.enum_name) ?? [];
      entries.push(row);
      byEnum.set(row.enum_name, entries);
    }

    expect(byEnum.get('MetricType')?.map(({ enum_value }) => enum_value)).toEqual(
      expect.arrayContaining([
        'DECISIONS_REFUSED',
        'DECISIONS_WITHDRAWN',
        'DECISIONS_LAPSED',
        'APPROVAL_RATE',
        'REFUSAL_RATE',
        'PENDING_APPLICATIONS',
      ]),
    );
    expect(byEnum.get('MetricType')?.map(({ enum_value }) => enum_value)).not.toEqual(
      expect.arrayContaining(['PROCESSING_TIME_MEDIAN', 'PROCESSING_TIME_P90']),
    );
    expect(byEnum.get('PopulationBasis')?.map(({ enum_value }) => enum_value)).toEqual([
      'CITIZENSHIP',
      'NATIONAL',
    ]);
  });

  it('enforces scope coherence and non-overlapping requirement validity', async () => {
    const constraints = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT relation.relname AS table_name,
             con.conname AS constraint_name,
             pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class relation ON relation.oid = con.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname IN (
          'comparison_groups',
          'metric_observations',
          'visa_program_requirements',
          'visa_program_pathways'
        )
        AND con.contype IN ('c', 'x')
      ORDER BY relation.relname, con.conname
    `;
    const definitions = constraints.map(({ definition }) => definition).join('\n');

    expect(definitions).toContain('population_basis');
    expect(definitions).toContain('population_key');
    expect(definitions).toContain('citizenship_iso3');
    expect(definitions).toContain('EXCLUDE');
    expect(definitions).toContain('daterange');
  });

  it('links requirements and pathways to auditable dataset releases', async () => {
    const foreignKeys = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT relation.relname AS table_name,
             con.conname AS constraint_name,
             pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class relation ON relation.oid = con.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND con.contype = 'f'
        AND relation.relname IN (
          'visa_program_requirements',
          'visa_program_pathways'
        )
      ORDER BY relation.relname, con.conname
    `;

    expect(foreignKeys).toHaveLength(4);
    for (const table of ['visa_program_requirements', 'visa_program_pathways']) {
      const definitions = foreignKeys
        .filter(({ table_name }) => table_name === table)
        .map(({ definition }) => definition)
        .join('\n');
      expect(definitions).toContain('release_id');
      expect(definitions).toContain('dataset_releases');
      expect(definitions).toContain('visa_program_id');
      expect(definitions).toContain('visa_programs');
    }
  });
});
