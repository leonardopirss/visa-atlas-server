import { spawnSync } from 'node:child_process';
import { jest } from '@jest/globals';

const nginxTestUrl = process.env.NGINX_TEST_URL;
const describeNginx = nginxTestUrl ? describe : describe.skip;

function compose(...args: string[]): string {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function upstreamsFor(requestIds: readonly string[]): Set<string> {
  const output = compose('logs', '--no-color', 'nginx');
  const upstreams = new Set<string>();
  for (const line of output.split('\n')) {
    if (!requestIds.some((id) => line.includes(`"requestId":"${id}"`))) continue;
    const match = line.match(/"upstream":"([^"]+)"/);
    for (const upstream of (match?.[1] ?? '').split(/,\s*/)) {
      if (upstream && upstream !== '-') upstreams.add(upstream);
    }
  }
  return upstreams;
}

async function request(id: string): Promise<number> {
  const response = await fetch(`${nginxTestUrl}/api/v1/countries?pageSize=1`, {
    headers: { 'x-correlation-id': id },
  });
  return response.status;
}

async function pacedRequests(prefix: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}-${index}`;
    ids.push(id);
    expect(await request(id)).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return ids;
}

describeNginx('Nginx load balancing topology', () => {
  jest.setTimeout(30_000);

  it('distributes traffic and survives passive upstream failure and recovery', async () => {
    const initialIds = await pacedRequests(`balance-${Date.now()}`, 4);
    expect(upstreamsFor(initialIds).size).toBe(2);

    compose('stop', 'api-1');
    try {
      const failureIds = await pacedRequests(`failure-${Date.now()}`, 4);
      expect(upstreamsFor(failureIds).size).toBeGreaterThanOrEqual(1);
    } finally {
      compose('start', 'api-1');
    }

    const recoveryIds: string[] = [];
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && upstreamsFor(recoveryIds).size < 2) {
      const id = `recovery-${Date.now()}-${recoveryIds.length}`;
      recoveryIds.push(id);
      expect(await request(id)).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(upstreamsFor(recoveryIds).size).toBe(2);
  });
});
