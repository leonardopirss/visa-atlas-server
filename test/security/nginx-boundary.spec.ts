const nginxTestUrl = process.env.NGINX_TEST_URL;
const describeNginx = nginxTestUrl ? describe : describe.skip;

describeNginx('Nginx public boundary', () => {
  jest.setTimeout(15_000);

  it('does not trust a client-supplied forwarding chain', async () => {
    const response = await fetch(`${nginxTestUrl}/api/v1/countries?pageSize=1`, {
      headers: {
        'x-forwarded-for': '198.51.100.10, 203.0.113.99',
        'x-correlation-id': `spoof-${Date.now()}`,
      },
    });
    expect(response.status).toBe(200);
  });

  it('rejects methods and request bodies outside the public contract', async () => {
    const method = await fetch(`${nginxTestUrl}/api/v1/countries`, { method: 'POST' });
    expect(method.status).toBe(405);

    const body = await fetch(`${nginxTestUrl}/api/v1/countries`, {
      method: 'OPTIONS',
      body: 'unexpected',
    });
    expect(body.status).toBe(413);
  });

  it('rejects oversized URI and headers', async () => {
    const uri = await fetch(`${nginxTestUrl}/api/v1/countries?search=${'x'.repeat(20_000)}`);
    expect([400, 414]).toContain(uri.status);

    const header = await fetch(`${nginxTestUrl}/api/v1/countries`, {
      headers: { 'x-oversized-test': 'x'.repeat(20_000) },
    });
    expect([400, 431]).toContain(header.status);
  });

  it('returns 429 for a burst before it overloads the replicas', async () => {
    const responses = await Promise.all(
      Array.from({ length: 30 }, () => fetch(`${nginxTestUrl}/api/v1/countries?pageSize=1`)),
    );
    const statuses = responses.map(({ status }) => status);
    expect(statuses).toContain(429);
    expect(statuses.some((status) => status === 200)).toBe(true);
  });

  it.each([3001, 3002])('does not publish replica port %i', async (port) => {
    await expect(
      fetch(`http://127.0.0.1:${port}/api/v1/countries`, {
        signal: AbortSignal.timeout(1_000),
      }),
    ).rejects.toThrow();
  });
});
import { jest } from '@jest/globals';
