import { DataStatus } from '@prisma/client';
import { DefaultFiltersService } from '../../src/modules/statistics/services/default-filters.service.js';
import { StatisticsService } from '../../src/modules/statistics/statistics.service.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('statistics integration', () => {
  const database = new PrismaService();
  const defaults = new DefaultFiltersService(database);
  const statistics = new StatisticsService(database, defaults);

  beforeAll(async () => database.$connect());
  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
  });
  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('keeps official zero distinct from unavailable and suppressed values', async () => {
    await prisma.country.create({
      data: { iso3: 'PRT', iso2: 'PT', namePt: 'Portugal', region: 'Europa' },
    });
    const result = await statistics.getMap({
      citizenship: 'BRA',
      purpose: 'WORK',
      metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
    });
    const byIso3 = new Map(result.countries.map((country) => [country.iso3, country.statistic]));
    expect(byIso3.get('DEU')).toMatchObject({ value: 0, dataStatus: DataStatus.AVAILABLE });
    expect(byIso3.get('FRA')).toMatchObject({ value: null, dataStatus: DataStatus.SUPPRESSED });
    expect(byIso3.get('PRT')).toMatchObject({ value: null, dataStatus: DataStatus.UNAVAILABLE });
  });

  it('enforces value and status consistency in PostgreSQL', async () => {
    await expect(
      prisma.metricObservation.create({
        data: {
          releaseId: 'test-release-2025',
          destinationIso3: 'ESP',
          citizenshipIso3: 'BRA',
          purposeCode: 'WORK',
          metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
          sourceCategoryCode: 'INVALID_TEST',
          period: '2025',
          unit: 'PER',
          value: null,
          dataStatus: DataStatus.AVAILABLE,
          comparisonGroupId: 'test-comparable-2025',
        },
      }),
    ).rejects.toThrow();
  });
});
