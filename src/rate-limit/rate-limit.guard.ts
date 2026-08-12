import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimiterService } from './rate-limiter.service';
import { Algorithm, RateLimitConfig, RateLimitResult } from './interfaces';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator';

/** Configuración por defecto cuando no se especifica en @RateLimit(). */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 60_000, // 1 minuto
  maxRequests: 100,
  algorithm: Algorithm.FIXED_WINDOW,
  keyPrefix: 'ratelimit',
};

/** Decoramos el Request de Express con el resultado del rate limit. */
export interface RateLimitedRequest extends Request {
  rateLimitResult?: RateLimitResult;
}

/**
 * Guard que intercepta TODAS las peticiones y aplica el rate limit.
 *
 * Flujo:
 *   1. Si la ruta tiene @SkipRateLimit() → permite sin más.
 *   2. Si la ruta NO tiene @RateLimit() → se aplica el DEFAULT_GLOBAL
 *      (100 peticiones/min por IP).
 *   3. Si la ruta tiene @RateLimit() → resuelve el identificador (IP o
 *      X-API-Key), fusiona la config con los defaults y consulta al servicio.
 *   4. Si `allowed === false` → lanza HttpException 429 con headers.
 *   5. Si es permitido → guarda el resultado en el request para que el
 *      interceptor escriba los headers X-RateLimit-* en la respuesta.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) Ruta marcada para saltarse el rate limiting
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    // 2) Config del decorador (o undefined si no tiene @RateLimit)
    const options = this.reflector.getAllAndOverride<Partial<RateLimitConfig>>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    // 3) Resolver identificador del cliente
    const identifier = RateLimitGuard.resolveIdentifier(request);

    // Fusionar configuración parcial con los defaults globales.
    // Si la ruta no tiene @RateLimit(), options es undefined y se aplica
    // íntegramente el default global (100 req/min).
    //
    // IMPORTANTE: se añade la ruta al keyPrefix para que cada endpoint tenga
    // su PROPIO contador. Sin esto, todas las rutas con el mismo keyPrefix
    // y mismo identificador compartirían el mismo contador en Redis.
    const config: RateLimitConfig = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...options,
      keyPrefix: `${options?.keyPrefix ?? DEFAULT_RATE_LIMIT_CONFIG.keyPrefix}:${request.path}`,
    };

    // Consultar al orquestador (Bloque 3)
    const result = await this.rateLimiter.checkLimit(identifier, config);

    // 4) Bloqueado → 429 Too Many Requests
    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        result.resetTime - Math.floor(Date.now() / 1000),
      );
      response.setHeader('Retry-After', String(retryAfter));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Demasiadas peticiones. Intenta de nuevo más tarde.',
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 5) Permitido → guardamos el resultado para el interceptor
    request.rateLimitResult = result;

    return true;
  }

  /**
   * Determina quién es el cliente.
   *
   * Prioridad:
   *   1. Header `X-API-Key` → identifica por API key (simula un token).
   *   2. `x-forwarded-for` (primer IP) si existe.
   *   3. `req.ip` (IP directa).
   *
   * Es estático para que otros componentes (ej: el endpoint /rate-limit/status)
   * reutilicen la misma lógica de identificación.
   */
  static resolveIdentifier(request: RateLimitedRequest): string {
    const apiKey = request.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      return `apikey:${apiKey}`;
    }

    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      return `ip:${forwarded.split(',')[0].trim()}`;
    }

    return `ip:${request.ip}`;
  }
}
