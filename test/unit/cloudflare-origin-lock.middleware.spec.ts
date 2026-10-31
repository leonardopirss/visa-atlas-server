import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { CloudflareOriginLockMiddleware } from '../../src/common/http/cloudflare-origin-lock.middleware.js';

function request(headers: Record<string, string>): Request {
  return {
    headers,
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

function response(): { value: Response; status: jest.Mock; json: jest.Mock } {
  const status = jest.fn();
  const json = jest.fn();
  const result = {
    locals: { correlationId: 'test-correlation' },
    setHeader: jest.fn(),
    status,
    json,
  };
  status.mockReturnValue(result);
  return { value: result as unknown as Response, status, json };
}

describe('CloudflareOriginLockMiddleware', () => {
  const config = new ConfigService({
    CLOUDFLARE_ORIGIN_LOCK_ENABLED: true,
    CLOUDFLARE_ALLOWED_HOSTS: 'api.example.com',
    CLOUDFLARE_IP_RANGES: '173.245.48.0/20,2400:cb00::/32',
  });

  it('accepts a Cloudflare request and exposes the validated visitor IP', () => {
    const middleware = new CloudflareOriginLockMiddleware(config);
    const res = response();
    const next: NextFunction = jest.fn();

    middleware.use(
      request({
        host: 'api.example.com',
        'fly-client-ip': '173.245.48.10',
        'cf-connecting-ip': '198.51.100.20',
      }),
      res.value,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.value.locals.clientIp).toBe('198.51.100.20');
  });

  it.each([
    [
      'the Fly hostname',
      {
        host: 'visa-atlas.fly.dev',
        'fly-client-ip': '173.245.48.10',
        'cf-connecting-ip': '198.51.100.20',
      },
    ],
    [
      'a non-Cloudflare source',
      {
        host: 'api.example.com',
        'fly-client-ip': '203.0.113.10',
        'cf-connecting-ip': '198.51.100.20',
      },
    ],
    [
      'a malformed host',
      {
        host: 'api.example.com#bypass',
        'fly-client-ip': '173.245.48.10',
        'cf-connecting-ip': '198.51.100.20',
      },
    ],
    [
      'a spoofed forwarding chain',
      {
        host: 'api.example.com',
        'fly-client-ip': '173.245.48.10, 203.0.113.10',
        'cf-connecting-ip': '198.51.100.20',
      },
    ],
    ['a missing visitor IP', { host: 'api.example.com', 'fly-client-ip': '173.245.48.10' }],
  ])('rejects %s', (_scenario, headers) => {
    const middleware = new CloudflareOriginLockMiddleware(config);
    const res = response();
    const next: NextFunction = jest.fn();

    middleware.use(request(headers), res.value, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ORIGIN_NOT_ALLOWED' }));
  });

  it('is transparent when the lock is disabled', () => {
    const middleware = new CloudflareOriginLockMiddleware(new ConfigService({}));
    const next: NextFunction = jest.fn();

    middleware.use(request({ host: 'localhost:3000' }), response().value, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
