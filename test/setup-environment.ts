function deriveTestDatabaseUrl(): string {
  const developmentUrl = process.env.DATABASE_URL;
  const configuredTestUrl = process.env.TEST_DATABASE_URL;
  const source = configuredTestUrl ?? developmentUrl;
  if (!source) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required to run tests');

  const testUrl = new URL(source);
  if (!configuredTestUrl) {
    const developmentSchema = testUrl.searchParams.get('schema') ?? 'public';
    testUrl.searchParams.set('schema', `${developmentSchema}_test`);
  }

  const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''));
  const schema = testUrl.searchParams.get('schema') ?? 'public';
  if (!databaseName.toLowerCase().includes('test') && !schema.toLowerCase().includes('test')) {
    throw new Error('TEST_DATABASE_URL must identify a test database or schema');
  }
  if (developmentUrl && testUrl.toString() === new URL(developmentUrl).toString()) {
    throw new Error('TEST_DATABASE_URL must not be the development DATABASE_URL');
  }

  return testUrl.toString();
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = deriveTestDatabaseUrl();
