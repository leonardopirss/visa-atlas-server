import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { RedisService } from '../../../common/redis/redis.service.js';

const RELEASE_VERSION_KEY = 'cache:published-release-version';
const RELEASE_VERSION_TTL_MS = 86_400_000;
const VERSION_PATTERN = /^[a-f0-9]{32}$/;

@Injectable()
export class PublishedReleaseVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async current(): Promise<string> {
    const cached = await this.redis.get(RELEASE_VERSION_KEY);
    if (cached.status === 'ok' && cached.value && VERSION_PATTERN.test(cached.value)) {
      return cached.value;
    }
    return this.refresh();
  }

  async refresh(): Promise<string> {
    const releases = await this.prisma.datasetRelease.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, datasetId: true, publishedAt: true },
      orderBy: [{ datasetId: 'asc' }, { id: 'asc' }],
    });
    const version = createHash('sha256')
      .update(
        JSON.stringify(
          releases.map((release) => [
            release.datasetId,
            release.id,
            release.publishedAt?.toISOString() ?? null,
          ]),
        ),
      )
      .digest('hex')
      .slice(0, 32);
    await this.redis.set(RELEASE_VERSION_KEY, version, RELEASE_VERSION_TTL_MS);
    return version;
  }
}
