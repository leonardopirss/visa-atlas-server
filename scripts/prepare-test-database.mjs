import { spawnSync } from 'node:child_process';

function deriveTestDatabaseUrl() {
  const developmentUrl = process.env.DATABASE_URL;
  const configuredTestUrl = process.env.TEST_DATABASE_URL;
  const source = configuredTestUrl ?? developmentUrl;
  if (!source) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required to prepare tests');

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

const prismaExecutable = new URL('../node_modules/prisma/build/index.js', import.meta.url);
const result = spawnSync(process.execPath, [prismaExecutable.pathname, 'migrate', 'deploy'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, DATABASE_URL: deriveTestDatabaseUrl(), NODE_ENV: 'test' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
