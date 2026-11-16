if (process.env.TEST_DATABASE_URL !== undefined) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const {
  prisma,
  resetDatabase,
  seedDestinationComparisonFixture,
  seedPublishedFixture,
  seedPublishedStudyFixture,
} = await import('./database.js');

try {
  await resetDatabase();
  await seedPublishedFixture();
  await seedPublishedStudyFixture();
  await seedDestinationComparisonFixture();
} finally {
  await prisma.$disconnect();
}
