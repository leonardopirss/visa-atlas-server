import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    const ttl = this.config.get<number>('CACHE_TTL_SECONDS', 60);
    response.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${ttl}`);
    return next.handle();
  }
}
