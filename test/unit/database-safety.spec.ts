import { assertTestDatabaseUrl } from '../helpers/database.js';

describe('database test safety', () => {
  it('accepts a dedicated test schema', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://user:password@localhost:5432/visa_atlas?schema=public_test',
      ),
    ).not.toThrow();
  });

  it('refuses to reset the development schema', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://user:password@localhost:5432/visa_atlas?schema=public'),
    ).toThrow('Refusing to reset');
  });
});
