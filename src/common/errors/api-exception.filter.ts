import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain.error.js';

interface ErrorBody {
  code: string;
  message: string;
  correlationId: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = String(response.locals.correlationId ?? 'unknown');
    const { status, body } = this.mapException(exception, correlationId);

    if (status >= 500) {
      this.logger.error({ correlationId, exception });
    }

    response.status(status).json(body);
  }

  private mapException(
    exception: unknown,
    correlationId: string,
  ): { status: number; body: ErrorBody } {
    if (exception instanceof DomainError) {
      return {
        status: exception.statusCode,
        body: { code: exception.code, message: exception.message, correlationId },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload: unknown = exception.getResponse();
      const message = this.getSafeMessage(payload, exception.message);
      return {
        status,
        body: {
          code: status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`,
          message,
          correlationId,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error', correlationId },
    };
  }

  private getSafeMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') return payload;
    if (typeof payload !== 'object' || payload === null || !('message' in payload)) return fallback;
    const message = payload.message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
}
