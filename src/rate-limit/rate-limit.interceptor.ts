import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { RateLimitedRequest } from './rate-limit.guard';

/**
 * Interceptor que añade los headers estándar de rate limiting a la respuesta.
 *
 * Los headers siguen la convención de la industria (RFC y proveedores como
 * GitHub/Stripe):
 *   - X-RateLimit-Limit:     el máximo configurado
 *   - X-RateLimit-Remaining: cuántas quedan
 *   - X-RateLimit-Reset:     timestamp Unix (segundos) del reset
 *
 * El resultado lo deja el Guard en `request.rateLimitResult`.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        const result = request.rateLimitResult;
        if (!result) {
          return;
        }

        response.setHeader('X-RateLimit-Limit', String(result.limit));
        response.setHeader('X-RateLimit-Remaining', String(result.remaining));
        response.setHeader('X-RateLimit-Reset', String(result.resetTime));
      }),
    );
  }
}
