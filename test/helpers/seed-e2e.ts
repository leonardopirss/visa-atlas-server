const sourceDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (sourceDatabaseUrl === undefined) {
  throw new Error('DATABASE_URL or TEST_DATABASE_URL is required');
}
const testDatabaseUrl = new URL(sourceDatabaseUrl);
if (process.env.TEST_DATABASE_URL === undefined) {
  const sourceSchema = testDatabaseUrl.searchParams.get('schema') ?? 'public';
  testDatabaseUrl.searchParams.set('schema', `${sourceSchema}_test`);
}
process.env.DATABASE_URL = testDatabaseUrl.toString();

const {
  prisma,
  resetDatabase,
  seedDestinationComparisonFixture,
  seedPublishedFixture,
  seedPublishedStudyFixture,
  seedVisaDecisionInsightsFixture,
} = await import('./database.js');

try {
  await resetDatabase();
  await seedPublishedFixture();
  await seedPublishedStudyFixture();
  await seedDestinationComparisonFixture();
  await seedVisaDecisionInsightsFixture();
} finally {
  await prisma.$disconnect();
}
