import { Global, Module } from '@nestjs/common';
import { createNodeRedisClient } from './node-redis.client.js';
import { RedisService } from './redis.service.js';
import { REDIS_CLIENT_FACTORY } from './redis.types.js';

@Global()
@Module({
  providers: [{ provide: REDIS_CLIENT_FACTORY, useValue: createNodeRedisClient }, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
