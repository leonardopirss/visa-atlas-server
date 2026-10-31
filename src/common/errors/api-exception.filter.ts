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

const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P2024']);

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
      this.logger.error({
        event: 'http.request.failed',
        correlationId,
        errorType: exception instanceof Error ? exception.name : typeof exception,
      });
    }

    response.setHeader('Cache-Control', 'no-store');
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

    if (this.isDatabaseUnavailable(exception)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          correlationId,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error', correlationId },
    };
  }

  private isDatabaseUnavailable(exception: unknown): boolean {
    if (!(exception instanceof Error)) return false;
    const code = (exception as Error & { code?: unknown }).code;
    if (typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code)) return true;
    return (
      exception.name === 'PrismaClientInitializationError' ||
      (exception.name === 'PrismaClientUnknownRequestError' &&
        exception.message.includes('statement timeout'))
    );
  }

  private getSafeMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') return payload;
    if (typeof payload !== 'object' || payload === null || !('message' in payload)) return fallback;
    const message = payload.message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
}
