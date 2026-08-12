import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Algorithm } from './rate-limit/interfaces';
import { RateLimit, SkipRateLimit } from './rate-limit/rate-limit.decorator';
import { RateLimiterService } from './rate-limit/rate-limiter.service';
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  RateLimitGuard,
} from './rate-limit/rate-limit.guard';
import type { RateLimitedRequest } from './rate-limit/rate-limit.guard';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/redis')
  async healthCheck() {
    return this.appService.healthCheck();
  }

  // ---- Demo de Rate Limiting ----

  /** Sin límite: siempre disponible. */
  @SkipRateLimit()
  @Get('public')
  getPublic(): string {
    return 'Esto es público: sin rate limit.';
  }

  /** Fixed Window: 5 peticiones por minuto. */
  @RateLimit({
    windowMs: 60_000,
    maxRequests: 5,
    algorithm: Algorithm.FIXED_WINDOW,
  })
  @Get('limited/fixed')
  getFixed(): string {
    return 'Rate limit FIXED WINDOW: max 5/min.';
  }

  /** Sliding Window: 10 peticiones por minuto. */
  @RateLimit({
    windowMs: 60_000,
    maxRequests: 10,
    algorithm: Algorithm.SLIDING_WINDOW,
  })
  @Get('limited/sliding')
  getSliding(): string {
    return 'Rate limit SLIDING WINDOW: max 10/min.';
  }

  /** Token Bucket: 3 por minuto, con burst hasta 3. */
  @RateLimit({
    windowMs: 60_000,
    maxRequests: 3,
    algorithm: Algorithm.TOKEN_BUCKET,
  })
  @Get('limited/token')
  getToken(): string {
    return 'Rate limit TOKEN BUCKET: max 3/min.';
  }

  /**
   * Rate limit por API key: cada valor del header X-API-Key tiene su propio
   * contador independiente (aunque compartan IP).
   */
  @RateLimit({
    windowMs: 60_000,
    maxRequests: 5,
    algorithm: Algorithm.FIXED_WINDOW,
  })
  @Get('limited/api-key')
  getByApiKey(@Req() req: Request): string {
    const key = (req.headers['x-api-key'] as string) ?? '(sin API key)';
    return `Rate limit por API KEY: max 5/min. Tu key: ${key}`;
  }

  /**
   * Muestra el estado actual del rate limit para este caller SIN consumir
   * una petición. Si el caller no tiene @RateLimit() en la ruta, muestra el
   * default global. No consume peticiones (getStatus).
   */
  @SkipRateLimit()
  @Get('rate-limit/status')
  async getStatus(@Req() req: RateLimitedRequest) {
    const identifier = RateLimitGuard.resolveIdentifier(req);

    // Se usa el default global para mostrar el estado por IP/API key.
    const result = await this.rateLimiter.getStatus(
      identifier,
      DEFAULT_RATE_LIMIT_CONFIG,
    );

    return {
      identifier,
      limit: result.limit,
      remaining: result.remaining,
      resetTime: result.resetTime,
      allowed: result.allowed,
      algorithm: DEFAULT_RATE_LIMIT_CONFIG.algorithm,
      windowMs: DEFAULT_RATE_LIMIT_CONFIG.windowMs,
    };
  }
}
