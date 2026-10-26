import { jest } from '@jest/globals';
import { IrccCanadaClient } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.client.js';

describe('IRCC Canada client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts a bounded official XLSX response', async () => {
    const workbook = Buffer.from('PK synthetic workbook');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(workbook, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'last-modified': 'Mon, 17 Mar 2025 00:00:00 GMT',
        },
      }),
    );
    await expect(new IrccCanadaClient().fetchBrazilWorkRelease()).resolves.toMatchObject({
      workbook,
      sourcePublishedAt: new Date('2025-03-17T00:00:00.000Z'),
    });
  });

  it('rejeita mudança de content-type antes do parsing', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('<html>changed</html>', { headers: { 'content-type': 'text/html' } }),
      );
    await expect(new IrccCanadaClient().fetchBrazilWorkRelease()).rejects.toThrow(
      'IRCC_CANADA_CONTENT_TYPE_INVALID',
    );
  });
});
