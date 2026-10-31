import { BlockList, isIP } from 'node:net';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const FLY_CLIENT_IP_HEADER = 'fly-client-ip';
const CLOUDFLARE_CLIENT_IP_HEADER = 'cf-connecting-ip';

@Injectable()
export class CloudflareOriginLockMiddleware implements NestMiddleware {
  private readonly enabled: boolean;
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly cloudflareRanges = new BlockList();

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('CLOUDFLARE_ORIGIN_LOCK_ENABLED', false);
    this.allowedHosts = new Set(
      config
        .get<string>('CLOUDFLARE_ALLOWED_HOSTS', '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    for (const range of config
      .get<string>('CLOUDFLARE_IP_RANGES', '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)) {
      const [address, prefix] = range.split('/');
      const version = isIP(address ?? '');
      if (address && prefix && version !== 0) {
        this.cloudflareRanges.addSubnet(address, Number(prefix), version === 4 ? 'ipv4' : 'ipv6');
      }
    }
  }

  use(request: Request, response: Response, next: NextFunction): void {
    if (!this.enabled) {
      next();
      return;
    }

    const host = this.requestHost(request);
    const flyClientIp = this.singleIpHeader(request, FLY_CLIENT_IP_HEADER);
    const visitorIp = this.singleIpHeader(request, CLOUDFLARE_CLIENT_IP_HEADER);
    if (
      !host ||
      !this.allowedHosts.has(host) ||
      !flyClientIp ||
      !this.isCloudflareIp(flyClientIp) ||
      !visitorIp
    ) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(403).json({
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Request origin is not allowed',
        correlationId: String(response.locals.correlationId ?? 'unknown'),
      });
      return;
    }

    response.locals.clientIp = visitorIp;
    next();
  }

  private requestHost(request: Request): string | null {
    const rawHost = request.headers.host;
    if (!rawHost || rawHost.includes(',') || /[\r\n]/.test(rawHost)) return null;
    const match = /^([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/.exec(rawHost);
    if (!match?.[1]) return null;
    const port = match[2] === undefined ? null : Number(match[2]);
    if (port !== null && (port < 1 || port > 65_535)) return null;
    return match[1].toLowerCase();
  }

  private singleIpHeader(request: Request, name: string): string | null {
    const value = request.header(name)?.trim();
    if (!value || value.includes(',') || isIP(value) === 0) return null;
    return value;
  }

  private isCloudflareIp(address: string): boolean {
    const version = isIP(address);
    return this.cloudflareRanges.check(address, version === 4 ? 'ipv4' : 'ipv6');
  }
}
