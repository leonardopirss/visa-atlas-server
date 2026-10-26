import { PrismaService } from '../../src/common/database/prisma.service.js';
import { CountryCatalogService } from '../../src/modules/countries/services/country-catalog.service.js';
import { prisma, resetDatabase } from '../helpers/database.js';

describe('country catalog synchronization', () => {
  const database = new PrismaService();
  const catalog = new CountryCatalogService(database);

  beforeAll(async () => database.$connect());
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('upserts the full catalog idempotently without statistical observations', async () => {
    await expect(catalog.synchronize()).resolves.toBe(249);
    await expect(catalog.synchronize()).resolves.toBe(249);

    await expect(database.country.count()).resolves.toBe(249);
    await expect(database.metricObservation.count()).resolves.toBe(0);
    await expect(database.country.findUnique({ where: { iso3: 'CAN' } })).resolves.toMatchObject({
      iso2: 'CA',
      namePt: 'Canadá',
      region: 'Américas',
    });
  });
});
