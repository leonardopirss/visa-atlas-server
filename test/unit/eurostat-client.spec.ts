import { jest } from '@jest/globals';
import { EurostatClient } from '../../src/modules/ingestion/adapters/eurostat/eurostat.client.js';
import { EUROSTAT_API_URL } from '../../src/modules/ingestion/adapters/eurostat/eurostat.config.js';

const payload = {
  id: ['reason', 'unit'],
  size: [1, 1],
  value: { '0': 10 },
  dimension: {
    reason: { category: { index: { EMP: 0 } } },
    unit: { category: { index: { PER: 0 } } },
  },
  updated: '2026-09-28T11:00:00+0200',
};

describe('EurostatClient', () => {
  it('requests the official scoped dataset and validates its JSON-stat envelope', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await new EurostatClient().fetchBrazilWorkRelease();

    expect(fetchSpy).toHaveBeenCalledWith(
      EUROSTAT_API_URL,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(result.payload).toMatchObject(payload);
    expect(result.sourcePublishedAt?.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  it('rejects a malformed external payload', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"unexpected":true}', { status: 200 }));

    await expect(new EurostatClient().fetchBrazilWorkRelease()).rejects.toThrow(
      'EUROSTAT_PAYLOAD_INVALID',
    );
  });
});
