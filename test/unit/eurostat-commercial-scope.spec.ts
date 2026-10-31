import { EUROSTAT_DESTINATIONS } from '../../src/modules/ingestion/adapters/eurostat/eurostat.config.js';

describe('Eurostat commercial reuse scope', () => {
  it('excludes the United Kingdom from the commercial Eurostat slice', () => {
    expect(EUROSTAT_DESTINATIONS).not.toHaveProperty('UK');
    expect(Object.values(EUROSTAT_DESTINATIONS)).not.toContainEqual(
      expect.objectContaining({ iso3: 'GBR' }),
    );
  });
});
