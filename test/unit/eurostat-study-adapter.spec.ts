import { readFile } from 'node:fs/promises';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import { EurostatAdapter } from '../../src/modules/ingestion/adapters/eurostat/eurostat.adapter.js';
import { EUROSTAT_BRAZIL_STUDY_CONFIG } from '../../src/modules/ingestion/adapters/eurostat/eurostat.config.js';
import type { EurostatPayload } from '../../src/modules/ingestion/adapters/eurostat/eurostat.types.js';

describe('Eurostat study adapter', () => {
  it('maps EDUC to study without changing the statistical event', async () => {
    const payload = JSON.parse(
      await readFile('test/fixtures/eurostat-study-release.synthetic.json', 'utf8'),
    ) as EurostatPayload;
    const adapter = new EurostatAdapter();
    const observations = adapter.parse(payload, {
      ...EUROSTAT_BRAZIL_STUDY_CONFIG,
      destinationIso2ToIso3: { ES: 'ESP', DE: 'DEU', FR: 'FRA' },
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destinationIso3: 'ESP',
          purpose: VisaPurposeCode.STUDY,
          metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
          sourceCategoryCode: 'EDUC',
          unit: 'PER',
          value: 24n,
          dataStatus: DataStatus.AVAILABLE,
        }),
        expect.objectContaining({
          destinationIso3: 'DEU',
          value: 0n,
          dataStatus: DataStatus.AVAILABLE,
        }),
        expect.objectContaining({
          destinationIso3: 'FRA',
          value: null,
          dataStatus: DataStatus.SUPPRESSED,
        }),
      ]),
    );
  });
});
