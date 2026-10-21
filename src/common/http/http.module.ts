import { Module } from '@nestjs/common';
import { CacheControlInterceptor } from './cache-control.interceptor.js';

@Module({ providers: [CacheControlInterceptor], exports: [CacheControlInterceptor] })
export class HttpModule {}
