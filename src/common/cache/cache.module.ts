import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { PublishedReleaseVersionService } from '../../modules/statistics/services/published-release-version.service.js';
import { CacheStampedeService } from './cache-stampede.service.js';
import { RedisCacheService } from './redis-cache.service.js';

@Global()
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [CacheStampedeService, RedisCacheService, PublishedReleaseVersionService],
  exports: [RedisCacheService, PublishedReleaseVersionService],
})
export class CacheModule {}
