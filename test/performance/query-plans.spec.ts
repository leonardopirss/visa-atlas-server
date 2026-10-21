import { Prisma, PrismaClient } from '@prisma/client';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('critical query plans', () => {
  const database = new PrismaClient();

  beforeAll(async () => database.$connect());
  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await database.$executeRaw(Prisma.sql`ANALYZE metric_observations`);
  });
  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('has the composite index required by the map query', async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'metric_observations'
    `;
    expect(indexes.map(({ indexname }) => indexname)).toContain(
      'metric_observations_citizenship_iso3_purpose_period_metric__idx',
    );
  });

  it('can explain the country-period lookup without changing data', async () => {
    const plan = await database.$queryRaw<Array<{ 'QUERY PLAN': string }>>(Prisma.sql`
      EXPLAIN SELECT * FROM metric_observations
      WHERE destination_iso3 = ${'ESP'} AND period = ${'2025'}
    `);
    expect(plan.length).toBeGreaterThan(0);
  });
});
